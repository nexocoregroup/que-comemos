// Puente con el servicio que el usuario despliega por su cuenta. Esto es
// transporte y nada más: no sabe qué es un producto, una canasta ni una compra.
// Manda JSON a una dirección y devuelve lo que llegue. El dominio sigue
// viviendo en model.js, y así se queda.
//
// La regla que no se negocia: aquí nunca vive una clave. Lo único que se guarda
// en el dispositivo es la dirección del backend propio y, si ese backend lo
// emite, un token de sesión que él mismo puede revocar. La clave del proveedor
// de modelo se queda en el backend, fuera del JavaScript y fuera del APK.
//
// Y nada de esto hace falta: sin configurar, la app entera —productos,
// canasta, menú, compras, inventario— funciona igual y sin conexión.
export const CAPABILITIES = ['transcribe', 'chat', 'vision'];
// Clave propia, aparte de la de los datos de la casa: un respaldo exportado e
// importado en otro teléfono no debe arrastrar la dirección ni el token del
// primero.
export const CONFIG_KEY = 'que-comemos-proveedores-v1';
// Espera creciente entre reintentos. Dos números, no una fórmula: son medio
// segundo y segundo y medio, y así se leen.
export const ESPERAS = [500, 1500];
const NOMBRES = { transcribe: 'transcribir', chat: 'conversar', vision: 'leer facturas' };

// Aviso obligatorio antes de mandar algo fuera del dispositivo. Quien use
// callProvider tiene que enseñar el aviso de su capacidad y esperar que el
// usuario confirme: el resto de la app no sale de aquí nunca, así que la
// primera vez que algo sale hay que decirlo con todas las letras.
export const AVISO_ENVIO = {
  transcribe: {
    titulo: 'Se va a enviar tu grabación',
    detalle: 'El audio sale de este dispositivo hacia el servicio que configuraste en Ajustes, y de ahí al proveedor de modelo que hayas elegido. La app no guarda la grabación ni la manda a ningún otro lado.',
    confirmar: 'Enviar el audio',
    cancelar: 'Escribirlo a mano'
  },
  chat: {
    titulo: 'Se va a enviar lo que escribiste',
    detalle: 'Tu mensaje sale hacia el servicio que configuraste en Ajustes, junto con los nombres de los alimentos y las cantidades que hagan falta para entenderlo. No se envían tus compras ni tu historial completo.',
    confirmar: 'Enviar el mensaje',
    cancelar: 'Cancelar'
  },
  vision: {
    titulo: 'Se va a enviar la foto de la factura',
    detalle: 'La imagen completa sale hacia el servicio que configuraste en Ajustes, y de ahí al proveedor de modelo. Una factura dice dónde compraste, qué compraste y cuánto pagaste: mira la foto antes de mandarla.',
    confirmar: 'Enviar la foto',
    cancelar: 'Escribir la compra a mano'
  }
};

const texto = valor => String(valor ?? '').trim();
// Todo lo que entra se normaliza: da igual si viene del almacenamiento, de un
// formulario a medio llenar o de un respaldo viejo. Siempre sale la misma
// forma, con las tres capacidades presentes y en booleano.
function normalizar(bruta) {
  const datos = bruta && typeof bruta === 'object' ? bruta : {};
  const activas = datos.enabled && typeof datos.enabled === 'object' ? datos.enabled : {};
  return {
    // Sin barra al final: abajo se pega la capacidad y dos barras seguidas son
    // un 404 en la mitad de los servidores.
    baseUrl: texto(datos.baseUrl).replace(/\/+$/, ''),
    token: texto(datos.token),
    enabled: Object.fromEntries(CAPABILITIES.map(capacidad => [capacidad, activas[capacidad] === true])),
    // Cualquier cosa que no sea el simulador es el backend propio. El
    // simulador se elige a mano, nunca se hereda de un valor raro.
    provider: datos.provider === 'mock' ? 'mock' : 'backend'
  };
}

export function readConfig(storage = globalThis.localStorage) {
  // Una configuración ilegible no puede tumbar la app: se lee como si no
  // hubiera nada, que es exactamente el estado en el que todo lo manual sigue
  // funcionando.
  try { return normalizar(JSON.parse(storage?.getItem(CONFIG_KEY) || '{}')); }
  catch { return normalizar(null); }
}

