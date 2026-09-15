// La factura del mes pasado ya sabe lo que come esta casa: está escrita, con
// cantidades, y se repite mes tras mes. Esta pantalla la convierte en catálogo y
// en canasta —y solo en eso—, pasando siempre por una tabla que alguien revisa.
//
// Cinco reglas gobiernan el archivo entero:
//
//   1. La lectura la hace el aparato que tiene la foto delante. El teléfono trae
//      dentro el lector de textos de Google, así que en la aplicación instalada
//      la factura se lee sin conexión, sin clave y sin que la foto salga de
//      casa: ese es el camino normal y no pide permiso de envío porque no hay
//      envío. Un servidor propio es el segundo camino, solo para quien lo montó
//      a propósito; escribir a mano es el tercero y nunca falla. Lo que no se
//      hace jamás es fingir una lectura: un dato inventado metido en el
//      inventario de alguien es peor que no tener la función.
//   2. Nada se guarda sin pasar por la tabla. El texto impreso se enseña
//      siempre, tal como salió del papel: es lo único que permite comprobar si
//      la máquina leyó bien. Lo dudoso se resalta y nunca arranca aprobado.
//   3. Una factura vieja no toca las existencias de hoy. Por defecto la factura
//      solo enseña productos; registrar la compra es otra decisión, explícita.
//   4. La foto es material de trabajo. Se reduce antes de salir del teléfono, se
//      puede borrar en cuanto las líneas están aprobadas, y borrarla no cuesta
//      nada de lo aprobado.
//   5. Las cuentas no viven aquí. Cruzar nombres, medir repeticiones y proponer
//      la canasta lo hace invoices.js, que es aritmética pura y está probado.
//      Este archivo decide qué preguntar, dibuja y aplica lo que se aprobó.
//
// Aviso para quien integre este módulo en app.js: `ctx.invoice` se modifica en
// sitio (`Object.assign`), nunca se reemplaza. Si se reasignara, la referencia
// que guarda app.js seguiría apuntando al objeto viejo y la pantalla no
// avanzaría de paso.

import { CATEGORIES } from './catalog-seed.js';
import { borrarTemporales, capacidad, leerFoto, tomarFoto } from './device.js';
import { DECISIONES, UNITS, frecuencias, proponerCanasta, revisarFactura, sugerencias } from './invoices.js';
import { borrarFactura, borrarImagen, disponible, guardarImagen, leerImagen, listarImagenes } from './invoice-store.js';
import { leerTicket } from './receipt-parse.js';
import {
  addProduct, addPurchase, baseLines, convert, nextId, normalizeName, product,
  productByName, setBaseBasket, todayISO, transaction, updateProduct, validDate
} from './model.js';
import { AVISO_ENVIO, callProvider } from './providers.js';
import { button, esc, notice, options, productDatalist, productField } from './ui-kit.js';

/* ── Números que gobiernan la pantalla ─────────────────────────────────── */

// Una foto de teléfono son cuatro megas de píxeles que nadie va a mirar al
// tamaño completo: el texto de un tique se lee de sobra con el lado mayor en
// 1600 px, y mandar los cuatro megas solo cuesta datos del usuario, tiempo de
// espera y, con varias fotos, un 413 del servicio.
//
// Solo se aplica a lo que entra por el `<input type="file">` del navegador. La
// cámara del teléfono ya devuelve la foto reducida a esa misma medida —lo hace
// `tomarFoto`—, y volver a reencodarla aquí solo perdería letra.
const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.82;
// Leer una factura con varias fotos tarda mucho más que contestar un mensaje;
// los 30 s por defecto de callProvider cortan lecturas que iban bien.
const ESPERA_VISION = 60000;
// Cuántos parecidos se ofrecen arriba del todo en el desplegable de la fila.
const MAX_PARECIDOS = 4;
// Propio, para no chocar con los `datalist` que dibujan app.js y bulk-entry.js:
// dos elementos con el mismo id en la página se pisan.
const LISTA = 'invoice-alimentos';

// Las dos cosas que se pueden hacer con una factura aprobada. El texto vive
// aquí y no repartido por la pantalla porque el botón de guardar, la pregunta y
// el mensaje final tienen que decir exactamente lo mismo.
const DESTINOS = {
  aprender: {
    etiqueta: 'Solo para aprender mis productos',
    explica: 'Se registran los alimentos y se guarda lo comprado para calcular tu canasta. Tus existencias de hoy no se tocan.',
    verbo: n => `Aprender ${n} ${alimentos(n)} de esta factura`
  },
  compra: {
    etiqueta: 'También registrar esta compra en mis existencias',
    explica: 'Además de aprender los alimentos, la app contará que esa compra entró en casa el día de la factura y subirá las existencias desde esa fecha.',
    verbo: n => `Aprender ${n} ${alimentos(n)} y registrar la compra`
  }
};

// Lo que hace cada decisión con la línea. `guarda` responde «¿esto pasa al
// catálogo y a la cuenta del hábito?»; el resto es texto para la pantalla.
const DECIDIR = {
  incluir: { guarda: true, texto: 'Inclúyela: es este alimento' },
  ocasional: { guarda: true, texto: 'Comida, pero de vez en cuando' },
  unir: { guarda: true, texto: 'Unir con otro alimento' },
  nuevo: { guarda: true, texto: 'Crear el alimento nuevo' },
  'no-alimentario': { guarda: false, texto: 'No es comida (jabón, fundas…)' },
  ignorar: { guarda: false, texto: 'Ignorar esta línea' },
  'lectura-mala': { guarda: false, texto: 'La lectura es incorrecta' }
};
const GUARDABLES = new Set(DECISIONES.filter(decision => DECIDIR[decision].guarda));

// Las seis etiquetas que puede llevar una fila. El texto es lo que manda: el
// color solo lo acompaña, porque un estado que solo se ve por el color no
// existe para quien no distingue esos dos tonos.
//
// Las notas dicen qué hacer, no lo que invoices.js ya dijo en su aviso: las dos
// van juntas bajo el nombre, y repetir la misma frase dos veces es la forma más
// rápida de que no se lea ninguna.
const ESTADOS = {
  dudosa: { texto: 'lectura dudosa', pill: 'red', nota: 'Si no se entiende, déjala fuera: una línea aprobada a medias ensucia la canasta durante meses.' },
  'sin-cantidad': { texto: 'falta la cantidad', pill: 'warm', nota: 'Sin cantidad el alimento se aprende igual, pero esa compra no cuenta para calcular cuánto se consume al mes.' },
  nueva: { texto: 'alimento nuevo', pill: '', nota: 'Se registrará con las existencias en cero: la factura dice lo que compraste entonces, no lo que queda hoy.' },
  unir: { texto: 'se une con uno que ya tienes', pill: 'gray', nota: '' },
  lista: { texto: 'lista', pill: 'gray', nota: '' },
  fuera: { texto: 'no se guarda', pill: 'gray', nota: 'Esta línea no se guardará.' }
};
const DESTACADAS = new Set(['dudosa', 'sin-cantidad']);

const CONSEJOS = [
  'Con buena luz y sin sombra encima del papel: la del techo suele bastar, la del flash rebota.',
  'La factura entera dentro del encuadre, de la primera línea a la última.',
  'Sin reflejos ni arrugas: estira el papel con la mano y aléjate un palmo.',
  'Si es larga, varias fotos. Mejor tres trozos legibles que uno entero borroso.'
];

const alimentos = n => (n === 1 ? 'alimento' : 'alimentos');
const lineas = n => (n === 1 ? 'línea' : 'líneas');
const fotos = n => (n === 1 ? 'foto' : 'fotos');
const texto = valor => String(valor ?? '').trim();
// Una sola letra no es el nombre de ningún alimento.
const utilizable = nombre => texto(nombre).length > 1;
const porcentaje = valor => `${Math.round(Number(valor || 0) * 100)} %`;
const pesoLegible = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
const NIVELES = { alta: 'lectura clara', media: 'lectura regular', baja: 'lectura dudosa' };

// Se preguntan en cada dibujo y no una vez al importar: el módulo se carga antes
// de que Capacitor termine de colgar sus complementos de `window`, y una
// respuesta cacheada de ese instante diría «aquí no se puede leer» para toda la
// vida de la app.
const lector = () => capacidad('leer-foto');
const camara = () => capacidad('camara');

/* ── El estado de la pantalla ──────────────────────────────────────────── */

export function emptyInvoice() {
  return { paso: 'capturar', facturas: [], actual: null, error: '', avisos: [] };
}

// El permiso de envío vive en el módulo y no en `ui.invoice` a propósito: es
// «la primera vez de esta sesión», así que tiene que morir al recargar la app y
// no viajar dentro del estado del panel.
let permisoDeEnvio = false;
// El envío en curso tampoco es estado de la pantalla: es un hecho de la sesión,
// y solo puede haber uno. Guarda con qué factura se corresponde para que la
// barra de progreso no aparezca sobre otra.
let envio = null;
// Lo mismo para la lectura dentro del aparato, que va foto a foto. Lleva la
// cuenta porque con tres fotos el silencio dura varios segundos y sin un número
// que avance la pantalla parece colgada.
let leyendo = null;
// Mientras se reducen las fotos la pantalla tiene que decirlo: en un teléfono
// viejo, tres fotos tardan.
let procesando = false;

// El panel guarda su estado en `ui.invoice` y app.js lo pasa como `ctx.invoice`.
// Se busca en los dos —y se crea si falta— para que dibujarlo antes de que
// app.js lo cree no reviente.
function invoiceDe(ctx) {
  if (ctx.invoice) return ctx.invoice;
  if (ctx.ui) { ctx.ui.invoice = ctx.ui.invoice || emptyInvoice(); ctx.invoice = ctx.ui.invoice; return ctx.invoice; }
  ctx.invoice = emptyInvoice();
  return ctx.invoice;
}

