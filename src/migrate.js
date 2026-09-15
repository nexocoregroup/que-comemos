// Nadie debería perder los datos de su casa porque la app creció.
//
// Este archivo convierte un estado guardado de una versión a la siguiente, y
// solo eso: no valida saldos ni toca el almacenamiento. De eso se encarga
// `importState` en model.js, que llama aquí primero y valida después. El orden
// importa: si la migración deja algo incoherente, la validación lo rechaza y el
// estado anterior se queda donde estaba, intacto.
//
// No importa model.js a propósito. Sería un ciclo, y además una migración tiene
// que poder leer datos de una versión cuyas reglas ya no son las de hoy.

import { normalizeName } from './nombres.js';

export const SCHEMA_VERSION = 2;

const clone = value => structuredClone(value);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// v1 → v2. Dos cambios de fondo:
//
// 1. El producto pasa de ser un nombre con unidades a una ficha de catálogo:
//    nombre normalizado para detectar duplicados, alias, categoría, estado y de
//    dónde salió. Nada de esto se puede deducir de los datos viejos, así que se
//    rellena con lo neutro —categoría «otros», origen «manual»— en vez de
//    adivinar. Adivinar categorías aquí llenaría la app de etiquetas falsas.
//
// 2. La canasta única se convierte en canasta base más una canasta por mes. La
//    base es lo que la casa consume en un mes corriente; el mes es lo que pasó
//    de verdad ese mes. Lo que había escrito es, por definición, lo habitual:
//    va a la base. Y se abre el mes actual copiándola, para que quien venía
//    usando la app encuentre exactamente lo mismo que dejó.
function v1toV2(data) {
  const notes = [];
  const fecha = today();
  const mesActual = fecha.slice(0, 7);

  const products = (data.products || []).map(item => ({
    id: item.id,
    name: item.name,
    normalized: normalizeName(item.name),
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    category: item.category || 'otros',
    controlUnit: item.controlUnit,
    purchaseUnit: item.purchaseUnit,
    equivalences: item.equivalences || {},
    slice: item.slice ?? null,
    archived: Boolean(item.archived),
    origin: item.origin || 'manual',
    createdAt: item.createdAt || fecha,
    updatedAt: item.updatedAt || fecha
  }));
  if (products.length) notes.push(`${products.length} alimento(s) pasaron a la ficha de catálogo.`);

  // La canasta vieja no tenía prioridad. «Frecuente» es el término medio
  // honesto: decir que todo es obligatorio sería inventar una exigencia que el
  // usuario nunca expresó.
  const lines = (data.basket || []).map(line => ({
    id: line.id,
    productId: line.productId,
    quantity: line.quantity ?? null,
    unit: line.unit,
    priority: line.priority || 'frecuente'
  }));

  const baseBasket = { lines, updatedAt: lines.length ? fecha : null, history: [] };
  const monthlyBaskets = {};
  if (lines.length) {
    monthlyBaskets[mesActual] = { month: mesActual, lines: clone(lines), createdAt: fecha, updatedAt: fecha, basedOn: fecha };
    notes.push(`La canasta que tenías escrita es ahora la canasta base, y ${mesActual} se abrió con una copia.`);
  }

  return {
    state: {
      version: 2,
      seq: data.seq,
      demo: Boolean(data.demo),
      products,
      people: data.people || [],
      recipes: data.recipes || [],
      plans: data.plans || [],
      absences: data.absences || [],
      opening: data.opening || {},
      purchases: data.purchases || [],
      reviews: (data.reviews || []).map(review => ({ mode: 'consumido', remaining: {}, ...review })),
      corrections: data.corrections || [],
      manualItems: data.manualItems || [],
      baseBasket,
      monthlyBaskets,
      invoices: [],
      activity: []
    },
    notes
  };
}

const STEPS = { 1: v1toV2 };

// Campos que aparecieron dentro de una misma versión del esquema. Un respaldo
// exportado antes de que existieran se rellena en vez de rechazarse.
const OPTIONAL_V2 = { invoices: [], activity: [], monthlyBaskets: {} };

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Este archivo no es un respaldo de ¿Qué comemos?.' };
  }
  const from = Number(data.version);
  if (!Number.isInteger(from) || from < 1) {
    return { ok: false, error: 'Este archivo no dice de qué versión es.' };
  }
  if (from > SCHEMA_VERSION) {
    return { ok: false, error: `Este respaldo viene de una versión más nueva de la app (${from}). Actualiza la aplicación antes de importarlo.` };
  }

  let current = clone(data);
  const notes = [];
  while (Number(current.version) < SCHEMA_VERSION) {
    const step = STEPS[Number(current.version)];
    if (!step) return { ok: false, error: `No sé convertir un respaldo de la versión ${current.version}.` };
    const result = step(current);
    current = result.state;
    notes.push(...result.notes);
  }

  for (const [key, value] of Object.entries(OPTIONAL_V2)) {
    if (!(key in current)) current[key] = clone(value);
  }

  return { ok: true, state: current, from, to: SCHEMA_VERSION, migrated: from < SCHEMA_VERSION, notes };
}
