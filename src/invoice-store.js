// Las fotos de las facturas no caben en localStorage —una sola foto de móvil
// se come la cuota entera—, así que viven en IndexedDB, aparte del estado de
// la casa.
//
// Y esa separación no es solo técnica: **borrar la imagen no borra los
// productos ya aprobados**. Son datos con vidas distintas. La foto es material
// de trabajo, sirve mientras se revisa la factura y después estorba; lo que el
// usuario aprobó —los productos, las cantidades, la canasta— es suyo y se
// queda en el estado normal de la app. Por eso aquí no se toca nada de eso:
// este módulo solo sabe de imágenes, y vaciarlo entero deja la app completa.

const BASE = 'que-comemos-facturas';
const VERSION = 1;
// Dos almacenes en vez de uno: las fichas son objetos diminutos y las fotos
// pesan megas. Así listar las imágenes de una factura o sumar cuánto ocupan
// todas no obliga a arrastrar ni una foto a memoria.
const FICHAS = 'fichas';
const IMAGENES = 'imagenes';

const SIN_SOPORTE = 'Este navegador no puede guardar las fotos de las facturas. Escribe las líneas a mano: lo que apruebes se guarda igual.';

// Sync a propósito: quien llama necesita saber antes de enseñar el botón de la
// cámara si va a poder guardar, para ofrecer la escritura a mano en su lugar.
// El acceso va en try porque en modo privado algunos navegadores no dejan ni
// mirar la propiedad.
export function disponible() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

// El navegador habla con errores en inglés y nombres de clase; aquí abajo solo
// salen frases que el usuario pueda leer, y la de la cuota dice explícitamente
// que borrar fotos no le cuesta lo aprobado.
function traducir(error) {
  if (error && error.name === 'QuotaExceededError') return new Error('No queda espacio para más fotos. Borra las facturas ya revisadas: los productos que aprobaste no se pierden.');
  return error instanceof Error ? error : new Error('No se pudieron leer las fotos de las facturas.');
}

function solicitar(peticion) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(traducir(peticion.error));
  });
}

function crearAlmacenes(db) {
  if (!db.objectStoreNames.contains(FICHAS)) db.createObjectStore(FICHAS, { keyPath: 'id' }).createIndex('facturaId', 'facturaId');
  // Las fotos van con clave externa: el registro es el blob pelado, sin
  // envoltorio que obligue a deserializar nada al contarlas.
  if (!db.objectStoreNames.contains(IMAGENES)) db.createObjectStore(IMAGENES);
}

let conexion = null;

async function base() {
  if (!disponible()) throw new Error(SIN_SOPORTE);
  if (conexion) return conexion;
  const intento = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BASE, VERSION);
    peticion.onupgradeneeded = () => crearAlmacenes(peticion.result);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(traducir(peticion.error));
    peticion.onblocked = () => reject(new Error('Hay otra pestaña de ¿Qué comemos? abierta. Ciérrala y vuelve a intentarlo.'));
  });
  conexion = intento;
  // Una conexión que falló no puede quedarse cacheada para siempre: se olvida
  // para que el siguiente intento vuelva a abrir de cero.
  intento.catch(() => { if (conexion === intento) conexion = null; });
  return intento;
}

// IndexedDB habla con eventos y aquí se quiere async/await. La promesa se
// resuelve en 'complete', no al terminar la última petición: hasta que la
// transacción no cierra, lo escrito todavía se puede deshacer.
function transaccion(db, tiendas, modo, trabajo) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tiendas, modo);
    let resultado;
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(traducir(tx.error));
    tx.onabort = () => reject(traducir(tx.error));
    Promise.resolve(trabajo(tx)).then(
      valor => { resultado = valor; },
      error => {
        try { tx.abort(); } catch { /* ya estaba abortada */ }
        reject(traducir(error));
      }
    );
  });
}

const nuevoId = () => globalThis.crypto?.randomUUID?.() || `foto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// La ficha guarda el tamaño aparte de la foto para poder sumarlo después sin
// abrir ni una. `meta` se guarda tal cual llegó y sale tal cual: quien la
// escribió decide qué significa.
export async function guardarImagen(blob, meta = {}) {
  if (!blob) throw new Error('No hay ninguna foto que guardar.');
  const db = await base();
  const id = nuevoId();
  const ficha = { id, facturaId: meta.facturaId ?? null, creada: Date.now(), tamano: Number(blob.size) || 0, tipo: blob.type || '', meta: { ...meta } };
  await transaccion(db, [FICHAS, IMAGENES], 'readwrite', tx => {
    tx.objectStore(FICHAS).put(ficha);
    tx.objectStore(IMAGENES).put(blob, id);
  });
  return id;
}

// Devuelve null en vez de lanzar cuando no existe: que una foto ya borrada no
// aparezca es lo normal después de limpiar, no un error que valga interrumpir
// la revisión.
export async function leerImagen(id) {
  const db = await base();
  return transaccion(db, [FICHAS, IMAGENES], 'readonly', async tx => {
    const ficha = await solicitar(tx.objectStore(FICHAS).get(id));
    if (!ficha) return null;
    const blob = await solicitar(tx.objectStore(IMAGENES).get(id));
    return blob ? { blob, meta: ficha.meta } : null;
  });
}

// Sin facturaId lista todas. Las fotos que se guardaron sin factura no están
// en el índice —IndexedDB no indexa null—, así que solo salen por esa vía.
export async function listarImagenes(facturaId) {
  const db = await base();
  const fichas = await transaccion(db, [FICHAS], 'readonly', tx => {
    const almacen = tx.objectStore(FICHAS);
    return solicitar(facturaId === undefined || facturaId === null ? almacen.getAll() : almacen.index('facturaId').getAll(facturaId));
  });
  // En el orden en que se fotografiaron, que es el orden en que el usuario
  // recorrió el papel.
  return fichas.sort((a, b) => a.creada - b.creada).map(ficha => ({ id: ficha.id, meta: ficha.meta }));
}

// Ficha y foto se borran en la misma transacción: media pareja suelta dejaría
// una imagen sin dueño ocupando espacio que nadie sabría contar.
export async function borrarImagen(id) {
  const db = await base();
  await transaccion(db, [FICHAS, IMAGENES], 'readwrite', tx => {
    tx.objectStore(FICHAS).delete(id);
    tx.objectStore(IMAGENES).delete(id);
  });
}

// Tira las fotos de una factura ya revisada y devuelve cuántas eran. Lo que se
// aprobó de esa factura —productos, cantidades, canasta— vive en el estado de
// la app y no se entera de esto: aquí solo se está botando el papel.
export async function borrarFactura(facturaId) {
  if (facturaId === undefined || facturaId === null) return 0;
  const db = await base();
  return transaccion(db, [FICHAS, IMAGENES], 'readwrite', async tx => {
    const ids = await solicitar(tx.objectStore(FICHAS).index('facturaId').getAllKeys(facturaId));
    for (const id of ids) {
      tx.objectStore(FICHAS).delete(id);
      tx.objectStore(IMAGENES).delete(id);
    }
    return ids.length;
  });
}

// Bytes, para poder avisar antes de que el navegador se quede sin cuota y
// empiece a fallar en medio de una revisión. Solo lee fichas.
export async function tamanoTotal() {
  const db = await base();
  const fichas = await transaccion(db, [FICHAS], 'readonly', tx => solicitar(tx.objectStore(FICHAS).getAll()));
  return fichas.reduce((suma, ficha) => suma + (Number(ficha.tamano) || 0), 0);
}
