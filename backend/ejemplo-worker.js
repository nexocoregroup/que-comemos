// Backend de ejemplo para «¿Qué comemos?», en Cloudflare Workers.
//
// Existe por una sola razón: que la clave del proveedor de modelo no viva en el
// JavaScript de la app ni dentro del APK. La app manda JSON aquí; aquí vive la
// clave; aquí se habla con el proveedor. Si este servicio no existe, la app
// sigue funcionando entera —solo sin transcripción, sin lectura de facturas y
// sin asistente—.
//
// Tres rutas, las del contrato de docs/backend.md:
//   POST /transcribe  { audio, mimeType, idioma }        -> { texto, confianza }
//   POST /chat        { mensajes, herramientas, contexto } -> { respuesta, acciones }
//   POST /vision      { imagenes, pista }                -> { fecha, establecimiento, lineas }
//   GET  /salud                                          -> { ok, capacidades }
//
// Lo que este servicio NO hace, y no debe hacer nunca: guardar las imágenes,
// escribir en el registro el contenido de una factura o de un mensaje, y
// devolver JavaScript. Solo JSON, solo de paso.
//
// Desplegarlo: backend/README.md. Variables: .env.example.

// La API de Anthropic recibe texto, imágenes y PDF; audio no. Por eso /chat y
// /vision hablan con Anthropic y /transcribe habla con un servicio de voz a
// texto aparte, con la forma de OpenAI. Está explicado en docs/backend.md.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Las mismas unidades de src/model.js. Pedírselas al modelo por su nombre evita
// que devuelva «kg» o «bolsa», que la app no sabría en qué convertir.
const UNIDADES = ['unidad', 'lb', 'taza', 'lata', 'paquete', 'rueda', 'rebanada'];
const IMAGENES_ACEPTADAS = { '/9j/': 'image/jpeg', iVBORw0KGgo: 'image/png', R0lGOD: 'image/gif', UklGR: 'image/webp' };
const EXTENSIONES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' };

const SISTEMA_CHAT = `Ayudas a una familia dominicana a llevar la comida de su casa en la app «¿Qué comemos?».
Respondes en español, en dos o tres frases, sin tecnicismos y sin emojis.
Cuando la persona pida algo que la app sabe hacer, llama a la herramienta que corresponda en vez de explicar cómo hacerlo a mano.
Nunca inventes alimentos, cantidades ni precios: si falta un dato para llamar a una herramienta, pídelo en una sola pregunta.
Si algo no se puede hacer con las herramientas que tienes, dilo claro y en una frase.`;

const SISTEMA_FACTURA = `Lees fotos de facturas y recibos de colmado, supermercado y mercado dominicanos.
Devuelves una línea por producto comprado. No inventes líneas: si algo no se lee, transcribe lo que se ve y baja la confianza.
No incluyas totales, subtotales, ITBIS, propinas, descuentos ni medios de pago: solo productos.
textoOriginal es lo que dice la factura, tal cual, abreviaturas incluidas.
nombreSugerido es el nombre común del alimento en República Dominicana, en singular y con mayúscula inicial: «Arroz», «Salami», «Plátano».
cantidad y unidad son lo que se compró. Si la factura no dice cantidad, pon 1 y unidad «unidad».
La unidad debe ser una de: ${UNIDADES.join(', ')}. Una libra es «lb»; un galón, un litro o un kilo conviértelos a la unidad más cercana de la lista y baja la confianza.
confianza va de 0 a 1 y es lo seguro que estás de esa línea entera.
fecha es la de la compra en formato AAAA-MM-DD, o cadena vacía si no se lee. establecimiento es el nombre del negocio, o cadena vacía.`;