// crypto.randomUUID no existe sobre http ni en WebViews viejos. El respaldo no
// tiene que ser criptográfico, solo irrepetible: este identificador es además
// la clave con la que las fotos quedan guardadas en IndexedDB, así que tiene
// que sobrevivir a recargar la app.
function nuevoId(prefijo) {
  const azar = globalThis.crypto;
  if (azar && typeof azar.randomUUID === 'function') return `${prefijo}-${azar.randomUUID()}`;
  return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const facturaPorId = (invoice, id) => invoice.facturas.find(factura => factura.id === id) || null;
const facturaActual = invoice => facturaPorId(invoice, invoice.actual);
const enviandoDe = factura => Boolean(envio && factura && envio.facturaId === factura.id);
const leyendoDe = factura => Boolean(leyendo && factura && leyendo.facturaId === factura.id);

function nuevaFactura(invoice) {
  const factura = {
    id: nuevoId('factura'),
    imagenes: [],
    fecha: '',
    establecimiento: '',
    extraccion: null,
    revision: null,
    simulada: false,
    // De dónde salió la lectura. Se guarda porque «se leyó aquí dentro» es una
    // garantía que el usuario tiene derecho a ver en la pantalla de revisión, y
    // al llegar allí ya no hay forma de deducirla.
    origenLectura: null,
    guardadas: false,
    guardada: false,
    destino: 'aprender'
  };
  invoice.facturas.push(factura);
  invoice.actual = factura.id;
  return factura;
}

/* ── Las fotos: reducir, girar, convertir ──────────────────────────────── */

// Todo lo que toca <canvas> vive aquí y solo lo llaman las acciones, nunca el
// dibujo: así el módulo se puede importar en una prueba de Node, donde no hay
// document ni Image.
const hayLienzo = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

function cargarImagen(origen) {
  return new Promise((listo, fallo) => {
    const imagen = new Image();
    imagen.onload = () => listo(imagen);
    imagen.onerror = () => fallo(new Error('El archivo no es una imagen que este navegador pueda abrir.'));
    imagen.src = origen;
  });
}

const base64De = dataUrl => String(dataUrl || '').slice(String(dataUrl || '').indexOf(',') + 1);
// El tamaño real del JPEG, deducido del base64: cuatro caracteres por cada tres
// bytes. Sirve para poder decirle al usuario cuánto va a salir de su teléfono
// antes de que salga.
const pesoDe = dataUrl => Math.round((base64De(dataUrl).length * 3) / 4);

function lienzoA(ancho, alto) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  return lienzo;
}

// Reduce y reencoda en JPEG. Los navegadores de hoy ya aplican la orientación
// EXIF al dibujar un <img>, así que la foto entra derecha; para las cámaras que
// no la escriben bien está el botón de girar.
async function reducir(archivo) {
  if (!hayLienzo()) throw new Error('Este navegador no puede preparar las fotos.');
  const origen = URL.createObjectURL(archivo);
  try {
    const imagen = await cargarImagen(origen);
    const mayor = Math.max(imagen.naturalWidth, imagen.naturalHeight) || 1;
    const escala = Math.min(1, LADO_MAXIMO / mayor);
    const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala));
    const alto = Math.max(1, Math.round(imagen.naturalHeight * escala));
    const lienzo = lienzoA(ancho, alto);
    lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
    const dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD_JPEG);
    return { id: nuevoId('foto'), dataUrl, ancho, alto, tamano: pesoDe(dataUrl), nombre: texto(archivo.name) || 'foto', guardada: null };
  } finally {
    URL.revokeObjectURL(origen);
  }
}

// Un cuarto de vuelta a la derecha, reencodando: la foto girada es la que se
// lee, así que lo que ve el usuario en la miniatura es exactamente lo que va a
// leer el lector.
//
// La ruta se pierde al girar, y tiene que perderse: apuntaría al archivo de la
// cámara, que sigue derecho. Sin ella, la lectura toma el JPEG girado que está
// aquí en memoria, que es el que el usuario aprobó con la vista.
async function girar(foto) {
  if (!hayLienzo()) throw new Error('Este navegador no puede girar las fotos.');
  const imagen = await cargarImagen(foto.dataUrl);
  const lienzo = lienzoA(imagen.naturalHeight, imagen.naturalWidth);
  const pincel = lienzo.getContext('2d');
  pincel.translate(imagen.naturalHeight, 0);
  pincel.rotate(Math.PI / 2);
  pincel.drawImage(imagen, 0, 0);
  const dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD_JPEG);
  return { ...foto, ruta: null, dataUrl, ancho: lienzo.width, alto: lienzo.height, tamano: pesoDe(dataUrl) };
}

// Lo que la cámara del teléfono deja en casa: un archivo suyo y una dirección
// con la que enseñarlo. La ruta se guarda porque es justo lo que pide el lector
// de textos; el `dataUrl` aquí no es un `data:` sino esa dirección, y por eso
// todo lo que convierte fotos pasa por `blobDeFoto` en vez de por `atob`.
async function fotoDelTelefono(tomada) {
  const foto = {
    id: nuevoId('foto'), ruta: tomada.ruta, dataUrl: tomada.vista || tomada.ruta,
    ancho: 0, alto: 0, tamano: 0, nombre: 'foto del teléfono', guardada: null
  };
  // Medir es un lujo, no un requisito: si el WebView no deja abrir esa
  // dirección como imagen, la foto entra igual y la pantalla calla el tamaño en
  // vez de inventárselo.
  try {
    if (hayLienzo()) {
      const imagen = await cargarImagen(foto.dataUrl);
      foto.ancho = imagen.naturalWidth;
      foto.alto = imagen.naturalHeight;
    }
  } catch { /* sin medidas, pero con foto */ }
  return foto;
}

// Una foto puede venir de tres sitios y solo una de las tres formas es un
// `data:`. Esta es la única que las convierte todas, y por eso la usan tanto
// guardar en el dispositivo como leer lo que no tiene ruta.
async function blobDeFoto(foto) {
  const origen = String(foto.dataUrl || '');
  if (origen.startsWith('data:')) return aBlob(origen);
  const respuesta = await fetch(origen);
  return respuesta.blob();
}

// Lo que se le da al lector. Con ruta, la ruta: el archivo ya está escrito y no
// hay nada que copiar. Sin ruta —una foto del navegador, o una girada—, el
// JPEG, que `leerFoto` escribe en la caché del propio teléfono y borra después.
const fuenteDeLectura = foto => (foto.ruta ? foto.ruta : blobDeFoto(foto));

function aBlob(dataUrl) {
  const binario = atob(base64De(dataUrl));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

function aDataUrl(blob) {
  return new Promise((listo, fallo) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result || ''));
    lector.onerror = () => fallo(new Error('No se pudo abrir una de las fotos guardadas.'));
    lector.readAsDataURL(blob);
  });
}

/* ── Las filas de la revisión ──────────────────────────────────────────── */

// La decisión de cada fila viaja en un solo `select`, así que el valor lleva
// dentro con qué producto se une: `unir:producto-3`. Un control en vez de dos
// evita tener que volver a dibujar la tabla al cambiar de opción, que es lo que
// borraría lo que la persona acaba de escribir en las otras filas.
//
// Una decisión que no se reconoce vuelve en null, no en un valor por defecto:
// quien llama conserva entonces la que la fila ya tenía. Caer en «ignorar» o en
// «lectura mala» descartaría en silencio una línea que nadie descartó.
const leerDecision = valor => {
  const dicho = String(valor || '');
  if (dicho.startsWith('unir:')) return { decision: 'unir', objetivo: dicho.slice(5) };
  return { decision: DECISIONES.includes(dicho) && dicho !== 'unir' ? dicho : null, objetivo: null };
};
const valorDecision = fila => (fila.decision === 'unir' && fila.objetivo ? `unir:${fila.objetivo}` : fila.decision);

// Lo que el catálogo ya sabe de este nombre. `sugerencias` no filtra por umbral
// a propósito: es justo cuando no hay una coincidencia buena cuando el usuario
// necesita ver las tres que más se acercan.
function cruzar(state, nombre, textoOriginal) {
  const buscado = texto(nombre) || texto(textoOriginal);
  const exacto = (utilizable(nombre) && productByName(state, nombre)) || null;
  const candidatos = sugerencias(buscado, state.products, MAX_PARECIDOS)
    .filter(fila => fila.productId !== exacto?.id)
    .map(fila => ({ id: fila.productId, nombre: fila.nombre, puntuacion: fila.puntuacion, motivo: fila.motivo }));
  return { exacto, candidatos };
}

// Una línea revisada por invoices.js convertida en fila editable. La decisión
// que trae NO se toca: es la que ya tuvo en cuenta la confianza de la lectura,
// y subirla aquí a «incluir» sería aprobar en silencio lo que se leyó mal.
//
// `objetivo` es a qué alimento del catálogo apunta la fila. Se guarda aparte de
// la decisión porque «inclúyela», «únela» y «es ocasional» apuntan al mismo
// producto y solo se diferencian en el juicio: cambiar de una a otra no debe
// perder de vista de qué alimento se estaba hablando.
function construirFila(state, linea) {
  const { exacto, candidatos } = cruzar(state, linea.nombreSugerido, linea.textoOriginal);
  const propuesto = (linea.match && product(state, linea.match.productId)) || null;
  const conocido = propuesto || exacto || null;
  return {
    ...linea,
    nombre: texto(linea.nombreSugerido) || texto(linea.textoOriginal),
    cantidad: linea.cantidad === null ? '' : String(linea.cantidad),
    unidad: linea.unidad || conocido?.controlUnit || 'unidad',
    unidadDeducida: !linea.unidad,
    categoria: conocido?.category || 'otros',
    objetivo: propuesto?.id || exacto?.id || null,
    exacto: exacto?.id || null,
    candidatos
  };
}

function filaVacia(filas) {
  const numero = filas.reduce((mayor, fila) => Math.max(mayor, Number(String(fila.id).replace('linea-', '')) || 0), 0) + 1;
  return {
    id: `linea-${numero}`, textoOriginal: '', nombreSugerido: null, nombre: '', cantidad: '', unidad: 'unidad',
    unidadDeducida: false, categoria: 'otros', confianza: null, confianzaNivel: 'alta', match: null,
    decision: 'nuevo', objetivo: null, exacto: null, candidatos: [], aviso: null, aMano: true
  };
}

function estadoDe(fila) {
  if (!GUARDABLES.has(fila.decision)) return fila.decision === 'lectura-mala' ? 'dudosa' : 'fuera';
  if (fila.confianzaNivel === 'baja') return 'dudosa';
  if (!utilizable(fila.nombre)) return 'dudosa';
  if (texto(fila.cantidad) === '') return 'sin-cantidad';
  if (fila.decision === 'nuevo') return 'nueva';
  if (fila.decision === 'unir') return 'unir';
  return 'lista';
}

