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

export const SCHEMA_VERSION = 3;

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

// v2 → v3. Un solo cambio de fondo, y es el que lo ordena todo: cada mes
// guardaba una copia completa de la canasta, y a partir de aquí guarda solo
// aquello en lo que se aparta de la habitual.
//
// La copia entera parecía lo más seguro y resultó ser lo contrario: con doce
// copias nadie sabía ya qué era la costumbre y qué la excepción de un mes, y
// corregir el hábito obligaba a repasar mes por mes. Así que cada mes se
// compara contra la base y se guarda únicamente la diferencia. Lo que en el mes
// era idéntico a la base no era una excepción y no deja rastro: eso no pierde
// nada, porque volver a aplicar la base da exactamente la misma línea.
function v2toV3(data) {
  const notes = [];
  // Los identificadores nuevos salen del contador que ya venía, no de cero: si
  // se reiniciara, el primer cambio que escribiera el usuario chocaría con algo.
  let seq = Number.isInteger(data.seq) ? data.seq : 0;
  const nuevoId = prefix => { seq += 1; return `${prefix}-${seq}`; };

  const baseBasket = data.baseBasket && Array.isArray(data.baseBasket.lines)
    ? { lines: clone(data.baseBasket.lines), updatedAt: data.baseBasket.updatedAt ?? null, history: clone(data.baseBasket.history || []) }
    : { lines: [], updatedAt: null, history: [] };
  const base = new Map(baseBasket.lines.map(line => [line.productId, line]));

  const monthlyBaskets = data.monthlyBaskets && typeof data.monthlyBaskets === 'object' ? data.monthlyBaskets : {};
  const monthOverrides = {};
  let totalCambios = 0;
  for (const [month, basket] of Object.entries(monthlyBaskets)) {
    if (!basket || !Array.isArray(basket.lines)) continue;
    const changes = [];
    const enElMes = new Set();
    for (const line of basket.lines) {
      enElMes.add(line.productId);
      const original = base.get(line.productId);
      const cantidad = line.quantity ?? null;
      const prioridad = line.priority || 'frecuente';
      if (original) {
        const igual = (original.quantity ?? null) === cantidad && original.unit === line.unit && (original.priority || 'frecuente') === prioridad;
        if (igual) continue;
        changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: cantidad, unit: line.unit, priority: prioridad, removed: false, extra: false, note: '', createdAt: basket.createdAt || `${month}-01` });
        continue;
      }
      changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: cantidad, unit: line.unit, priority: prioridad, removed: false, extra: true, note: '', createdAt: basket.createdAt || `${month}-01` });
    }
    // Lo que estaba en la base y no en el mes se quitó a propósito ese mes.
    for (const line of baseBasket.lines) {
      if (enElMes.has(line.productId)) continue;
      changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: line.quantity ?? null, unit: line.unit, priority: line.priority || 'frecuente', removed: true, extra: false, note: '', createdAt: basket.createdAt || `${month}-01` });
    }
    if (!changes.length) continue;
    monthOverrides[month] = { month, changes, createdAt: basket.createdAt || `${month}-01`, updatedAt: basket.updatedAt || basket.createdAt || `${month}-01` };
    totalCambios += changes.length;
  }

  const plans = (data.plans || []).map(plan => ({ ...plan, routineId: plan.routineId ?? null }));

  // Un mes estaba abierto si tenía canasta propia o comidas escritas. Sin un
  // `createdAt` que copiar se usa el día 1 de ese mes, que es cierto —el mes
  // estuvo en uso— en vez de la fecha de hoy, que sería falsa para un mes viejo.
  const monthPlans = {};
  const mesesUsados = new Set([...Object.keys(monthlyBaskets), ...plans.map(plan => String(plan.date || '').slice(0, 7))].filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)));
  for (const month of [...mesesUsados].sort()) {
    monthPlans[month] = { month, openedAt: monthlyBaskets[month]?.createdAt || `${month}-01`, preparedAt: null, summary: null };
  }

  const products = data.products || [];
  const state = {
    version: 3,
    seq,
    demo: Boolean(data.demo),
    products,
    people: data.people || [],
    recipes: data.recipes || [],
    plans,
    absences: data.absences || [],
    opening: data.opening || {},
    purchases: data.purchases || [],
    // Un respaldo v2 exportado antes de que existiera el modo «cuánto queda» no
    // dice cómo se contó. «Consumido» es lo que se hacía entonces.
    reviews: (data.reviews || []).map(review => ({ mode: 'consumido', remaining: {}, ...review })),
    corrections: data.corrections || [],
    manualItems: data.manualItems || [],
    habitualBasket: baseBasket,
    monthOverrides,
    // No se inventan rutinas leyendo el historial: que alguien haya comido fuera
    // tres domingos seguidos no significa que quiera esa regla escrita.
    mealRoutines: [],
    monthPlans,
    settings: { reviewWeekday: 5, onboarded: products.length > 0 },
    activity: data.activity || []
  };

  notes.push('Tu canasta de siempre ahora se llama «canasta habitual» y es la misma de antes.');
  if (totalCambios) notes.push(`De los meses que tenías escritos se guardaron ${totalCambios} cambio(s): solo aquello en lo que cada mes se apartaba de tu canasta. Lo que era igual no hacía falta repetirlo.`);
  else if (Object.keys(monthlyBaskets).length) notes.push('Los meses que tenías escritos eran iguales a tu canasta, así que no hizo falta guardar ningún cambio.');
  if (Object.keys(monthPlans).length) notes.push(`${Object.keys(monthPlans).length} mes(es) quedaron marcados como abiertos.`);
  if ((data.invoices || []).length) notes.push(`Las ${data.invoices.length} factura(s) guardadas salen de la app, pero siguen enteras en el respaldo anterior a la migración.`);

  return { state, notes };
}

const STEPS = { 1: v1toV2, 2: v2toV3 };

// Campos que aparecieron dentro de una misma versión del esquema. Un respaldo
// exportado antes de que existieran se rellena en vez de rechazarse.
const OPTIONAL_V3 = { mealRoutines: [], monthPlans: {}, monthOverrides: {}, activity: [], settings: { reviewWeekday: 5, onboarded: false } };

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

  for (const [key, value] of Object.entries(OPTIONAL_V3)) {
    if (!(key in current)) current[key] = clone(value);
  }

  return { ok: true, state: current, from, to: SCHEMA_VERSION, migrated: from < SCHEMA_VERSION, notes };
}
