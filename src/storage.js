import { createDemoState } from './demo.js';
import { SCHEMA_VERSION, importState } from './model.js';

export const STORAGE_KEY = 'que-comemos-v1';
// Antes de escribir una versión nueva del esquema, lo que había se guarda tal
// cual aquí. Si la migración resultara estar mal —y de eso uno se entera días
// después, no en el momento—, los datos originales siguen existiendo. Ocupa el
// doble durante una temporada; perder la despensa de una casa cuesta más.
export const BACKUP_KEY = 'que-comemos-antes-de-migrar';

/* ── Un cajón por cuenta ───────────────────────────────────────────────────

   `STORAGE_KEY` sigue siendo el cajón de este teléfono: es donde está lo de
   quien lleva tiempo usando la app sin cuenta, y no se toca jamás. Cada cuenta
   que entre en este aparato tiene el suyo, `que-comemos-v1::<id>`, y de ahí sale
   la separación entre cuentas del lado del teléfono —la del lado del servidor la
   ponen las políticas por fila de la base de datos.

   Sin esto, María cerraría sesión, entraría Pedro y vería la despensa de María.
   Las tres funciones de abajo aceptan por eso una clave; sin ella se comportan
   exactamente como antes, que es lo que hace que nada de lo que ya existía se
   entere de este cambio. */

// Sin nada guardado es el primer arranque: la app muestra la bienvenida.
export function hasSavedState(storage = globalThis.localStorage, clave = STORAGE_KEY) {
  return Boolean(storage?.getItem(clave));
}

// Devuelve el estado y, además, si hubo que convertirlo. La app lo usa para
// avisar de una sola vez, no para decidir nada.
export function loadStateDetailed(storage = globalThis.localStorage, clave = STORAGE_KEY) {
  const saved = storage?.getItem(clave);
  if (!saved) return { state: createDemoState(), migrated: false, from: SCHEMA_VERSION };
  const parsedVersion = Number(JSON.parse(saved)?.version);
  // Validar antes de tocar nada: si `importState` lanza, lo guardado se queda
  // exactamente donde estaba y el error sube para que la app lo enseñe.
  const state = importState(saved);
  const migrated = Number.isInteger(parsedVersion) && parsedVersion < SCHEMA_VERSION;
  if (migrated) {
    try { storage.setItem(`${BACKUP_KEY}${clave === STORAGE_KEY ? '' : `::${clave}`}`, saved); } catch { /* Sin sitio para el respaldo, no migramos a ciegas. */ }
    saveState(state, storage, clave);
  }
  return { state, migrated, from: parsedVersion };
}

export function loadState(storage = globalThis.localStorage, clave = STORAGE_KEY) {
  return loadStateDetailed(storage, clave).state;
}

/* Guardar puede no ocurrir, y hasta ahora no ocurría en silencio.

   Esta línea era `storage?.setItem(clave, JSON.stringify(state));` y tenía dos
   formas de no escribir nada, ninguna de las cuales se notaba:

     · El almacenamiento lleno. `setItem` lanza, la excepción sube hasta el
       reparto de acciones y sale un aviso flotante de 4,2 segundos que dice «lo
       dejé como estaba» — y es mentira: el cambio ya estaba en pantalla; lo
       único que no pasó fue guardarlo.
     · `localStorage` inaccesible o apagado. El interrogante se traga la llamada
       entera: ni excepción, ni aviso, ni una línea en el cuaderno de fallos,
       mientras la pantalla enseña cada casilla marcada.

   Es el escenario del colmado, con una mano ocupada: se sigue marcando media
   hora encima de la nada y al volver a abrir la app no hay nada.

   Así que devuelve en qué quedó, y distingue los dos motivos, porque «no cabe»
   y «no hay dónde escribir» se arreglan de maneras distintas aunque los dos
   acaben en lo mismo. No lanza: quedarse sin pantalla porque el disco está
   lleno sería cambiar un fallo callado por uno peor. */
export function saveState(state, storage = globalThis.localStorage, clave = STORAGE_KEY) {
  if (!storage) return { ok: false, motivo: 'sin-almacen', detalle: '' };
  try {
    storage.setItem(clave, JSON.stringify(state));
    return { ok: true, motivo: '', detalle: '' };
  } catch (error) {
    return { ok: false, motivo: 'no-cabe', detalle: String(error?.message || '') };
  }
}