// Cada acción vuelve a dibujarlo todo desde `ctx.invoice`, así que antes de
// tocar nada hay que recoger lo que la persona lleva escrito en la tabla. Sin
// esto, añadir una fila borraría las correcciones de las demás.
function leerFilas(state, form, filas) {
  const leidas = new Map();
  for (const tr of form.querySelectorAll('[data-invoice-row]')) {
    const id = tr.dataset.linea;
    const previa = filas.find(fila => fila.id === id);
    if (!previa) continue;
    const nombre = tr.querySelector('[data-invoice-nombre]')?.value ?? previa.nombre;
    const leida = leerDecision(tr.querySelector('[data-invoice-decision]')?.value);
    const decision = leida.decision || previa.decision;
    const { exacto, candidatos } = cruzar(state, nombre, previa.textoOriginal);
    // El nombre escrito manda sobre lo que propuso la máquina: quien corrige
    // «PLAT MAD» y escribe «Plátano maduro» está diciendo cuál es el alimento.
    const objetivo = decision === 'unir' ? leida.objetivo : exacto?.id || previa.objetivo || null;
    leidas.set(id, {
      ...previa,
      nombre,
      cantidad: tr.querySelector('[data-invoice-cantidad]')?.value ?? previa.cantidad,
      unidad: tr.querySelector('[data-invoice-unidad]')?.value || previa.unidad,
      categoria: tr.querySelector('[data-invoice-categoria]')?.value || previa.categoria,
      // Si el nombre se corrigió y ya no apunta a nada, «es este alimento»
      // dejaría de tener sentido: pasa a crear uno nuevo.
      decision: decision === 'incluir' && !objetivo ? 'nuevo' : decision,
      objetivo,
      exacto: exacto?.id || null,
      candidatos
    });
  }
  return filas.map(fila => leidas.get(fila.id) || fila);
}

// Recoge lo escrito en la pantalla de capturar —fecha y establecimiento de cada
// factura— antes de volver a dibujar.
function leerFichas(invoice, raiz) {
  if (!raiz?.querySelectorAll) return;
  for (const bloque of raiz.querySelectorAll('[data-invoice-ficha]')) {
    const factura = facturaPorId(invoice, bloque.dataset.factura);
    if (!factura) continue;
    factura.fecha = bloque.querySelector('[data-invoice-fecha]')?.value ?? factura.fecha;
    factura.establecimiento = bloque.querySelector('[data-invoice-tienda]')?.value ?? factura.establecimiento;
  }
}

const formularioDe = el => el?.closest?.('form[data-form^="invoice-"]') || null;

function sincronizar(el, ctx) {
  const invoice = invoiceDe(ctx);
  const form = formularioDe(el);
  if (!form) return invoice;
  leerFichas(invoice, form);
  const factura = facturaActual(invoice);
  if (factura?.revision && form.dataset.form === 'invoice-revision') {
    factura.revision.lineas = leerFilas(ctx.state, form, factura.revision.lineas);
    factura.fecha = form.querySelector('[data-invoice-fecha]')?.value ?? factura.fecha;
    factura.establecimiento = form.querySelector('[data-invoice-tienda]')?.value ?? factura.establecimiento;
    factura.destino = form.querySelector('[name="destino"]:checked')?.value || factura.destino;
  }
  return invoice;
}

/* ── Los dos resúmenes que tienen que decir la verdad ───────────────────── */

function textoCuenta(filas) {
  const guardables = filas.filter(fila => GUARDABLES.has(fila.decision));
  const dudosas = filas.filter(fila => estadoDe(fila) === 'dudosa').length;
  const sinCantidad = guardables.filter(fila => texto(fila.cantidad) === '').length;
  const fuera = filas.length - guardables.length;
  const partes = [`${filas.length} ${lineas(filas.length)} ${filas.length === 1 ? 'leída' : 'leídas'}`];
  if (dudosas) partes.push(`${dudosas} ${dudosas === 1 ? 'dudosa' : 'dudosas'}`);
  if (sinCantidad) partes.push(`${sinCantidad} sin cantidad`);
  if (fuera) partes.push(`${fuera} que se ${fuera === 1 ? 'deja' : 'dejan'} fuera`);
  return partes.join(' · ');
}

const aprobadas = filas => filas.filter(fila => GUARDABLES.has(fila.decision) && utilizable(fila.nombre));
const textoGuardar = (filas, destino) => (DESTINOS[destino] || DESTINOS.aprender).verbo(aprobadas(filas).length);

/* ── Dibujo ────────────────────────────────────────────────────────────── */

const PASOS = [
  ['capturar', 'Fotos'],
  ['leyendo', 'Lectura'],
  ['revisar', 'Revisión'],
  ['habitos', 'Hábitos']
];

function barraPasos(paso) {
  const actual = PASOS.findIndex(([id]) => id === paso);
  return `<ol class="invoice-pasos">${PASOS.map(([id, etiqueta], indice) => `<li class="invoice-paso ${indice === actual ? 'ahora' : ''} ${indice < actual ? 'hecho' : ''}" ${indice === actual ? 'aria-current="step"' : ''}>
    <span class="invoice-punto" aria-hidden="true">${indice + 1}</span><span class="invoice-paso-nombre">${esc(etiqueta)}</span>
  </li>`).join('')}</ol>`;
}

const avisosHTML = invoice => (invoice.avisos || []).map(aviso => notice('De las fotos', esc(aviso), 'warn')).join('');

// El bloque que no se puede saltar cuando no hay servicio: dice que no se leyó
// nada y ofrece las dos salidas de verdad. Se enseña en la pantalla de capturar
// y en la de lectura, porque quien no tiene servicio merece saberlo antes de
// ponerse a fotografiar, no después.
function bloqueSinServicio(factura) {
  const guardadas = factura?.imagenes.some(foto => foto.guardada);
  return `<div class="card soft stack invoice-honesto">
    <h3>Todavía no se ha leído nada de esta factura</h3>
    <p>La lectura automática necesita un servicio configurado, y en este dispositivo no lo hay. Nadie ha mirado estas fotos: la app <strong>no ha sacado ni una línea</strong> de ellas, y no va a inventarse ninguna.</p>
    <p class="small muted">Se configura en Ajustes, con un backend propio. Está explicado paso a paso en <code>docs/backend.md</code>. Sin él, todo lo demás de la app —canasta, menú, compras, existencias— funciona igual y sin conexión.</p>
    <div class="invoice-salidas">
      <div class="invoice-salida">
        <strong>Escríbelo o díctalo</strong>
        <p class="small">Un párrafo de corrido con lo que dice la factura —«30 plátanos, 10 libras de arroz, 6 latas de atún»— y lo revisas en una tabla igual que esta. Es lo mismo que haría el servicio, solo que leyéndolo tú.</p>
        ${button('🗣️ Escribir o dictar las líneas', 'open-bulk', 'btn-primary')}
      </div>
      <div class="invoice-salida">
        <strong>Guarda las fotos para después</strong>
        <p class="small">Las fotos se quedan en este dispositivo, en su propio almacén. Cuando configures el servicio, vuelves aquí, las recuperas y se leen entonces.</p>
        ${disponible()
          ? (guardadas
            ? `<p class="small invoice-ok">Guardadas en este dispositivo. Recupéralas desde el paso de las fotos.</p>`
            : button('📥 Guardar las fotos en el dispositivo', 'invoice-guardar-fotos', 'btn-secondary'))
          : `<p class="small">Este navegador no deja guardarlas (suele pasar en una ventana privada). Si cierras esta pantalla, las fotos se pierden: escribe las líneas ahora.</p>`}
      </div>
    </div>
  </div>`;
}

export function renderInvoice(ctx) {
  const invoice = invoiceDe(ctx);
  const factura = facturaActual(invoice);
  if (invoice.paso === 'revisar' && factura?.revision) return pasoRevisar(ctx, invoice, factura);
  if (invoice.paso === 'habitos') return pasoHabitos(ctx, invoice, factura);
  if (invoice.paso === 'leyendo' && factura) return pasoLeyendo(ctx, invoice, factura);
  return pasoCapturar(ctx, invoice);
}

/* ── Paso 1: las fotos ─────────────────────────────────────────────────── */

function pasoCapturar(ctx, invoice) {
  const servicio = Boolean(ctx.servicios?.vision);
  const factura = facturaActual(invoice) || invoice.facturas[invoice.facturas.length - 1] || null;
  const total = invoice.facturas.reduce((suma, item) => suma + item.imagenes.length, 0);
  return `<form data-form="invoice-capturar" class="stack invoice">
    ${barraPasos('capturar')}
    <div class="card stack">
      <h2>Fotografía la factura</h2>
      <p class="muted">Una factura larga son tres fotos, y puedes traer varias facturas de varios meses: cuantos más meses, mejor sale la canasta. Nada se guarda hasta que revises línea por línea.</p>
      ${avisosHTML(invoice)}
      ${!disponible() ? notice('Aquí las fotos no se pueden guardar', 'Este navegador no deja usar el almacén de fotos (suele pasar en una ventana privada). Puedes fotografiar y revisar igual, pero si cierras esta pantalla las fotos se pierden y habrá que escribir las líneas a mano.', 'warn') : ''}
      <div class="invoice-camara">
        <label class="field">
          <span>Tomar una foto con la cámara</span>
          <input type="file" name="camara" accept="image/*" capture="environment" multiple data-invoice-archivos>
        </label>
        <label class="field">
          <span>O elegir fotos de la galería</span>
          <input type="file" name="galeria" accept="image/*" multiple data-invoice-archivos>
        </label>
      </div>
      <p class="tiny muted">Son dos campos y no uno porque en Android el primero abre la cámara directamente y el segundo la galería; con uno solo, el teléfono decide y casi siempre esconde la otra mitad.</p>
      <div class="hint">
        <strong>Para que la foto sirva:</strong>
        <ul class="invoice-consejos tiny">${CONSEJOS.map(consejo => `<li>${esc(consejo)}</li>`).join('')}</ul>
      </div>
      <div class="modal-actions invoice-acciones-fotos">
        <button type="submit" class="btn btn-secondary">Añadir las fotos elegidas</button>
        ${disponible() ? button('Recuperar fotos guardadas', 'invoice-recuperar-fotos', 'btn-quiet') : ''}
      </div>
      ${procesando ? `<p class="invoice-progreso" role="status" aria-live="polite"><span class="invoice-puntos" aria-hidden="true"><i></i><i></i><i></i></span> Preparando las fotos: se reducen a ${LADO_MAXIMO} px antes de nada.</p>` : ''}
    </div>
    ${invoice.facturas.map(item => grupoHTML(item, item.id === factura?.id)).join('')}
    ${total ? '' : `<div class="card soft"><p class="muted">Todavía no has añadido ninguna foto. Toma la primera arriba.</p></div>`}
    ${servicio ? '' : bloqueSinServicio(factura)}
    <div class="card stack">
      <div class="modal-actions">
        ${invoice.facturas.length ? button('Empezar otra factura', 'invoice-otra-factura', 'btn-quiet') : ''}
        ${button(servicio ? 'Leer esta factura' : 'Continuar sin lectura automática', 'invoice-continuar', 'btn-primary')}
      </div>
      <p class="tiny muted">${servicio
        ? 'Antes de enviar nada se te dirá exactamente qué sale del teléfono y hacia dónde, y tendrás que autorizarlo.'
        : 'Sin servicio configurado no hay lectura automática: lo que sigue te explica las dos salidas que sí funcionan.'}</p>
    </div>
  </form>`;
}