// El esquema que se le exige a la respuesta del modelo. Se queda en el
// subconjunto seguro —sin tipos opcionales— y los vacíos se convierten a null
// al final, que es lo que espera la app.
const ESQUEMA_FACTURA = {
  type: 'object',
  properties: {
    fecha: { type: 'string' },
    establecimiento: { type: 'string' },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          textoOriginal: { type: 'string' },
          nombreSugerido: { type: 'string' },
          cantidad: { type: 'number' },
          unidad: { type: 'string', enum: UNIDADES },
          confianza: { type: 'number' }
        },
        required: ['textoOriginal', 'nombreSugerido', 'cantidad', 'unidad', 'confianza'],
        additionalProperties: false
      }
    }
  },
  required: ['fecha', 'establecimiento', 'lineas'],
  additionalProperties: false
};

// --- Cosas de HTTP -------------------------------------------------------

const listaOrigenes = env => String(env.ORIGEN_PERMITIDO || '').split(',').map(uno => uno.trim()).filter(Boolean);
// Se devuelve el origen exacto que pidió, nunca la lista entera. Un `*` abre el
// servicio a cualquier página del navegador del usuario: sirve para probar en
// tu máquina y para nada más.
function origenPermitido(peticion, env) {
  const origen = peticion.headers.get('Origin') || '';
  const lista = listaOrigenes(env);
  if (lista.includes('*')) return '*';
  return origen && lista.includes(origen) ? origen : '';
}
const cabecerasCors = origen => (origen ? {
  'Access-Control-Allow-Origin': origen,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin'
} : {});
const responder = (datos, estado, origen) => new Response(JSON.stringify(datos), {
  status: estado,
  // Siempre JSON. Este servicio no devuelve HTML ni JavaScript jamás: lo que
  // manda se ejecutaría dentro de la app de alguien.
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...cabecerasCors(origen) }
});
const fallar = (mensaje, estado, origen) => responder({ error: mensaje }, estado, origen);

// Comparar con === se corta en la primera letra distinta, y esa diferencia de
// tiempo deja adivinar el token letra por letra. Aquí siempre se recorre todo.
function igualesEnTiempoConstante(uno, dos) {
  const codificar = new TextEncoder();
  const a = codificar.encode(uno);
  const b = codificar.encode(dos);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferencia === 0;
}
function tokenValido(peticion, env) {
  const esperado = String(env.TOKEN_APP || '');
  if (!esperado) return true;
  const traido = (peticion.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return igualesEnTiempoConstante(traido, esperado);
}

// --- base64 --------------------------------------------------------------

const limpiarBase64 = dato => String(dato || '').replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
// Cuánto pesa de verdad, sin decodificar: cuatro caracteres de base64 son tres
// bytes. Sirve para rechazar una foto enorme antes de gastar memoria en ella.
const pesoDeBase64 = limpio => Math.floor((limpio.length * 3) / 4);
function bytesDeBase64(limpio) {
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
// El tipo se saca de los primeros bytes de la imagen, no de lo que diga quien
// la manda: la app no envía mimeType en /vision y el modelo lo necesita.
const tipoDeImagen = limpio => Object.entries(IMAGENES_ACEPTADAS).find(([firma]) => limpio.startsWith(firma))?.[1] || '';

// --- Proveedor de modelo -------------------------------------------------

class FalloDeProveedor extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}
// El código del proveedor se traduce al que le sirve a la app, que decide con
// él si reintenta. Un 401 de Anthropic significa que TU clave está mal: eso no
// se arregla reintentando, así que sale como 500 y no como 401 —el 401 de esta
// API quiere decir «el token de la app no vale».
function estadoTraducido(estado) {
  if (estado === 429) return 429;
  if (estado === 413) return 413;
  if (estado >= 500 || estado === 529) return 503;
  return 500;
}
// Los modelos económicos tipo Haiku 4.5 no aceptan ni pensamiento adaptativo ni
// «effort»: mandárselos devuelve un 400. Los grandes sí, y ahí está la
// diferencia entre leer una factura arrugada y no leerla.
const razona = modelo => !/haiku/i.test(modelo);
// Y el respaldo automático —si un modelo declina, el mismo llamado se reintenta
// solo en otro— existe en los modelos grandes. Quitarlo es borrar esta línea y
// el campo «fallbacks».
const conRespaldo = modelo => /opus-5|fable/i.test(modelo);
const razonamiento = modelo => (razona(modelo) ? { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } } : {});

