import { createDemoState } from './demo.js';
import { importState } from './model.js';

export const STORAGE_KEY = 'que-comemos-v1';
// Sin nada guardado es el primer arranque: la app muestra la bienvenida.
export function hasSavedState(storage = globalThis.localStorage) {
  return Boolean(storage?.getItem(STORAGE_KEY));
}
export function loadState(storage = globalThis.localStorage) {
  const saved = storage?.getItem(STORAGE_KEY);
  if (!saved) return createDemoState();
  return importState(saved);
}
export function saveState(state, storage = globalThis.localStorage) {
  storage?.setItem(STORAGE_KEY, JSON.stringify(state));
}