function grupoHTML(factura, actual) {
  const peso = factura.imagenes.reduce((suma, foto) => suma + (foto.tamano || 0), 0);
  return `<div class="card stack invoice-grupo ${actual ? 'invoice-grupo-actual' : ''}" data-invoice-ficha data-factura="${esc(factura.id)}">
    <div class="section-head invoice-grupo-head">
      <div>
        <h3>${esc(factura.establecimiento) || 'Factura sin nombre'}${actual ? ' <span class="pill">en la que estás</span>' : ''}</h3>
        <p class="tiny muted">${factura.imagenes.length} ${fotos(factura.imagenes.length)}${peso ? ` · ${pesoLegible(peso)} en total` : ''}${factura.imagenes.some(foto => foto.guardada) ? ' · guardadas en el dispositivo' : ''}</p>
      </div>
      ${button('Quitar esta factura', 'invoice-quitar-factura', 'btn-quiet', `data-factura="${esc(factura.id)}" aria-label="Quitar la factura completa y sus fotos"`)}
    </div>
    ${factura.imagenes.length ? `<ul class="invoice-fotos">${factura.imagenes.map((foto, indice) => fotoHTML(factura, foto, indice)).join('')}</ul>` : '<p class="muted small">Esta factura todavía no tiene fotos.</p>'}
    <div class="invoice-ficha">
      <label class="field">
        <span>Fecha aproximada de la compra</span>
        <input type="date" name="fecha-${esc(factura.id)}" value="${esc(factura.fecha)}" max="${esc(todayISO())}" data-invoice-fecha>
        <small>Si no se detecta en la foto, escríbela: el mes es lo que permite ver qué se repite. Sin fecha, la factura no cuenta para el hábito.</small>
      </label>
      <label class="field">
        <span>Establecimiento (opcional)</span>
        <input type="text" name="tienda-${esc(factura.id)}" value="${esc(factura.establecimiento)}" placeholder="Ej. Colmado La Esquina" autocomplete="off" data-invoice-tienda>
        <small>Solo para que puedas distinguir una factura de otra. No se guarda nada más del establecimiento.</small>
      </label>
    </div>
  </div>`;
}

function fotoHTML(factura, foto, indice) {
  const nombre = `Foto ${indice + 1} de ${factura.establecimiento ? `la factura de ${factura.establecimiento}` : 'esta factura'}`;
  const datos = `data-factura="${esc(factura.id)}" data-foto="${esc(foto.id)}"`;
  return `<li class="invoice-foto">
    <img src="${esc(foto.dataUrl)}" alt="${esc(nombre)}" loading="lazy">
    <div class="invoice-foto-pie">
      <span class="tiny muted">${foto.ancho}×${foto.alto} · ${pesoLegible(foto.tamano || 0)}</span>
      <div class="inline">
        ${button('↻ Girar', 'invoice-girar', 'btn-secondary btn-small', `${datos} aria-label="Girar ${esc(nombre)} un cuarto de vuelta"`)}
        ${button('Quitar', 'invoice-quitar-foto', 'btn-quiet btn-small', `${datos} aria-label="Quitar ${esc(nombre)}"`)}
      </div>
    </div>
  </li>`;
}

/* ── Paso 2: leer, que es donde hay que ser honesto ────────────────────── */

function pasoLeyendo(ctx, invoice, factura) {
  const servicio = Boolean(ctx.servicios?.vision);
  const enviando = enviandoDe(factura);
  const peso = factura.imagenes.reduce((suma, foto) => suma + (foto.tamano || 0), 0);
  const volver = button('Volver a las fotos', 'invoice-volver-capturar', 'btn-quiet');
  if (!servicio) {
    return `<div class="stack invoice">
      ${barraPasos('leyendo')}
      ${bloqueSinServicio(factura)}
      <div class="card"><div class="modal-actions">${volver}${button('Cerrar', 'invoice-terminar', 'btn-secondary')}</div></div>
    </div>`;
  }
  if (enviando) {
    return `<div class="stack invoice">
      ${barraPasos('leyendo')}
      <div class="card stack">
        <h2>Leyendo la factura</h2>
        <div class="invoice-progreso" role="status" aria-live="polite">
          <span class="invoice-puntos" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Se enviaron ${factura.imagenes.length} ${fotos(factura.imagenes.length)} (${pesoLegible(peso)}). Una factura larga puede tardar hasta un minuto.</span>
        </div>
        <p class="small muted">Nada se guarda todavía: cuando conteste verás una tabla con una fila por línea y podrás corregirla entera.</p>
        <div class="modal-actions">${button('Cancelar el envío', 'invoice-cancelar-lectura', 'btn-secondary')}</div>
      </div>
    </div>`;
  }
  if (invoice.error) {
    return `<div class="stack invoice">
      ${barraPasos('leyendo')}
      <div class="card stack">
        <h2>No se pudo leer</h2>
        ${notice('El servicio no devolvió la lectura', esc(invoice.error), 'error')}
        <p><strong>No se perdió nada:</strong> las ${fotos(factura.imagenes.length)} siguen aquí, con su fecha y su establecimiento tal como los escribiste. Puedes intentarlo otra vez o escribir las líneas a mano.</p>
        <div class="modal-actions">
          ${button('Intentarlo otra vez', 'invoice-reintentar', 'btn-primary')}
          ${button('🗣️ Escribirlo a mano', 'open-bulk', 'btn-secondary')}
          ${volver}
        </div>
      </div>
    </div>`;
  }
  // El permiso no se hereda de la sesión anterior ni de otra capacidad: la
  // primera foto de esta sesión se manda cuando alguien lo autoriza aquí.
  const aviso = AVISO_ENVIO.vision;
  return `<div class="stack invoice">
    ${barraPasos('leyendo')}
    <div class="card stack">
      ${notice(esc(aviso.titulo), esc(aviso.detalle), 'warn')}
      <p>Van a salir <strong>${factura.imagenes.length} ${fotos(factura.imagenes.length)}</strong>, ${pesoLegible(peso)} en total, reducidas a ${LADO_MAXIMO} px de lado mayor. Míralas antes: si en alguna se ve algo que no quieres mandar, vuelve y quítala.</p>
      <ul class="invoice-fotos invoice-fotos-previa">${factura.imagenes.map((foto, indice) => `<li class="invoice-foto"><img src="${esc(foto.dataUrl)}" alt="Foto ${indice + 1} que se va a enviar" loading="lazy"></li>`).join('')}</ul>
      <div class="modal-actions">
        ${button(esc(aviso.confirmar), 'invoice-permiso-si', 'btn-primary')}
        ${button(esc(aviso.cancelar), 'invoice-permiso-no', 'btn-secondary')}
        ${volver}
      </div>
    </div>
  </div>`;
}

/* ── Paso 3: revisar, por donde pasa todo ──────────────────────────────── */

function pasoRevisar(ctx, invoice, factura) {
  const { state } = ctx;
  const filas = factura.revision.lineas;
  const fecha = factura.fecha || factura.revision.fecha || '';
  return `<form data-form="invoice-revision" class="stack invoice" data-factura="${esc(factura.id)}">
    ${productDatalist(state.products, LISTA)}
    ${barraPasos('revisar')}
    <div class="card stack">
      <div class="section-head invoice-head">
        <div>
          <h2>Revisa antes de guardar</h2>
          <p data-invoice-cuenta>${esc(textoCuenta(filas))}</p>
        </div>
        <div class="inline">
          ${button('Volver a las fotos', 'invoice-volver-capturar', 'btn-quiet')}
          ${button('Añadir una línea a mano', 'invoice-linea-nueva')}
        </div>
      </div>
      ${factura.simulada ? notice('Esto son datos de prueba, no una lectura real', 'El servicio está en modo simulado: las líneas de abajo están inventadas por la app y no salieron de tu factura. Sirven para ver cómo funciona la pantalla. No las guardes como si fueran tu compra.', 'warn') : ''}
      ${avisosHTML(invoice)}
      ${notice('La columna de la izquierda es la prueba', 'Es el texto tal como salió impreso en el papel. Compáralo con el nombre de al lado: es lo único que permite saber si la máquina leyó bien.')}
      ${filas.length ? tablaHTML(ctx, filas) : '<p class="muted">Esta lectura no trajo ninguna línea. Añade una a mano o vuelve a las fotos.</p>'}
      <div class="invoice-ficha">
        <label class="field">
          <span>Fecha de la compra</span>
          <input type="date" name="fecha" value="${esc(fecha)}" max="${esc(todayISO())}" data-invoice-fecha>
          <small>${factura.revision.fecha ? 'Se leyó de la factura: compruébala.' : 'No se pudo leer de la factura: escríbela tú.'} Sin fecha la factura se guarda igual, pero no cuenta para medir el hábito.</small>
        </label>
        <label class="field">
          <span>Establecimiento (opcional)</span>
          <input type="text" name="tienda" value="${esc(factura.establecimiento || factura.revision.establecimiento || '')}" autocomplete="off" data-invoice-tienda>
          <small>Es lo único que se guarda del establecimiento. Ni el total, ni el número de caja, ni la tarjeta.</small>
        </label>
      </div>
      ${preguntaDestino(factura)}
      <div class="modal-actions">
        ${button('Volver a las fotos', 'invoice-volver-capturar', 'btn-quiet')}
        <button type="submit" class="btn btn-primary" data-invoice-guardar>${esc(textoGuardar(filas, factura.destino))}</button>
      </div>
    </div>
  </form>`;
}