async function llamarAnthropic(env, cuerpo) {
  if (!env.ANTHROPIC_API_KEY) throw new FalloDeProveedor(500, 'El servicio no tiene clave de modelo configurada.');
  const respaldo = conRespaldo(cuerpo.model);
  const respuesta = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      ...(respaldo ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {})
    },
    body: JSON.stringify(respaldo ? { fallbacks: 'default', ...cuerpo } : cuerpo)
  });
  // El cuerpo del error del proveedor puede traer de vuelta parte de lo que se
  // mandó —la factura incluida—. Se mira el código y se tira el resto.
  if (!respuesta.ok) throw new FalloDeProveedor(estadoTraducido(respuesta.status), 'El servicio de modelo falló.');
  const datos = await respuesta.json();
  if (datos.stop_reason === 'refusal') throw new FalloDeProveedor(422, 'El modelo no quiso responder a esto.');
  if (datos.stop_reason === 'max_tokens') throw new FalloDeProveedor(500, 'La respuesta salió demasiado larga. Prueba con menos líneas o menos fotos.');
  return datos;
}
const modeloDe = (env, datos) => String((datos.economico ? env.MODELO_ECONOMICO : env.MODELO) || env.MODELO || 'claude-opus-5');
const textoDe = datos => (datos.content || []).filter(bloque => bloque.type === 'text').map(bloque => bloque.text).join('\n').trim();

// --- /transcribe ---------------------------------------------------------