export function writeConfig(config, storage = globalThis.localStorage) {
  const limpia = normalizar(config);
  storage?.setItem(CONFIG_KEY, JSON.stringify(limpia));
  return limpia;
}

// Responde «¿puede el usuario contar con esto?». El simulador no cuenta: se
// inventa las respuestas, y presentarlo como capacidad configurada sería vender
// como funcionando algo que ni siquiera sale del dispositivo.
export function isConfigured(capability, config = readConfig()) {
  const actual = normalizar(config);
  return CAPABILITIES.includes(capability) && actual.enabled[capability] && Boolean(actual.baseUrl);
}

// El texto que se enseña en Ajustes. Nombra la dirección —no es un secreto— y
// dice si hay token, pero nunca escribe el token.
export function describeConfig(config = readConfig()) {
  const actual = normalizar(config);
  if (actual.provider === 'mock') return 'Modo de prueba: las respuestas son inventadas y nada sale de este dispositivo.';
  if (!actual.baseUrl) return 'Sin servicio configurado. La app funciona completa sin él: solo quedan fuera la transcripción, la lectura de facturas y el asistente.';
  const activas = CAPABILITIES.filter(capacidad => actual.enabled[capacidad]).map(capacidad => NOMBRES[capacidad]);
  const partes = [`Servicio propio en ${actual.baseUrl}`, actual.token ? 'con token de sesión' : 'sin token de sesión'];
  // Sobre http lo que se manda viaja en claro por la red, y una factura o una
  // grabación de la casa no es cosa de decirlo en voz baja.
  if (/^http:\/\//i.test(actual.baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(actual.baseUrl)) partes.push('sin cifrar: la dirección es http, no https');
  const sinActivar = CAPABILITIES.filter(capacidad => !actual.enabled[capacidad]).map(capacidad => NOMBRES[capacidad]);
  const linea = `${partes.join(', ')}. ${activas.length ? `Activo para: ${activas.join(', ')}.` : 'Sin ninguna capacidad activada.'}`;
  return sinActivar.length && activas.length ? `${linea} Sin activar: ${sinActivar.join(', ')}.` : linea;
}

// Cada fallo con su mensaje en español, su código para que el llamante decida
// y si vale la pena reintentarlo. El mensaje se escribe entero aquí: nada de lo
// que venga del servidor o de la excepción se copia dentro, porque ahí es donde
// se cuelan de vuelta el token o el principio de la foto.
const ERRORES = {
  capacidad: ['Esa capacidad no existe.', 'capacidad-desconocida', false],
  sinConfigurar: ['No hay un servicio configurado. Escribe la dirección de tu backend en Ajustes.', 'sin-configurar', false],
  red: ['No hay conexión con el servicio. La app sigue funcionando sin él.', 'sin-conexion', true],
  tiempo: ['El servicio tardó demasiado. Inténtalo otra vez o escríbelo a mano.', 'tiempo-agotado', false],
  cancelado: ['Se canceló la petición.', 'cancelado', false],
  auth: ['El servicio rechazó la petición (clave no válida).', 'no-autorizado', false],
  peticion: ['El servicio no entendió la petición.', 'peticion-invalida', false],
  grande: ['El envío es demasiado grande para el servicio. Prueba con una foto más pequeña.', 'demasiado-grande', false],
  limite: ['El servicio está ocupado. Espera un momento y vuelve a intentarlo.', 'ocupado', true],
  caido: ['El servicio no está disponible en este momento.', 'servicio-caido', true],
  servidor: ['El servicio falló al procesar la petición.', 'error-del-servicio', false],
  respuesta: ['El servicio respondió algo que no se entiende.', 'respuesta-invalida', false]
};
// Solo se reintenta lo que puede salir distinto la próxima vez: el servicio
// ocupado y el que está reiniciando. Un 400 mal formado y un 401 con la clave
// vencida van a fallar igual tres veces, y repetirlos solo alarga la espera.
function porEstado(status) {
  if (status === 401 || status === 403) return ERRORES.auth;
  if (status === 413) return ERRORES.grande;
  if (status === 429) return ERRORES.limite;
  if ([502, 503, 504].includes(status)) return ERRORES.caido;
  if (status >= 500) return ERRORES.servidor;
  return ERRORES.peticion;
}

// Respuestas del simulador, marcadas dos veces: simulated en los datos y
// «[simulado]» dentro de cada texto que el usuario podría llegar a ver. Sirve
// para probar la interfaz sin gastar servicio, y una respuesta inventada que
// pasara por buena sería peor que no tener la función.
const SIMULADAS = {
  transcribe: { texto: '[simulado] dos libras de arroz', confianza: 0.5 },
  chat: { respuesta: '[simulado] Esto es una respuesta de prueba: no hay ningún servicio conectado.', acciones: [] },
  vision: {
    fecha: null,
    establecimiento: '[simulado] Colmado de prueba',
    lineas: [
      { textoOriginal: '[simulado] ARROZ SELECTO 2LB', nombreSugerido: 'Arroz', cantidad: 2, unidad: 'lb', confianza: 0.5 },
      { textoOriginal: '[simulado] HUEVOS 12U', nombreSugerido: 'Huevo', cantidad: 12, unidad: 'unidad', confianza: 0.5 }
    ]
  }
};
const simular = capacidad => ({ ...structuredClone(SIMULADAS[capacidad]), simulated: true });

const fallo = (error, code, retryable, provider, inicio) => ({ ok: false, error, code, retryable, provider, ms: Date.now() - inicio });

// Un intento y solo uno. El tiempo de espera es nuestro y el del llamante es
// suyo: los dos tienen que poder cortar, y hay que saber cuál de los dos cortó
// para decirlo bien —«tardó demasiado» y «lo cancelaste» no son lo mismo.
async function intentar(capability, payload, config, options, inicio) {
  const { signal, timeoutMs = 30000 } = options;
  if (signal?.aborted) return fallo(...ERRORES.cancelado, 'backend', inicio);
  const control = new AbortController();
  let motivo = null;
  const temporizador = setTimeout(() => { motivo = ERRORES.tiempo; control.abort(); }, timeoutMs);
  const cortar = () => { motivo = ERRORES.cancelado; control.abort(); };
  signal?.addEventListener('abort', cortar);
  try {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (config.token) cabeceras.Authorization = `Bearer ${config.token}`;
    const respuesta = await globalThis.fetch(`${config.baseUrl}/${capability}`, {
      method: 'POST', headers: cabeceras, body: JSON.stringify(payload ?? {}), signal: control.signal
    });
    // El cuerpo de un error no se lee ni se enseña: un servicio puede devolver
    // de vuelta la foto que le acabamos de mandar, y un mensaje de error no es
    // sitio para eso.
    if (!respuesta.ok) return fallo(...porEstado(respuesta.status), 'backend', inicio);
    let data = null;
    try { data = await respuesta.json(); } catch { return fallo(...(motivo || ERRORES.respuesta), 'backend', inicio); }
    if (!data || typeof data !== 'object') return fallo(...ERRORES.respuesta, 'backend', inicio);
    return { ok: true, data, provider: 'backend', ms: Date.now() - inicio };
  } catch {
    // La excepción se descarta entera a propósito: su mensaje trae la
    // dirección, a veces la cabecera y siempre un rastro que no ayuda a nadie.
    return fallo(...(motivo || ERRORES.red), 'backend', inicio);
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', cortar);
  }
}

// La llamada. Devuelve siempre la misma forma y no lanza nunca por red: quien
// la use tiene que poder escribir «si no salió, sigue a mano» sin un try.
export async function callProvider(capability, payload, options = {}) {
  const inicio = Date.now();
  const config = normalizar(options.config || readConfig());
  if (!CAPABILITIES.includes(capability)) return fallo(...ERRORES.capacidad, config.provider, inicio);
  if (config.provider === 'mock') return { ok: true, data: simular(capability), provider: 'mock', ms: Date.now() - inicio };
  if (!config.baseUrl) return fallo(...ERRORES.sinConfigurar, 'backend', inicio);
  // La pausa se puede sustituir porque si no las pruebas tardarían dos
  // segundos en comprobar una espera de dos segundos.
  const pausa = options.pausa || (ms => new Promise(listo => setTimeout(listo, ms)));
  const intentos = Math.max(0, Math.trunc(Number(options.retries ?? 1)) || 0) + 1;
  let ultimo = null;
  for (let numero = 0; numero < intentos; numero++) {
    if (numero) await pausa(ESPERAS[Math.min(numero - 1, ESPERAS.length - 1)]);
    ultimo = await intentar(capability, payload, config, options, inicio);
    if (ultimo.ok || !ultimo.retryable) return ultimo;
  }
  return ultimo;
}