// La pregunta que no se puede saltar. Por defecto, solo aprender: una factura
// de hace tres meses no puede tocar las existencias de hoy —lo que se compró en
// junio ya se comió—, y si esa fuera la opción marcada bastaría un toque
// distraído para que la app creyera que hay en casa comida que no está.
function preguntaDestino(factura) {
  const compra = factura.destino === 'compra';
  return `<fieldset class="invoice-destino">
    <legend>¿Para qué quieres esta factura?</legend>
    ${Object.entries(DESTINOS).map(([id, item]) => `<label class="check-chip invoice-opcion">
      <input type="radio" name="destino" value="${esc(id)}" ${factura.destino === id ? 'checked' : ''} data-invoice-destino>
      <span><strong>${esc(item.etiqueta)}</strong><span class="tiny">${esc(item.explica)}</span></span>
    </label>`).join('')}
    <div class="invoice-compra" data-invoice-compra ${compra ? '' : 'hidden'}>
      ${notice('Ojo con la fecha', 'La compra entra con la fecha de la factura. Si es de hace meses, la app contará que esos alimentos entraron entonces y que siguen en casa salvo que hayas registrado revisiones desde esa fecha. Si ya te los comiste, esto no es lo que quieres: deja marcado «solo aprender».', 'warn')}
      <label class="check-chip">
        <input type="checkbox" name="confirmo" value="si">
        Sí: confirmo que quiero registrar esta compra y que las existencias suban desde la fecha de la factura.
      </label>
    </div>
  </fieldset>`;
}

function tablaHTML(ctx, filas) {
  return `<div class="table-wrap invoice-wrap">
    <table class="data-table invoice-table">
      <caption class="invoice-caption">Una fila por línea impresa. Todo es editable; nada se guarda hasta que pulses el botón de abajo.</caption>
      <thead><tr>
        <th scope="col">Lo que dice el papel</th>
        <th scope="col">Alimento</th>
        <th scope="col">Cantidad</th>
        <th scope="col">Unidad</th>
        <th scope="col">Categoría</th>
        <th scope="col">Qué se hace con ella</th>
        <th scope="col">Estado</th>
      </tr></thead>
      <tbody>${filas.map(fila => filaHTML(ctx, fila)).join('')}</tbody>
    </table>
  </div>`;
}

function filaHTML(ctx, fila) {
  const estado = estadoDe(fila);
  return `<tr data-invoice-row data-linea="${esc(fila.id)}" data-nivel="${esc(fila.confianzaNivel || 'alta')}" data-decision="${esc(fila.decision)}" data-estado="${estado}" class="invoice-fila ${DESTACADAS.has(estado) ? 'invoice-destacada' : ''}">
    <td class="invoice-celda-impreso">
      <span class="invoice-etiqueta">Lo que dice el papel</span>
      <code class="invoice-impreso">${esc(fila.textoOriginal) || '—'}</code>
      ${fila.confianza !== null && fila.confianza !== undefined ? `<span class="tiny muted invoice-lectura">${esc(NIVELES[fila.confianzaNivel] || 'lectura')} · ${porcentaje(fila.confianza)}</span>` : ''}
    </td>
    <td class="invoice-celda-nombre">
      ${productField(fila.nombre, { name: `nombre-${fila.id}`, label: 'Alimento', required: false, listId: LISTA, placeholder: 'Escribe el nombre', extra: 'data-invoice-nombre' })}
      ${notasHTML(ctx, fila)}
    </td>
    <td class="invoice-celda-cantidad">
      <label class="field"><span>Cantidad</span>
        <input type="number" name="cantidad-${esc(fila.id)}" value="${esc(fila.cantidad)}" min="0" step="any" inputmode="decimal" placeholder="Sin leer" data-invoice-cantidad>
      </label>
    </td>
    <td class="invoice-celda-unidad">
      <label class="field"><span>Unidad</span>
        <select name="unidad-${esc(fila.id)}" data-invoice-unidad>${options(UNITS.map(unidad => [unidad, unidad]), fila.unidad)}</select>
      </label>
    </td>
    <td class="invoice-celda-categoria">
      <label class="field"><span>Categoría</span>
        <select name="categoria-${esc(fila.id)}" data-invoice-categoria>${options(CATEGORIES.map(item => [item.id, `${item.emoji} ${item.label}`]), fila.categoria)}</select>
      </label>
    </td>
    <td class="invoice-celda-decision">
      <label class="field"><span>Qué se hace con ella</span>
        <select name="decision-${esc(fila.id)}" data-invoice-decision>${opcionesDecision(ctx.state, fila)}</select>
      </label>
    </td>
    <td class="invoice-celda-estado">
      <span class="pill ${ESTADOS[estado].pill}" data-invoice-estado>${esc(ESTADOS[estado].texto)}</span>
    </td>
  </tr>`;
}

// El desplegable lleva dentro con qué producto se une, así que cambiarlo no
// obliga a volver a dibujar la tabla. Los parecidos van arriba con su nombre y
// su confianza a la vista —«Unir con “Plátano maduro” (82 %)»— y el catálogo
// entero debajo, porque el parecido que hace falta no siempre es el que la
// máquina propone.
function opcionesDecision(state, fila) {
  const nombre = texto(fila.nombre) || texto(fila.textoOriginal) || 'esta línea';
  const sugeridos = fila.candidatos || [];
  const vistos = new Set([...sugeridos.map(item => item.id), fila.exacto, fila.objetivo].filter(Boolean));
  const resto = state.products.filter(item => !item.archived && !vistos.has(item.id));
  const seleccion = valorDecision(fila);
  const opcion = (valor, etiqueta) => `<option value="${esc(valor)}" ${valor === seleccion ? 'selected' : ''}>${esc(etiqueta)}</option>`;
  const apuntado = product(state, fila.objetivo);
  const partes = [];
  if (apuntado) partes.push(opcion('incluir', `Es «${apuntado.name}», que ya tienes`));
  partes.push(opcion('nuevo', `Crear «${nombre}» como alimento nuevo`));
  partes.push(opcion('ocasional', DECIDIR.ocasional.texto));
  if (sugeridos.length) partes.push(`<optgroup label="Se parecen a esta línea">${sugeridos.map(item => opcion(`unir:${item.id}`, `Unir con «${item.nombre}» (${porcentaje(item.puntuacion)})`)).join('')}</optgroup>`);
  if (resto.length) partes.push(`<optgroup label="Unir con otro alimento del catálogo">${resto.map(item => opcion(`unir:${item.id}`, `Unir con «${item.name}»`)).join('')}</optgroup>`);
  partes.push(opcion('no-alimentario', DECIDIR['no-alimentario'].texto));
  partes.push(opcion('ignorar', DECIDIR.ignorar.texto));
  partes.push(opcion('lectura-mala', DECIDIR['lectura-mala'].texto));
  return partes.join('');
}

// Todo lo que la fila tiene que explicar, en una sola nota bajo el nombre: es
// la columna ancha y es donde mira quien está corrigiendo.
function notasHTML(ctx, fila) {
  const notas = [];
  const elegido = ['unir', 'incluir', 'ocasional'].includes(fila.decision) ? product(ctx.state, fila.objetivo) : null;
  // Con qué confianza se cruzó y por qué camino: una coincidencia exacta se
  // aprueba de un vistazo y una deducida de tres letras se mira dos veces.
  if (fila.match && fila.match.productId !== elegido?.id) notas.push(`La máquina la cruzó con «${fila.match.nombre}» (${porcentaje(fila.match.puntuacion)}, por ${fila.match.motivo}).`);
  if (elegido) {
    notas.push(fila.match?.productId === elegido.id
      ? `Se contará dentro de «${elegido.name}» (${porcentaje(fila.match.puntuacion)} de parecido, por ${fila.match.motivo}).`
      : `Se contará dentro de «${elegido.name}».`);
    const nuevos = aliasNuevos(fila, elegido);
    if (nuevos.length) notas.push(`${nuevos.map(valor => `«${valor}»`).join(' y ')} ${nuevos.length === 1 ? 'quedará guardado' : 'quedarán guardados'} como otra forma de llamarlo, para no volver a preguntarlo el mes que viene.`);
  }
  if (fila.aviso) notas.push(fila.aviso);
  if (fila.unidadDeducida && texto(fila.cantidad) !== '') notas.push(`No se leyó la unidad: se propone «${fila.unidad}». Cámbiala si no es esa.`);
  const estado = estadoDe(fila);
  if (ESTADOS[estado].nota) notas.push(ESTADOS[estado].nota);
  return notas.length ? `<p class="invoice-nota tiny">${notas.map(esc).join(' ')}</p>` : '';
}

// Lo que el supermercado imprime —«PLAT MAD 6 UND»— es justo lo que va a volver
// a aparecer el mes que viene. Guardarlo como alias del alimento con el que se
// unió es lo que hace que la próxima factura se cruce sola, sin preguntar otra
// vez lo mismo. Se guarda también el nombre escrito si es otro: así se aprenden
// las dos formas, la del papel y la de la casa.
function aliasNuevos(fila, item) {
  const conocidos = new Set([item.normalized, ...(item.aliases || []).map(valor => normalizeName(valor))]);
  const salida = [];
  for (const valor of [texto(fila.nombre), texto(fila.textoOriginal)]) {
    const clave = normalizeName(valor);
    if (!clave || conocidos.has(clave)) continue;
    conocidos.add(clave);
    salida.push(valor);
  }
  return salida;
}

/* ── Paso 4: el hábito, que es lo que de verdad vale ───────────────────── */

// Las facturas guardadas, en la forma que espera invoices.js. Se leen del
// estado y no de la pantalla: lo que se aprobó en sesiones anteriores cuenta
// igual, y es justamente al juntar meses cuando esto empieza a servir.
const facturasGuardadas = state => (state.invoices || []).map(factura => ({ mes: factura.mes, lineas: factura.lineas || [] }));

function pasoHabitos(ctx, invoice, factura) {
  const { state } = ctx;
  const guardadas = facturasGuardadas(state);
  const propuesta = proponerCanasta(guardadas);
  const cuenta = frecuencias(guardadas);
  const meses = new Set(guardadas.map(item => item.mes).filter(Boolean)).size;
  const filas = [...propuesta.base, ...propuesta.ocasionales];
  return `<form data-form="invoice-habitos" class="stack invoice">
    ${barraPasos('habitos')}
    <div class="card stack">
      <h2>Qué se repite en tus facturas</h2>
      <p class="muted">${meses ? `${guardadas.length} ${guardadas.length === 1 ? 'factura' : 'facturas'} en ${meses} ${meses === 1 ? 'mes' : 'meses'} distintos.` : 'Todavía no hay ninguna factura con fecha.'} Nada de esto se aplica solo: marca lo que quieras y confirma cada cantidad.</p>
      ${factura?.guardada ? notice('Factura guardada', esc(factura.mensaje || 'Los alimentos aprobados ya están en tu catálogo.')) : ''}
      ${factura?.guardada ? bloquePrivacidad(factura) : ''}
      ${propuesta.avisos.map(aviso => notice('Antes de creerte estos números', esc(aviso), 'warn')).join('')}
      ${filas.length ? tablaHabitos(ctx, filas, cuenta) : '<p class="muted">Cuando tengas facturas de dos meses distintos, aquí saldrá qué compras siempre y cuánto.</p>'}
      ${filas.length ? `<label class="check-chip invoice-confirma">
        <input type="checkbox" name="confirmo" value="si">
        Sí: revisé estas cantidades y quiero guardarlas en mi canasta base.
      </label>` : ''}
      <div class="modal-actions">
        ${button('Escanear otra factura', 'invoice-otra-factura', 'btn-quiet')}
        ${button('Terminar', 'invoice-terminar', 'btn-secondary')}
        ${filas.length ? '<button type="submit" class="btn btn-primary">Guardar lo marcado en la canasta base</button>' : ''}
      </div>
    </div>
  </form>`;
}