async function transcribir(datos, env) {
  const limpio = limpiarBase64(datos.audio);
  if (!limpio) throw new FalloDeProveedor(400, 'Falta el audio.');
  if (!env.TRANSCRIPCION_URL || !env.TRANSCRIPCION_CLAVE) throw new FalloDeProveedor(501, 'Este servicio no tiene transcripción configurada.');
  const maximo = Number(env.MAX_AUDIO_MB || 8) * 1024 * 1024;
  if (pesoDeBase64(limpio) > maximo) throw new FalloDeProveedor(413, `El audio pasa de ${env.MAX_AUDIO_MB || 8} MB.`);
  let bytes;
  try { bytes = bytesDeBase64(limpio); } catch { throw new FalloDeProveedor(400, 'El audio no es base64 válido.'); }
  const tipo = String(datos.mimeType || 'audio/webm').split(';')[0].trim();
  const formulario = new FormData();
  // El nombre del archivo importa: el servicio de voz decide el formato por la
  // extensión, no por el tipo que se declare.
  formulario.append('file', new Blob([bytes], { type: tipo }), `audio.${EXTENSIONES[tipo] || 'webm'}`);
  formulario.append('model', env.TRANSCRIPCION_MODELO || 'whisper-1');
  // verbose_json trae los segmentos, y de ahí sale la confianza. Sin esto no
  // hay forma honesta de saber si entendió o se lo inventó.
  formulario.append('response_format', 'verbose_json');
  // «es-DO» es lo que manda la app; estos servicios quieren solo «es».
  if (datos.idioma) formulario.append('language', String(datos.idioma).slice(0, 2).toLowerCase());
  const respuesta = await fetch(env.TRANSCRIPCION_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.TRANSCRIPCION_CLAVE}` }, body: formulario });
  if (!respuesta.ok) throw new FalloDeProveedor(estadoTraducido(respuesta.status), 'El servicio de transcripción falló.');
  const salida = await respuesta.json();
  const segmentos = Array.isArray(salida.segments) ? salida.segments : [];
  // avg_logprob es el logaritmo de la probabilidad media: elevado a e vuelve a
  // ser un número entre 0 y 1. Sin segmentos se devuelve null antes que un
  // número inventado, para que la app pueda decir «revísalo».
  const media = segmentos.length ? segmentos.reduce((suma, uno) => suma + Number(uno.avg_logprob || 0), 0) / segmentos.length : null;
  return { texto: String(salida.text || '').trim(), confianza: media === null ? null : Math.round(Math.min(1, Math.exp(media)) * 100) / 100 };
}

// --- /chat ---------------------------------------------------------------

function herramientasTraducidas(lista) {
  return (Array.isArray(lista) ? lista : []).map(una => ({
    name: String(una.nombre || ''),
    description: String(una.descripcion || ''),
    // strict obliga a que los argumentos cumplan el esquema al pie de la letra:
    // la app recibe acciones que puede ejecutar sin revisarlas campo por campo.
    strict: true,
    input_schema: una.parametros && typeof una.parametros === 'object'
      ? { type: 'object', properties: {}, required: [], additionalProperties: false, ...una.parametros }
      : { type: 'object', properties: {}, required: [], additionalProperties: false }
  })).filter(una => una.name);
}
async function conversar(datos, env) {
  const mensajes = (Array.isArray(datos.mensajes) ? datos.mensajes : [])
    .filter(uno => uno && typeof uno.contenido === 'string' && uno.contenido.trim())
    .map(uno => ({ role: uno.rol === 'asistente' ? 'assistant' : 'user', content: uno.contenido }));
  if (!mensajes.length) throw new FalloDeProveedor(400, 'Falta el mensaje.');
  if (mensajes[0].role !== 'user') throw new FalloDeProveedor(400, 'La conversación tiene que empezar por la persona.');
  const herramientas = herramientasTraducidas(datos.herramientas);
  const contexto = datos.contexto && typeof datos.contexto === 'object' ? JSON.stringify(datos.contexto) : '';
  const modelo = modeloDe(env, datos);
  const salida = await llamarAnthropic(env, {
    model: modelo,
    max_tokens: 8192,
    ...razonamiento(modelo),
    system: contexto ? `${SISTEMA_CHAT}\n\nLo que hay en la casa ahora mismo, en JSON:\n${contexto}` : SISTEMA_CHAT,
    messages: mensajes,
    ...(herramientas.length ? { tools: herramientas } : {})
  });
  return {
    respuesta: textoDe(salida),
    // Cada tool_use es una acción que la app ejecutará. Se pasan tal cual: qué
    // significa «agregar_a_canasta» lo sabe la app, no este servicio.
    acciones: (salida.content || []).filter(bloque => bloque.type === 'tool_use').map(bloque => ({ action: bloque.name, arguments: bloque.input }))
  };
}

// --- /vision -------------------------------------------------------------

async function leerFactura(datos, env) {
  const imagenes = (Array.isArray(datos.imagenes) ? datos.imagenes : []).map(limpiarBase64).filter(Boolean);
  if (!imagenes.length) throw new FalloDeProveedor(400, 'Falta la imagen.');
  const maximas = Number(env.MAX_IMAGENES || 4);
  if (imagenes.length > maximas) throw new FalloDeProveedor(400, `No se pueden mandar más de ${maximas} imágenes a la vez.`);
  const maximo = Number(env.MAX_IMAGEN_MB || 4) * 1024 * 1024;
  const bloques = imagenes.map(imagen => {
    // El freno de mano: sin esto una foto enorme puede costar varios dólares o
    // tumbar el servicio, y quien paga eres tú.
    if (pesoDeBase64(imagen) > maximo) throw new FalloDeProveedor(413, `Cada imagen tiene que pesar menos de ${env.MAX_IMAGEN_MB || 4} MB.`);
    const tipo = tipoDeImagen(imagen);
    if (!tipo) throw new FalloDeProveedor(400, 'La imagen tiene que ser JPEG, PNG, GIF o WebP.');
    return { type: 'image', source: { type: 'base64', media_type: tipo, data: imagen } };
  });
  const pista = String(datos.pista || 'factura').slice(0, 40);
  const modelo = modeloDe(env, datos);
  const ajustes = razonamiento(modelo);
  const salida = await llamarAnthropic(env, {
    model: modelo,
    max_tokens: 8192,
    ...ajustes,
    // El esquema se exige aquí: así la respuesta llega ya con la forma del
    // contrato y no hay que adivinar nada leyendo texto libre.
    output_config: { ...ajustes.output_config, format: { type: 'json_schema', schema: ESQUEMA_FACTURA } },
    system: SISTEMA_FACTURA,
    messages: [{ role: 'user', content: [...bloques, { type: 'text', text: `Esto es una ${pista}. Devuelve los productos comprados.` }] }]
  });
  let leido;
  try { leido = JSON.parse(textoDe(salida)); } catch { throw new FalloDeProveedor(500, 'El modelo devolvió algo que no se pudo leer.'); }
  return {
    // Vacío es «no se lee», y eso se dice con null, no con una cadena en
    // blanco que la app tendría que interpretar.
    fecha: leido.fecha || null,
    establecimiento: leido.establecimiento || null,
    lineas: (Array.isArray(leido.lineas) ? leido.lineas : []).map(linea => ({
      textoOriginal: String(linea.textoOriginal || ''),
      nombreSugerido: String(linea.nombreSugerido || ''),
      cantidad: Number(linea.cantidad) > 0 ? Number(linea.cantidad) : 1,
      unidad: UNIDADES.includes(linea.unidad) ? linea.unidad : 'unidad',
      confianza: Math.max(0, Math.min(1, Number(linea.confianza) || 0))
    }))
  };
}

// --- La puerta -----------------------------------------------------------

const RUTAS = { transcribe: transcribir, chat: conversar, vision: leerFactura };

export default {
  async fetch(peticion, env) {
    const inicio = Date.now();
    const origen = origenPermitido(peticion, env);
    const camino = new URL(peticion.url).pathname.replace(/^\/+|\/+$/g, '');
    // El navegador pregunta antes de mandar nada. Si el origen no está en la
    // lista, aquí se acaba la conversación.
    if (peticion.method === 'OPTIONS') return new Response(null, { status: origen ? 204 : 403, headers: cabecerasCors(origen) });
    if (!origen) return fallar('Origen no permitido.', 403, '');
    if (!tokenValido(peticion, env)) return fallar('Token no válido.', 401, origen);
    if (camino === 'salud') {
      return responder({
        ok: true,
        // Qué está configurado, nunca con qué. Aquí no sale ninguna clave.
        capacidades: {
          transcribe: Boolean(env.TRANSCRIPCION_URL && env.TRANSCRIPCION_CLAVE),
          chat: Boolean(env.ANTHROPIC_API_KEY),
          vision: Boolean(env.ANTHROPIC_API_KEY)
        },
        modelo: String(env.MODELO || 'claude-opus-5')
      }, 200, origen);
    }
    const ruta = RUTAS[camino];
    if (!ruta) return fallar('Esa ruta no existe.', 404, origen);
    if (peticion.method !== 'POST') return fallar('Esta ruta solo acepta POST.', 405, origen);
    let estado = 200;
    try {
      let datos;
      try { datos = await peticion.json(); } catch { throw new FalloDeProveedor(400, 'El cuerpo tiene que ser JSON.'); }
      if (!datos || typeof datos !== 'object') throw new FalloDeProveedor(400, 'El cuerpo tiene que ser un objeto JSON.');
      return responder(await ruta(datos, env), 200, origen);
    } catch (fallo) {
      estado = fallo instanceof FalloDeProveedor ? fallo.estado : 500;
      // Un error inesperado no cuenta su vida: el mensaje de una excepción trae
      // rutas, cabeceras y a veces un pedazo de lo que se mandó.
      return fallar(fallo instanceof FalloDeProveedor ? fallo.message : 'El servicio falló.', estado, origen);
    } finally {
      // Registro deliberadamente pobre: qué ruta, con qué código y cuánto
      // tardó. Ni el texto, ni la imagen, ni el token tocan los registros de
      // Cloudflare, que se quedan guardados donde el usuario no los ve.
      console.log(JSON.stringify({ ruta: camino, estado, ms: Date.now() - inicio }));
    }
  }
};