// Borrar de verdad, que no es lo mismo que empezar de cero.
//
// «Borrar todos mis datos» reemplazaba el estado y guardaba encima, y con eso
// parecía que no quedaba nada. Pero `que-comemos-antes-de-migrar` puede guardar
// una copia íntegra de todo lo anterior —se escribe sola al cambiar de versión
// del esquema— y seguía ahí después de borrar. Alguien que pide borrar sus
// datos no espera que quede una copia completa esperando en el mismo aparato.
//
// Se borra también `que-comemos-proveedores-v1`, aunque la función que la
// escribía —conectar un servidor propio— ya no existe: quien usó la app cuando
// existía puede tener ahí una dirección y un token guardados, y eso es
// precisamente lo que alguien que pide borrar sus datos espera que desaparezca.
// La clave se queda en esta lista mientras pueda haber un teléfono con ella.
//
// Se enumeran una por una en vez de barrer todo lo que empiece por
// `que-comemos-`: así, el día que alguien añada una clave nueva y se olvide de
// esta lista, el fallo es que sobrevive un dato —visible, arreglable— y no que
// se borre algo de otra aplicación que casualmente se llamaba parecido.
export function clearAll(storage = globalThis.localStorage) {
  const claves = [
    STORAGE_KEY,
    BACKUP_KEY,
    'que-comemos-proveedores-v1',
    'que-comemos-sidebar-collapsed',
    // Cómo se ha portado el micrófono en este teléfono: cuántas veces falló y si
    // la app dejó de abrirlo sola. No es un dato de la casa, pero sí es algo que
    // esta aplicación escribió, y «borrar todos mis datos» quiere decir todos.
    'que-comemos-voz-v1',
    // La sesión, con el token de quien está dentro. Dejar un token vivo
    // apuntando a una cuenta cuyos datos alguien acaba de pedir que
    // desaparezcan sería justo lo contrario de lo que pidió.
    'que-comemos-sesion-v1',
    // La copia que se guarda antes de traerse la versión del servidor encima.
    'que-comemos-antes-de-sincronizar',
    // El secreto a medio usar de un inicio de sesión con Google.
    'que-comemos-google-pkce',
    // Que alguien eligió seguir sin cuenta. Es una preferencia de este teléfono,
    // y borrar los datos incluye olvidar lo que se eligió.
    'que-comemos-sin-cuenta',
    // Qué cajón estaba abierto cuando caducó la sesión. Sin esta clave, la app
    // volvería a abrir la casa de una cuenta que alguien acaba de pedir que
    // desaparezca de este teléfono.
    'que-comemos-cajon-caducado',
    // Cuándo se aceptaron el aviso de privacidad y las condiciones, y qué
    // versión estaba delante. Quien pide borrar todo lo suyo también está
    // pidiendo que se olvide eso: la app vuelve a enseñarle los documentos.
    'que-comemos-acepto-v1',
    // Y los cajones de cada cuenta que haya entrado en este teléfono.
    ...cajonesDeCuentas(storage)
  ];
  const borradas = [];
  for (const clave of claves) {
    if (storage?.getItem(clave) === null || storage?.getItem(clave) === undefined) continue;
    try { storage.removeItem(clave); borradas.push(clave); } catch { /* Sin almacenamiento no hay nada que borrar. */ }
  }
  return borradas;
}

/* Los cajones de las cuentas sí se buscan por prefijo, y es la única excepción
   a la regla de enumerar a mano. El motivo es que no se pueden enumerar: llevan
   dentro el identificador de un usuario que esta función no conoce.

   La excepción es segura porque el prefijo es exacto y larguísimo,
   `que-comemos-v1::`, con dos puntos dobles que no aparecen por casualidad en
   la clave de nadie. No barre `que-comemos-` a secas, que es lo que sí podría
   llevarse por delante algo de otra aplicación llamada parecido. */
function cajonesDeCuentas(storage) {
  const prefijo = `${STORAGE_KEY}::`;
  const encontrados = [];
  try {
    for (let i = 0; i < Number(storage?.length || 0); i += 1) {
      const clave = storage.key(i);
      if (typeof clave === 'string' && clave.startsWith(prefijo)) encontrados.push(clave);
    }
  } catch { /* Un almacenamiento que no se deja recorrer no tiene cajones que borrar. */ }
  return encontrados;
}