function tablaHabitos(ctx, filas, cuenta) {
  const detalle = new Map(cuenta.map(fila => [fila.clave, fila]));
  return `<div class="table-wrap invoice-wrap">
    <table class="data-table invoice-table invoice-habitos">
      <caption class="invoice-caption">Cada alimento con las veces que apareció y la cantidad que sale de tus propias compras. Marca solo lo que quieras guardar.</caption>
      <thead><tr>
        <th scope="col">Guardar</th>
        <th scope="col">Alimento</th>
        <th scope="col">En cuántas facturas</th>
        <th scope="col">Cantidad al mes</th>
        <th scope="col">Unidad</th>
        <th scope="col">De dónde sale</th>
      </tr></thead>
      <tbody>${filas.map(fila => filaHabito(ctx, fila, detalle.get(fila.clave))).join('')}</tbody>
    </table>
  </div>`;
}

function filaHabito(ctx, fila, detalle) {
  const item = product(ctx.state, fila.clave);
  const nombre = item?.name || fila.nombre;
  const cantidades = (detalle?.cantidades || fila.cantidades || []);
  const mediana = fila.cantidadSugerida;
  const origen = cantidades.length
    ? `Mediana de ${cantidades.map(valor => String(valor)).join(', ')}${cantidades.length > 1 ? ` (${cantidades.length} meses)` : ''}.`
    : 'Ninguna de esas compras traía cantidad legible: escribe tú cuánto se consume al mes.';
  return `<tr class="invoice-fila ${mediana === null ? 'invoice-destacada' : ''}" data-invoice-habito data-clave="${esc(fila.clave)}">
    <td class="invoice-celda-marca">
      <label class="check-chip invoice-marca">
        <input type="checkbox" name="guardar" value="${esc(fila.clave)}">
        <span class="invoice-oculto">Guardar ${esc(nombre)} en la canasta base</span>
      </label>
    </td>
    <td class="invoice-celda-nombre">
      <span class="invoice-etiqueta">Alimento</span>
      <strong>${esc(nombre)}</strong>
      <input type="hidden" name="nombre-${esc(fila.clave)}" value="${esc(nombre)}" data-invoice-nombre-habito>
      <span class="pill ${fila.recomendacion === 'base' ? '' : 'gray'}">${fila.recomendacion === 'base' ? 'de todos los meses' : 'de vez en cuando'}</span>
    </td>
    <td class="invoice-celda-veces">
      <span class="invoice-etiqueta">En cuántas facturas</span>
      ${esc(`en ${fila.apariciones} de ${fila.totalMeses || fila.apariciones} ${(fila.totalMeses || fila.apariciones) === 1 ? 'mes' : 'meses'}`)}
    </td>
    <td class="invoice-celda-cantidad">
      <label class="field"><span>Cantidad al mes</span>
        <input type="number" name="cantidad-${esc(fila.clave)}" value="${esc(mediana === null ? '' : mediana)}" min="0" step="any" inputmode="decimal" placeholder="Escríbela" data-invoice-cantidad>
      </label>
    </td>
    <td class="invoice-celda-unidad">
      <label class="field"><span>Unidad</span>
        <select name="unidad-${esc(fila.clave)}" data-invoice-unidad>${options(UNITS.map(unidad => [unidad, unidad]), fila.unidad || item?.controlUnit || 'unidad')}</select>
      </label>
    </td>
    <td class="invoice-celda-origen"><span class="invoice-etiqueta">De dónde sale</span><span class="tiny muted">${esc(origen)}</span></td>
  </tr>`;
}

