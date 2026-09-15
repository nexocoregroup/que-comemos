import { createDemoState } from './demo.js';
import { SCHEMA_VERSION, importState } from './model.js';

export const STORAGE_KEY = 'que-comemos-v1';
// Antes de escribir una versión nueva del esquema, lo que había se guarda tal
// cual aquí. Si la migración resultara estar mal —y de eso uno se entera días
// después, no en el momento—, los datos originales siguen existiendo. Ocupa el
// doble durante una temporada; perder la despensa de una casa cuesta más.
export const BACKUP_KEY = 'que-comemos-antes-de-migrar';

// Sin nada guardado es el primer arranque: la app muestra la bienvenida.
export function hasSavedState(storage = globalThis.localStorage) {
  return Boolean(storage?.getItem(STORAGE_KEY));
}

// Devuelve el estado y, además, si hubo que convertirlo. La app lo usa para
// avisar de una sola vez, no para decidir nada.
export function loadStateDetailed(storage = globalThis.localStorage) {
  const saved = storage?.getItem(STORAGE_KEY);
  if (!saved) return { state: createDemoState(), migrated: false, from: SCHEMA_VERSION };
  const parsedVersion = Number(JSON.parse(saved)?.version);
  // Validar antes de tocar nada: si `importState` lanza, lo guardado se queda
  // exactamente donde estaba y el error sube para que la app lo enseñe.
  const state = importState(saved);
  const migrated = Number.isInteger(parsedVersion) && parsedVersion < SCHEMA_VERSION;
  if (migrated) {
    try { storage.setItem(BACKUP_KEY, saved); } catch { /* Sin sitio para el respaldo, no migramos a ciegas. */ }
    saveState(state, storage);
  }
  return { state, migrated, from: parsedVersion };
}

export function loadState(storage = globalThis.localStorage) {
  return loadStateDetailed(storage).state;
}

export function saveState(state, storage = globalThis.localStorage) {
  storage?.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Borrar de verdad, que no es lo mismo que empezar de cero.
//
// «Borrar todos mis datos» reemplazaba el estado y guardaba encima, y con eso
// parecía que no quedaba nada. Pero `que-comemos-antes-de-migrar` puede guardar
// una copia íntegra de todo lo anterior —se escribe sola al cambiar de versión
// del esquema— y seguía ahí después de borrar. Alguien que pide borrar sus
// datos no espera que quede una copia completa esperando en el mismo aparato.
//
// La dirección del servidor opcional y su token viven en otra clave, y son lo
// más sensible que la app llega a guardar. También se van.
//
// Se enumeran una por una en vez de barrer todo lo que empiece por
// `que-comemos-`: así, el día que alguien añada una clave nueva y se olvide de
// esta lista, el fallo es que sobrevive un dato —visible, arreglable— y no que
// se borre algo de otra aplicación que casualmente se llamaba parecido.
export function clearAll(storage = globalThis.localStorage) {
  const claves = [STORAGE_KEY, BACKUP_KEY, 'que-comemos-proveedores-v1', 'que-comemos-sidebar-collapsed'];
  const borradas = [];
  for (const clave of claves) {
    if (storage?.getItem(clave) === null || storage?.getItem(clave) === undefined) continue;
    try { storage.removeItem(clave); borradas.push(clave); } catch { /* Sin almacenamiento no hay nada que borrar. */ }
  }
  return borradas;
}