// Borrar la foto no cuesta ni un alimento: viven en almacenes distintos y con
// vidas distintas. Decirlo aquí, en el momento en que se ofrece, es lo que hace
// que alguien se atreva a borrarlas.
function bloquePrivacidad(factura) {
  const quedan = factura.imagenes.length;
  if (!quedan) return notice('Las fotos ya no están', 'Se borraron de este dispositivo. Los alimentos y las cantidades que aprobaste se quedaron: son datos tuyos y viven aparte.');
  return `<div class="card soft stack invoice-privacidad">
    <h3>¿Borro las fotos?</h3>
    <p class="small">Ya no hacen falta: lo que aprobaste está guardado. Una factura dice dónde compras, qué compras y cuánto pagas; si no la necesitas, lo más limpio es no tenerla.</p>
    <p class="small"><strong>Borrarlas no toca nada de lo aprobado:</strong> los ${quedan === 1 ? 'alimentos y la cantidad' : 'alimentos y las cantidades'} se quedan donde están.</p>
    <div class="modal-actions">
      ${button(`Borrar las ${quedan} ${fotos(quedan)} de esta factura`, 'invoice-borrar-imagenes', 'btn-danger', `data-factura="${esc(factura.id)}"`)}
    </div>
  </div>`;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

// Las acciones y los formularios avisan por su cuenta en vez de dejar escapar
// el error: así el mensaje llega igual aunque quien integre el módulo no los
// envuelva en su propio try/catch.
const intentar = (ctx, fn) => {
  try { fn(); } catch (error) { ctx.toast?.(error.message, true); }
};
const intentarAsync = async (ctx, fn) => {
  try { await fn(); } catch (error) { ctx.toast?.(error.message, true); }
};

// El envío de verdad. callProvider promete no lanzar por red, pero el try está
// igual: si algo se rompiera aquí, las fotos y lo escrito tienen que seguir en
// pie para poder reintentar.
async function enviar(ctx, factura) {
  const invoice = invoiceDe(ctx);
  invoice.error = '';
  envio = { facturaId: factura.id, control: new AbortController() };
  ctx.render?.();
  let respuesta;
  try {
    respuesta = await callProvider('vision', {
      imagenes: factura.imagenes.map(foto => base64De(foto.dataUrl)),
      pista: 'factura'
    }, { signal: envio.control.signal, timeoutMs: ESPERA_VISION });
  } catch {
    respuesta = { ok: false, error: 'No se pudo hablar con el servicio. Las fotos siguen aquí.' };
  }
  envio = null;
  if (!respuesta.ok) {
    invoice.error = respuesta.error || 'No se pudo leer la factura.';
    ctx.render?.();
    return;
  }
  try {
    const datos = respuesta.data || {};
    factura.extraccion = datos;
    // El simulador se marca a sí mismo. Enseñarlo como una lectura de verdad
    // sería meterle a alguien en el inventario dos líneas inventadas.
    factura.simulada = datos.simulated === true;
    const revision = revisarFactura(datos, ctx.state.products);
    if (!revision.lineas.length) {
      invoice.error = 'El servicio contestó, pero sin ninguna línea. Suele pasar con fotos movidas o a contraluz: repite la foto, o escribe las líneas a mano.';
      ctx.render?.();
      return;
    }
    factura.revision = { ...revision, lineas: revision.lineas.map(linea => construirFila(ctx.state, linea)) };
    factura.fecha = factura.fecha || revision.fecha || '';
    factura.establecimiento = factura.establecimiento || revision.establecimiento || '';
    invoice.paso = 'revisar';
  } catch {
    // La respuesta llegó pero no se pudo convertir en tabla. Las fotos siguen
    // en pie, que es lo que permite reintentar sin volver a fotografiar.
    invoice.error = 'El servicio respondió algo que no se entiende. Inténtalo otra vez o escribe las líneas a mano.';
  }
  ctx.render?.();
}

// `enviar` es asíncrona y nadie la espera: se lanza y la pantalla se redibuja
// sola cuando termina. Un fallo suyo no puede quedarse en una promesa colgada
// sin que el usuario se entere.
const lanzar = (ctx, factura) => { enviar(ctx, factura).catch(error => ctx.toast?.(error.message, true)); };

function empezarLectura(ctx, factura) {
  const invoice = invoiceDe(ctx);
  invoice.paso = 'leyendo';
  invoice.error = '';
  // Sin servicio se entra igual en el paso de lectura: es ahí donde se dice,
  // con todas las letras, que no se leyó nada y cuáles son las dos salidas.
  if (!ctx.servicios?.vision || !permisoDeEnvio) { ctx.render?.(); return; }
  lanzar(ctx, factura);
}

export const INVOICE_ACTIONS = {
  'invoice-otra-factura': (el, ctx) => intentar(ctx, () => {
    const invoice = sincronizar(el, ctx);
    Object.assign(invoice, { paso: 'capturar', error: '', avisos: [] });
    nuevaFactura(invoice);
    ctx.render?.();
  }),

  'invoice-girar': (el, ctx) => intentarAsync(ctx, async () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaPorId(invoice, el.dataset.factura);
    const indice = factura?.imagenes.findIndex(foto => foto.id === el.dataset.foto) ?? -1;
    if (indice < 0) return;
    factura.imagenes[indice] = await girar(factura.imagenes[indice]);
    ctx.render?.();
  }),

  'invoice-quitar-foto': (el, ctx) => intentar(ctx, () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaPorId(invoice, el.dataset.factura);
    if (!factura) return;
    const foto = factura.imagenes.find(item => item.id === el.dataset.foto);
    factura.imagenes = factura.imagenes.filter(item => item.id !== el.dataset.foto);
    // La copia guardada en el dispositivo se va con ella: quitarla de la
    // pantalla y dejarla en el disco sería justo lo contrario de lo que se pidió.
    // No se espera al borrado para redibujar —la foto ya no está en la
    // pantalla— pero el fallo sí se dice, porque si no se borró hay que saberlo.
    if (foto?.guardada) borrarImagen(foto.guardada).catch(error => ctx.toast?.(error.message, true));
    ctx.render?.();
  }),

  'invoice-quitar-factura': (el, ctx) => intentarAsync(ctx, async () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaPorId(invoice, el.dataset.factura);
    if (!factura) return;
    invoice.facturas = invoice.facturas.filter(item => item.id !== factura.id);
    if (invoice.actual === factura.id) invoice.actual = invoice.facturas[invoice.facturas.length - 1]?.id || null;
    if (!invoice.facturas.length) invoice.paso = 'capturar';
    ctx.render?.();
    // Las fotos de esa importación se van con ella, estén donde estén.
    const borradas = await limpiarFotos(ctx, factura);
    ctx.toast?.(borradas ? `Factura quitada con sus ${borradas} ${fotos(borradas)}.` : 'Factura quitada.');
  }),

  'invoice-continuar': (el, ctx) => intentar(ctx, () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaActual(invoice) || invoice.facturas[invoice.facturas.length - 1];
    if (!factura || !factura.imagenes.length) throw new Error('Añade al menos una foto de la factura, o escribe las líneas a mano.');
    invoice.actual = factura.id;
    empezarLectura(ctx, factura);
  }),

  // Una vez por sesión, no una vez y para siempre: al recargar la app se vuelve
  // a preguntar antes de que salga la primera foto.
  'invoice-permiso-si': (el, ctx) => intentar(ctx, () => {
    const invoice = invoiceDe(ctx);
    const factura = facturaActual(invoice);
    if (!factura) return;
    permisoDeEnvio = true;
    lanzar(ctx, factura);
  }),

  'invoice-permiso-no': (el, ctx) => intentar(ctx, () => {
    const invoice = invoiceDe(ctx);
    invoice.paso = 'capturar';
    ctx.render?.();
    ctx.toast?.('No se envió nada. Las fotos siguen en este dispositivo.');
  }),

  'invoice-cancelar-lectura': (el, ctx) => intentar(ctx, () => {
    envio?.control.abort();
    envio = null;
    const invoice = invoiceDe(ctx);
    invoice.paso = 'capturar';
    ctx.render?.();
    ctx.toast?.('Lectura cancelada. Las fotos y lo que escribiste siguen aquí.');
  }),

  'invoice-reintentar': (el, ctx) => intentar(ctx, () => {
    const invoice = invoiceDe(ctx);
    const factura = facturaActual(invoice);
    if (factura) lanzar(ctx, factura);
  }),

  'invoice-volver-capturar': (el, ctx) => intentar(ctx, () => {
    const invoice = sincronizar(el, ctx);
    Object.assign(invoice, { paso: 'capturar', error: '' });
    ctx.render?.();
  }),

  // Las fotos solo tocan el disco cuando alguien lo pide. Mientras tanto viven
  // en memoria y desaparecen al cerrar, que es lo que casi siempre se quiere.
  'invoice-guardar-fotos': (el, ctx) => intentarAsync(ctx, async () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaActual(invoice) || invoice.facturas[invoice.facturas.length - 1];
    if (!factura) throw new Error('Todavía no hay ninguna factura que guardar.');
    if (!disponible()) throw new Error('Este navegador no deja guardar fotos. Escribe las líneas a mano: lo que apruebes se guarda igual.');
    let guardadas = 0;
    for (const foto of factura.imagenes) {
      if (foto.guardada) continue;
      foto.guardada = await guardarImagen(aBlob(foto.dataUrl), {
        facturaId: factura.id, nombre: foto.nombre, fecha: factura.fecha, establecimiento: factura.establecimiento
      });
      guardadas++;
    }
    ctx.render?.();
    ctx.toast?.(guardadas ? `${guardadas} ${fotos(guardadas)} guardadas en este dispositivo. Nadie las ha leído.` : 'Esas fotos ya estaban guardadas.');
  }),

  'invoice-recuperar-fotos': (el, ctx) => intentarAsync(ctx, async () => {
    const invoice = sincronizar(el, ctx);
    if (!disponible()) throw new Error('Este navegador no deja guardar ni recuperar fotos.');
    const fichas = await listarImagenes();
    const yaEstan = new Set(invoice.facturas.flatMap(factura => factura.imagenes.map(foto => foto.guardada).filter(Boolean)));
    const pendientes = fichas.filter(ficha => !yaEstan.has(ficha.id));
    if (!pendientes.length) { ctx.toast?.('No hay fotos guardadas que recuperar.'); return; }
    procesando = true;
    ctx.render?.();
    try {
      for (const ficha of pendientes) {
        const guardada = await leerImagen(ficha.id);
        if (!guardada) continue;
        const grupo = ficha.meta?.facturaId || nuevoId('factura');
        let factura = facturaPorId(invoice, grupo);
        if (!factura) {
          factura = nuevaFactura(invoice);
          // El identificador de la factura se conserva: es la clave con la que
          // sus fotos quedaron guardadas, y cambiarlo dejaría fotos huérfanas.
          factura.id = grupo;
          factura.fecha = ficha.meta?.fecha || '';
          factura.establecimiento = ficha.meta?.establecimiento || '';
          invoice.actual = grupo;
        }
        const dataUrl = await aDataUrl(guardada.blob);
        factura.imagenes.push({
          id: nuevoId('foto'), dataUrl, ancho: 0, alto: 0, tamano: Number(guardada.blob.size) || pesoDe(dataUrl),
          nombre: ficha.meta?.nombre || 'foto guardada', guardada: ficha.id
        });
      }
    } finally {
      procesando = false;
    }
    invoice.paso = 'capturar';
    ctx.render?.();
    ctx.toast?.(`${pendientes.length} ${fotos(pendientes.length)} recuperadas.`);
  }),

  'invoice-linea-nueva': (el, ctx) => intentar(ctx, () => {
    const invoice = sincronizar(el, ctx);
    const factura = facturaActual(invoice);
    if (!factura?.revision) return;
    factura.revision.lineas = [...factura.revision.lineas, filaVacia(factura.revision.lineas)];
    ctx.render?.();
  }),

  'invoice-borrar-imagenes': (el, ctx) => intentarAsync(ctx, async () => {
    const invoice = invoiceDe(ctx);
    const factura = facturaPorId(invoice, el.dataset.factura);
    if (!factura) return;
    const cuantas = factura.imagenes.length;
    await limpiarFotos(ctx, factura);
    factura.imagenes = [];
    ctx.render?.();
    ctx.toast?.(`${cuantas} ${fotos(cuantas)} ${cuantas === 1 ? 'borrada' : 'borradas'}. Los alimentos que aprobaste se quedan.`);
  }),

  'invoice-terminar': (el, ctx) => intentar(ctx, () => {
    const invoice = invoiceDe(ctx);
    Object.assign(invoice, emptyInvoice());
    ctx.closeModal?.();
  })
};

// Tira del disco las fotos de una importación. Devuelve cuántas se fueron de
// allí, que es lo único que se le puede prometer al usuario; las de memoria las
// quita quien llama. Un fallo del almacén no puede tumbar la pantalla: se dice
// y se sigue.
async function limpiarFotos(ctx, factura) {
  if (!disponible() || !factura.imagenes.some(foto => foto.guardada)) return 0;
  try { return await borrarFactura(factura.id); }
  catch (error) { ctx.toast?.(error.message, true); return 0; }
}

/* ── Formularios ───────────────────────────────────────────────────────── */

export const INVOICE_FORMS = {
  // Añadir fotos. El campo de archivo se envía solo al elegir (abajo hay un
  // vigilante), y el botón sigue estando para quien llegue por teclado.
  'invoice-capturar': (form, data, ctx) => intentarAsync(ctx, async () => {
    const invoice = invoiceDe(ctx);
    leerFichas(invoice, form);
    const entradas = [...form.querySelectorAll('[data-invoice-archivos]')];
    const archivos = entradas.flatMap(input => [...(input.files || [])]);
    // Se vacían antes de trabajar: si no, elegir la misma foto dos veces no
    // dispara el cambio y parece que la app se quedó colgada.
    for (const input of entradas) input.value = '';
    if (!archivos.length) throw new Error('Elige o toma al menos una foto.');
    const factura = facturaActual(invoice) || nuevaFactura(invoice);
    invoice.avisos = [];
    procesando = true;
    ctx.render?.();
    try {
      for (const archivo of archivos) {
        try { factura.imagenes.push(await reducir(archivo)); }
        catch { invoice.avisos.push(`«${archivo.name || 'una de las fotos'}» no se pudo abrir: prueba con otra o tómala de nuevo.`); }
      }
    } finally {
      procesando = false;
    }
    ctx.render?.();
  }),

  'invoice-revision': (form, data, ctx) => intentar(ctx, () => {
    const invoice = invoiceDe(ctx);
    const factura = facturaPorId(invoice, form.dataset.factura) || facturaActual(invoice);
    if (!factura?.revision) throw new Error('Esta factura ya no está en la pantalla.');
    factura.revision.lineas = leerFilas(ctx.state, form, factura.revision.lineas);
    factura.fecha = String(data.get('fecha') || '');
    factura.establecimiento = texto(data.get('tienda'));
    factura.destino = data.get('destino') === 'compra' ? 'compra' : 'aprender';
    const mensaje = guardar(ctx, factura, data);
    factura.guardada = true;
    factura.mensaje = mensaje;
    invoice.paso = 'habitos';
    invoice.error = '';
    ctx.commit?.(mensaje);
  }),

  'invoice-habitos': (form, data, ctx) => intentar(ctx, () => {
    const mensaje = guardarCanasta(ctx, form, data);
    ctx.commit?.(mensaje);
  })
};

/* ── Guardar la factura ────────────────────────────────────────────────── */

function guardar(ctx, factura, datos) {
  const { state } = ctx;
  const filas = aprobadas(factura.revision.lineas);
  const descartadas = factura.revision.lineas.length - filas.length;
  if (!filas.length) throw new Error('No queda ninguna línea aprobada. Escribe el nombre de al menos una, o cierra sin guardar.');
  for (const fila of filas) {
    if (!UNITS.includes(fila.unidad)) throw new Error(`Elige la unidad de «${fila.nombre}».`);
    if (texto(fila.cantidad) !== '' && !(Number(fila.cantidad) > 0)) throw new Error(`La cantidad de «${fila.nombre}» tiene que ser mayor que cero, o déjala vacía.`);
  }
  const fecha = String(factura.fecha || '');
  if (fecha && !validDate(fecha)) throw new Error('La fecha de la factura no es válida. Escríbela como día, mes y año, o déjala vacía.');
  const registrar = factura.destino === 'compra';
  if (registrar) {
    if (datos.get('confirmo') !== 'si') throw new Error('Marca la casilla de confirmación: registrar la compra sube tus existencias.');
    if (!fecha) throw new Error('Para registrar la compra hace falta la fecha de la factura: es el día en que esos alimentos entraron en casa.');
    const faltan = filas.filter(fila => texto(fila.cantidad) === '');
    if (faltan.length) throw new Error(`Una compra necesita cantidades. Escribe cuánto compraste de ${faltan.map(fila => `«${fila.nombre}»`).join(', ')}, o guarda la factura solo para aprender.`);
  }

  // O entra todo o no entra nada: medio catálogo creado con la compra a medias
  // es imposible de arreglar a mano después.
  return transaction(state, () => {
    const ids = new Map();
    let creados = 0;
    for (const fila of filas) {
      // «Crear nuevo» crea, aunque la máquina hubiera propuesto otra cosa: es
      // una decisión explícita. Lo único que no hace es duplicar un alimento
      // que ya se llama exactamente igual.
      const existente = fila.decision === 'nuevo'
        ? productByName(state, fila.nombre) || null
        : product(state, fila.objetivo) || productByName(state, fila.nombre) || null;
      if (fila.decision === 'unir' && !existente) throw new Error(`El alimento con el que se iba a unir «${fila.nombre}» ya no existe. Elige otro o créalo nuevo.`);
      if (existente) {
        const alias = aliasNuevos(fila, existente);
        if (alias.length) updateProduct(state, existente.id, { aliases: [...existente.aliases, ...alias] });
        ids.set(fila.id, existente.id);
        continue;
      }
      // Existencias en cero, siempre. Un alimento que aparece en la factura de
      // junio no dice nada sobre lo que hay hoy en la despensa, y arrancarlo
      // con la cantidad de la factura sería inventarse un inventario.
      const item = addProduct(state, {
        name: texto(fila.nombre),
        category: fila.categoria,
        controlUnit: fila.unidad,
        purchaseUnit: fila.unidad,
        origin: 'factura',
        opening: ''
      });
      ids.set(fila.id, item.id);
      creados++;
    }

    let compra = null;
    if (registrar) {
      // La equivalencia se comprueba antes para poder explicarlo en español: si
      // se dejara fallar a addPurchase, el mensaje hablaría de configurar algo
      // sin decir que existe la alternativa de no registrar la compra.
      for (const fila of filas) {
        const productId = ids.get(fila.id);
        if (convert(state, productId, Number(fila.cantidad), fila.unidad) === null) {
          const item = product(state, productId);
          throw new Error(`«${item.name}» se cuenta en ${item.controlUnit} y la factura dice ${fila.unidad}. Configura esa equivalencia en su ficha, o guarda la factura solo para aprender.`);
        }
      }
      compra = addPurchase(state, {
        date: fecha,
        basis: 'factura',
        lines: filas.map(fila => ({ productId: ids.get(fila.id), quantity: fila.cantidad, unit: fila.unidad }))
      });
    }

    // Lo único que se guarda de la factura: las líneas aprobadas, su alimento y
    // su mes. Ni el total, ni la caja, ni la tarjeta, ni la foto —esa vive en
    // su propio almacén y se borra aparte—. Las descartadas se cuentan, pero no
    // se copia ni su texto: son justamente las que el usuario dijo que no.
    state.invoices.push({
      id: nextId(state, 'factura'),
      fecha: fecha || null,
      mes: fecha ? fecha.slice(0, 7) : null,
      establecimiento: texto(factura.establecimiento) || null,
      importada: todayISO(),
      compraId: compra?.id || null,
      descartadas,
      lineas: filas.map(fila => ({
        textoOriginal: texto(fila.textoOriginal),
        nombreSugerido: texto(fila.nombre),
        cantidad: texto(fila.cantidad) === '' ? null : Number(fila.cantidad),
        unidad: fila.unidad,
        decision: fila.decision === 'ocasional' ? 'ocasional' : 'incluir',
        match: { productId: ids.get(fila.id), nombre: product(state, ids.get(fila.id)).name }
      }))
    });

    const nuevos = creados ? ` ${creados} ${creados === 1 ? 'se registró' : 'se registraron'} por primera vez.` : '';
    return registrar
      ? `Factura guardada con ${filas.length} ${alimentos(filas.length)} y registrada como compra del ${fecha}.${nuevos} Las existencias subieron desde esa fecha.`
      : `Factura guardada con ${filas.length} ${alimentos(filas.length)}.${nuevos} Tus existencias de hoy no se tocaron.`;
  });
}

/* ── Guardar la canasta que salió del hábito ───────────────────────────── */

function guardarCanasta(ctx, form, datos) {
  const { state } = ctx;
  if (datos.get('confirmo') !== 'si') throw new Error('Marca la casilla: estas cantidades son una propuesta calculada, no un dato tuyo, y no se guardan sin que las confirmes.');
  // Se recorren las filas y no los `name`: la clave puede ser un nombre
  // normalizado con espacios, y meter eso dentro de un selector es pedir un
  // error de sintaxis justo al guardar.
  const elegidas = [...form.querySelectorAll('[data-invoice-habito]')]
    .filter(fila => fila.querySelector('[name="guardar"]')?.checked)
    .map(fila => ({
      clave: fila.dataset.clave,
      nombre: texto(fila.querySelector('[data-invoice-nombre-habito]')?.value),
      cantidad: fila.querySelector('[data-invoice-cantidad]')?.value ?? '',
      unidad: fila.querySelector('[data-invoice-unidad]')?.value || 'unidad'
    }));
  if (!elegidas.length) throw new Error('Marca al menos un alimento para guardarlo en la canasta base.');
  for (const fila of elegidas) {
    if (texto(fila.cantidad) === '') throw new Error(`Escribe cuánto «${fila.nombre}» se consume al mes, o quítale la marca: no se guarda una canasta con huecos inventados.`);
    if (!(Number(fila.cantidad) > 0)) throw new Error(`La cantidad de «${fila.nombre}» tiene que ser mayor que cero.`);
    if (!UNITS.includes(fila.unidad)) throw new Error(`Elige la unidad de «${fila.nombre}».`);
  }
  return transaction(state, () => {
    // Las líneas nuevas se suman a las que ya estaban; la canasta no se
    // reemplaza. El alimento que ya tenía línea se queda con la cantidad nueva
    // en vez de duplicarse: dos líneas del mismo arroz contarían dos veces en
    // la lista de compra.
    const previas = baseLines(state).map(linea => ({ id: linea.id, productId: linea.productId, quantity: linea.quantity, unit: linea.unit, priority: linea.priority }));
    for (const fila of elegidas) {
      const item = product(state, fila.clave) || productByName(state, fila.nombre);
      const linea = item
        ? { productId: item.id, quantity: fila.cantidad, unit: fila.unidad, priority: 'frecuente' }
        : { name: fila.nombre, quantity: fila.cantidad, unit: fila.unidad, priority: 'frecuente' };
      const indice = item ? previas.findIndex(previa => previa.productId === item.id) : -1;
      if (indice >= 0) previas[indice] = { ...linea, id: previas[indice].id, priority: previas[indice].priority };
      else previas.push(linea);
    }
    setBaseBasket(state, previas, { origin: 'factura' });
    return `Canasta base: ${elegidas.length} ${alimentos(elegidas.length)} ${elegidas.length === 1 ? 'guardado' : 'guardados'} con las cantidades que confirmaste.`;
  });
}

/* ── El resumen en vivo ────────────────────────────────────────────────── */

// El contador y el botón dicen un número, y un número que miente es peor que no
// tenerlo: si alguien marca una línea para ignorar, el botón tiene que dejar de
// prometer que la guardará. Se actualizan leyendo el propio formulario, sin
// tocar el estado ni volver a dibujar, que es lo que borraría lo ya escrito.
function refrescarRevision(form) {
  const filas = [...form.querySelectorAll('[data-invoice-row]')].map(tr => {
    const leida = leerDecision(tr.querySelector('[data-invoice-decision]')?.value);
    return {
      tr,
      nombre: tr.querySelector('[data-invoice-nombre]')?.value || '',
      cantidad: tr.querySelector('[data-invoice-cantidad]')?.value || '',
      confianzaNivel: tr.dataset.nivel || 'alta',
      // El desplegable siempre trae valor; si faltara, se respeta el estado que
      // la fila ya enseñaba en vez de inventarle una decisión.
      decision: leida.decision || tr.dataset.decision || 'ignorar',
      objetivo: leida.objetivo
    };
  });
  for (const fila of filas) {
    const estado = estadoDe(fila);
    fila.tr.dataset.estado = estado;
    fila.tr.classList.toggle('invoice-destacada', DESTACADAS.has(estado));
    const etiqueta = fila.tr.querySelector('[data-invoice-estado]');
    if (etiqueta) {
      etiqueta.textContent = ESTADOS[estado].texto;
      etiqueta.className = `pill ${ESTADOS[estado].pill}`;
    }
  }
  const destino = form.querySelector('[name="destino"]:checked')?.value || 'aprender';
  // La confirmación solo tiene sentido cuando se va a registrar la compra, y
  // enseñarla siempre haría que se marcara sin leerla.
  const bloque = form.querySelector('[data-invoice-compra]');
  if (bloque) {
    bloque.hidden = destino !== 'compra';
    if (destino !== 'compra') {
      const casilla = bloque.querySelector('[name="confirmo"]');
      if (casilla) casilla.checked = false;
    }
  }
  const cuenta = form.querySelector('[data-invoice-cuenta]');
  if (cuenta) cuenta.textContent = textoCuenta(filas);
  const boton = form.querySelector('[data-invoice-guardar]');
  if (boton) boton.textContent = textoGuardar(filas, destino);
}

// Se engancha al importar y solo reacciona dentro de esta pantalla, para no
// pedirle a app.js que conozca los detalles del módulo. El guardia de
// `document` existe porque el mismo módulo se importa desde las pruebas, donde
// no hay DOM.
if (typeof document !== 'undefined') {
  const vigilar = event => {
    const form = event.target?.closest?.('[data-form="invoice-revision"]');
    if (form) refrescarRevision(form);
  };
  document.addEventListener('input', vigilar);
  document.addEventListener('change', event => {
    vigilar(event);
    // Elegir una foto tiene que añadirla sin un segundo toque: en el teléfono,
    // volver de la cámara y encontrarse un botón más es donde la gente se cae.
    const input = event.target;
    if (!input?.matches?.('[data-invoice-archivos]') || !input.files?.length) return;
    const suyo = input.form;
    if (!suyo) return;
    if (typeof suyo.requestSubmit === 'function') suyo.requestSubmit();
    else suyo.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
