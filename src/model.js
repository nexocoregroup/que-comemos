import { containsWords, normalizeName, similarity } from './nombres.js';
import { CLASES_DE_PERSONA, MOTIVOS_DE_RESTRICCION, SCHEMA_VERSION, migrate } from './migrate.js';

export { normalizeName, SCHEMA_VERSION, CLASES_DE_PERSONA, MOTIVOS_DE_RESTRICCION };

export const SLOTS = ['desayuno', 'almuerzo', 'cena'];
export const UNITS = ['unidad', 'lb', 'taza', 'lata', 'paquete', 'rueda', 'rebanada'];
// Una «rueda» no mide lo mismo en dos casas: quien corta fino saca el doble de
// ruedas del mismo salami. El grosor no convierte nada por sí solo —para eso
// está la equivalencia—, pero deja escrito qué significa una rueda aquí, que es
// justo lo que hace comparable el conteo de una semana con el de la siguiente.
export const SLICEABLE = ['rueda', 'rebanada'];
export const SLICE_STYLES = [
  { id: 'fina', label: 'Fina', range: '2–3 mm' },
  { id: 'media', label: 'Mediana', range: '4–5 mm' },
  { id: 'gruesa', label: 'Gruesa', range: '6–8 mm' }
];
export const sliceStyle = id => SLICE_STYLES.find(item => item.id === id) || null;
// Un alimento de la canasta puede ser de los que nunca faltan, de los que casi
// siempre están, o de los que aparecen de vez en cuando. Sirve para ordenar la
// lista y para decidir qué proponer, nunca para calcular cantidades.
export const PRIORITIES = ['obligatorio', 'frecuente', 'ocasional'];
// De dónde salió un producto. Se guarda para poder explicarle al usuario por
// qué existe algo que él no recuerda haber escrito.
export const ORIGINS = ['manual', 'catalogo', 'factura', 'asistente', 'compra', 'canasta', 'texto'];
const EPS = 1e-8;
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (date, count) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + count);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const validDate = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const d = new Date(`${date}T12:00:00`);
  return Number.isFinite(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === date;
};
export const validMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '');
export const monthBounds = month => ({ start: `${month}-01`, end: addDays(`${month}-01`, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() - 1) });
export const weekStart = date => addDays(date, -(new Date(`${date}T12:00:00`).getDay() + 6) % 7);
export const dateRange = (start, end) => {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Selecciona fechas válidas y en orden.');
  if (new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`) > 366 * 86400000) throw new Error('El período no puede superar un año.');
  const dates = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
};
export const createEmptyState = () => ({
  version: SCHEMA_VERSION, seq: 0, demo: false,
  products: [], people: [], recipes: [], plans: [], absences: [],
  opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
  // La canasta habitual es lo que la casa consume en un mes corriente. Cada mes
  // guarda solo aquello en lo que se aparta de ella: comprar algo
  // extraordinario en septiembre no debe reescribir el hábito.
  habitualBasket: { lines: [], updatedAt: null, history: [] },
  monthOverrides: {},
  // Las rutinas son las comidas que se repiten solas: «los domingos comemos
  // fuera», «los lunes mangú». Un mes abierto es un mes al que ya se le
  // aplicaron.
  mealRoutines: [], monthPlans: {},
  // `hogar` guarda por dónde va la configuración guiada de la casa. Va en el
  // estado y no en la interfaz a propósito: quien cierra la app a mitad de la
  // tercera ficha tiene que encontrarla abierta por la tercera ficha, y quien
  // cambia de teléfono también. Los respaldos viejos no lo traen, así que todo
  // lo que lo lee lo lee con `hogarDe()`, que devuelve el valor de fábrica.
  // `compra` guarda cada cuánto se hace la compra —como una lista de tramos con
  // fecha de vigencia, no como un interruptor— y cómo se parte el mes entre las
  // dos quincenas. Los respaldos viejos no lo traen: sin él todo es mensual,
  // que es como se comportaba la app antes.
  settings: { reviewWeekday: 5, onboarded: false, hogar: null, canasta: null, compra: null },
  activity: []
});
export function nextId(state, prefix) { state.seq += 1; return `${prefix}-${state.seq}`; }
export function quantity(value, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error('Escribe una cantidad mayor que cero.');
  return round(n);
}
// En la canasta la cantidad puede quedar pendiente: alguien sabe que compra
// arroz todos los meses mucho antes de saber cuántas libras. Perder el alimento
// por no saber el número sería el peor de los dos males.
export function optionalQuantity(value) {
  if (value === '' || value === undefined || value === null) return null;
  return quantity(value);
}

// Deshacer a mano un cambio a medias es imposible de hacer bien: hay que
// recordar qué tocó cada función. Un clon antes y una restauración en sitio
// después lo resuelven de una vez para todos los casos —y es lo que permite
// que el asistente ejecute varias acciones sabiendo que, o entran todas, o no
// entra ninguna.
export function snapshot(state) { return structuredClone(state); }
export function restore(state, saved) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, structuredClone(saved));
  return state;
}
export function transaction(state, fn) {
  const saved = snapshot(state);
  try {
    const result = fn(state);
    if (balances(state).problems.length) throw new Error('El cambio dejaría existencias negativas en alguna fecha.');
    return result;
  } catch (error) {
    restore(state, saved);
    throw error;
  }
}

/* ── Catálogo de alimentos ─────────────────────────────────────────────── */

export function product(state, id) { return state.products.find(item => item.id === id); }
export function activeProducts(state) { return state.products.filter(item => !item.archived); }
export function productByName(state, name) {
  const key = normalizeName(name);
  return key ? state.products.find(item => item.normalized === key || (item.aliases || []).some(alias => normalizeName(alias) === key)) : undefined;
}
// Antes de crear un alimento nuevo conviene enseñar lo que ya se le parece.
// Devuelve candidatos ordenados, nunca decide: unir dos alimentos mezcla dos
// inventarios, y eso solo lo puede autorizar quien tiene la casa delante.
export function findSimilarProducts(state, name, { limit = 3, threshold = 0.72, exclude = null } = {}) {
  const key = normalizeName(name);
  if (!key) return [];
  return state.products
    .filter(item => item.id !== exclude)
    .map(item => {
      const alias = (item.aliases || []).reduce((best, value) => Math.max(best, similarity(name, value)), 0);
      const score = Math.max(similarity(name, item.name), alias);
      if (score >= 0.995) return { product: item, score: 1, reason: 'igual' };
      if (score >= threshold) return { product: item, score, reason: 'parecido' };
      if (containsWords(name, item.name)) return { product: item, score: 0.7, reason: 'contenido' };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
export function addProduct(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre del producto.');
  if (!UNITS.includes(fields.controlUnit) || !UNITS.includes(fields.purchaseUnit)) throw new Error('Selecciona unidades válidas.');
  const date = todayISO();
  const item = {
    id: nextId(state, 'producto'), name, normalized: normalizeName(name),
    aliases: [...new Set((fields.aliases || []).map(alias => String(alias).trim()).filter(Boolean))],
    // La categoría se guarda tal cual la mande quien llama. El modelo no tiene
    // una lista cerrada a propósito: quien la enseña es la interfaz, y una
    // categoría inventada aquí sería una etiqueta que el usuario nunca eligió.
    category: String(fields.category || 'otros'),
    controlUnit: fields.controlUnit, purchaseUnit: fields.purchaseUnit,
    equivalences: {}, slice: null, archived: false,
    origin: ORIGINS.includes(fields.origin) ? fields.origin : 'manual',
    createdAt: date, updatedAt: date
  };
  state.products.push(item);
  setSlice(state, item.id, fields.slice);
  if (fields.purchaseUnit !== fields.controlUnit && fields.factor) setEquivalence(state, item.id, fields.purchaseUnit, fields.factor);
  // Lo que ya hay en casa al registrar el producto. Es la apertura del saldo:
  // se fija una sola vez, aquí, porque después el inventario solo se mueve con
  // compras, revisiones y correcciones.
  state.opening[item.id] = fields.opening === '' || fields.opening === undefined || fields.opening === null ? 0 : quantity(fields.opening, true);
  return item;
}
export function updateProduct(state, id, fields) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  if ('name' in fields) {
    const name = String(fields.name || '').trim();
    if (!name) throw new Error('Escribe el nombre del producto.');
    item.name = name;
    item.normalized = normalizeName(name);
  }
  if ('purchaseUnit' in fields) {
    if (!UNITS.includes(fields.purchaseUnit)) throw new Error('Selecciona una unidad de compra válida.');
    item.purchaseUnit = fields.purchaseUnit;
  }
  if ('category' in fields) item.category = String(fields.category || 'otros');
  if ('aliases' in fields) item.aliases = [...new Set((fields.aliases || []).map(alias => String(alias).trim()).filter(Boolean))];
  if ('slice' in fields) setSlice(state, id, fields.slice);
  item.updatedAt = todayISO();
  return item;
}
// Archivar esconde el alimento de los selectores sin borrar su historial: las
// compras y revisiones donde aparece siguen siendo ciertas, y el saldo que
// tuviera sigue contando. Borrarlo falsearía el pasado.
export function archiveProduct(state, id) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  item.archived = true;
  item.updatedAt = todayISO();
  return item;
}
export function restoreProduct(state, id) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  item.archived = false;
  item.updatedAt = todayISO();
  return item;
}
// Unir dos alimentos es irreversible y mezcla dos inventarios, así que exige
// que se cuenten en la misma unidad: sumar libras con unidades daría un número
// sin significado, y quedaría escrito en el saldo como si fuera cierto.
export function mergeProducts(state, keepId, dropId) {
  return transaction(state, () => {
    const keep = product(state, keepId), drop = product(state, dropId);
    if (!keep || !drop || keepId === dropId) throw new Error('Selecciona dos alimentos distintos.');
    if (keep.controlUnit !== drop.controlUnit) throw new Error(`No se pueden unir: «${keep.name}» se cuenta en ${keep.controlUnit} y «${drop.name}» en ${drop.controlUnit}.`);
    const swap = id => (id === dropId ? keepId : id);
    state.opening[keepId] = round(Number(state.opening[keepId] || 0) + Number(state.opening[dropId] || 0));
    delete state.opening[dropId];
    for (const purchase of state.purchases) for (const line of purchase.lines) line.productId = swap(line.productId);
    for (const correction of state.corrections) correction.productId = swap(correction.productId);
    for (const review of state.reviews) {
      review.productIds = [...new Set(review.productIds.map(swap))];
      if (review.consumed[dropId] !== undefined) {
        review.consumed[keepId] = round((review.consumed[keepId] || 0) + review.consumed[dropId]);
        delete review.consumed[dropId];
      }
      if (review.remaining?.[dropId] !== undefined) delete review.remaining[dropId];
    }
    for (const recipe of state.recipes) for (const line of recipe.items) line.productId = swap(line.productId);
    for (const plan of state.plans) for (const line of plan.items) line.productId = swap(line.productId);
    for (const person of state.people) {
      // Si los dos alimentos que se unen estaban los dos restringidos, después
      // de la unión son la misma restricción. `linkPendingRestrictions` junta
      // las dos filas y conserva el motivo que alguna de ellas tuviera.
      person.restricciones = restriccionesDe(person).map(fila => ({ ...fila, productId: fila.productId ? swap(fila.productId) : null }));
      linkPendingRestrictions(state, person);
      person.habitual = person.habitual.map(row => ({ ...row, productId: swap(row.productId) }));
    }
    state.habitualBasket.lines = mergeBasketLines(state.habitualBasket.lines.map(line => ({ ...line, productId: swap(line.productId) })));
    // Un mes puede tener un cambio escrito para cada uno de los dos alimentos
    // que se unen; después de la unión serían dos cambios del mismo alimento, y
    // la regla es uno por mes.
    for (const override of Object.values(state.monthOverrides)) {
      override.changes = mergeBasketLines(override.changes.map(change => ({ ...change, productId: swap(change.productId) })));
    }
    keep.aliases = [...new Set([...keep.aliases, drop.name, ...drop.aliases])];
    keep.updatedAt = todayISO();
    state.products = state.products.filter(item => item.id !== dropId);
    return keep;
  });
}
// Dos líneas del mismo alimento tras una unión: se suman si comparten unidad y,
// si no, se queda la primera. Convertir aquí sería adivinar una equivalencia.
function mergeBasketLines(lines) {
  const out = [];
  for (const line of lines) {
    const twin = out.find(row => row.productId === line.productId && row.unit === line.unit);
    if (!twin) { out.push(line); continue; }
    twin.quantity = twin.quantity === null || line.quantity === null ? twin.quantity ?? line.quantity : round(twin.quantity + line.quantity);
  }
  return out;
}
export function convert(state, productId, amount, unit) {
  const item = product(state, productId);
  if (!item) throw new Error('El producto ya no existe.');
  if (unit === item.controlUnit) return round(Number(amount));
  const factor = item.equivalences?.[unit];
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return round(Number(amount) * factor);
}
// El grosor solo tiene sentido en lo que se corta en ruedas o rebanadas. En
// cualquier otra unidad se guarda en null en vez de rechazarse: el formulario
// puede mandar el valor de un radio que quedó oculto al cambiar de unidad.
export function setSlice(state, productId, value) {
  const item = product(state, productId);
  if (!item) throw new Error('Selecciona un producto.');
  item.slice = SLICEABLE.includes(item.controlUnit) && sliceStyle(value) ? value : null;
  return item.slice;
}
export function setEquivalence(state, productId, unit, factor) {
  const item = product(state, productId);
  if (!item || !UNITS.includes(unit) || unit === item.controlUnit) throw new Error('Selecciona un producto y una unidad distinta de su unidad de control.');
  item.equivalences[unit] = quantity(factor);
  item.updatedAt = todayISO();
}

/* ── Canasta habitual y cambios de cada mes ────────────────────────────── */

// La canasta habitual es el hábito: lo que la casa consume en un mes corriente,
// escrito una sola vez. Un mes no guarda una copia de esa lista, sino solo
// aquello en lo que se aparta de ella: «este mes no compro atún», «este mes 45
// libras de arroz en vez de 30», «este mes, además, pollo».
//
// Guardar diferencias en vez de copias es lo que permite corregir el hábito sin
// repasar los meses ya escritos, y que un mes sin excepciones no ocupe nada ni
// haya que abrirlo para calcular la compra: si no hay cambios, la canasta de ese
// mes es exactamente la habitual.

export function habitualLines(state) { return state.habitualBasket.lines; }

function normalizeBasketLines(state, lines, { origin = 'canasta' } = {}) {
  const rows = (lines || []).map(line => {
    const name = String(line.name || '').trim();
    const existing = name ? productByName(state, name) : product(state, line.productId);
    if (!existing && !name) throw new Error('Escribe el nombre del alimento.');
    if (!UNITS.includes(line.unit)) throw new Error('Elige la unidad de cada alimento.');
    return {
      id: line.id, existing, name,
      quantity: optionalQuantity(line.quantity),
      unit: line.unit,
      priority: PRIORITIES.includes(line.priority) ? line.priority : 'frecuente'
    };
  });
  // Los alimentos que faltan se crean solo después de validarlo todo: si una
  // línea estuviera mal, media canasta habría quedado registrada a medias.
  const nuevos = new Map();
  return rows.map(row => {
    const key = normalizeName(row.name);
    const item = row.existing || nuevos.get(key) || addProduct(state, { name: row.name, controlUnit: row.unit, purchaseUnit: row.unit, origin });
    if (!row.existing && key) nuevos.set(key, item);
    return { id: row.id || nextId(state, 'canasta'), productId: item.id, quantity: row.quantity, unit: row.unit, priority: row.priority };
  });
}

export function setHabitualBasket(state, lines, options = {}) {
  const next = normalizeBasketLines(state, lines, options);
  const date = todayISO();
  if (state.habitualBasket.lines.length) {
    state.habitualBasket.history = [...(state.habitualBasket.history || []), { date, count: state.habitualBasket.lines.length }].slice(-24);
  }
  state.habitualBasket.lines = next;
  state.habitualBasket.updatedAt = date;
  return next;
}

// Escribe la línea sin interpretar la cantidad. `setHabitualLine` sí entiende el
// vacío como una baja; ascender un cambio del mes no puede hacerlo, porque
// «todavía no sé cuánto» es una cantidad legítima y borrar el alimento por eso
// sería perder justo lo que acaban de pedir conservar.
function writeHabitualLine(state, { productId, quantity: amount, unit, priority }) {
  const lines = state.habitualBasket.lines;
  const index = lines.findIndex(line => line.productId === productId);
  const line = {
    id: index >= 0 ? lines[index].id : nextId(state, 'canasta'),
    productId, quantity: amount, unit,
    priority: PRIORITIES.includes(priority) ? priority : lines[index]?.priority || 'frecuente'
  };
  if (index >= 0) lines[index] = line; else lines.push(line);
  state.habitualBasket.updatedAt = todayISO();
  return line;
}

// El consumo mensual de un solo alimento, para poder escribirlo desde su propia
// ficha. La canasta y la ficha del producto son la misma lista vista de dos
// formas. Vacío o cero borra la línea en vez de guardar un consumo de cero, que
// no significa nada.
export function setHabitualLine(state, productId, amount, unit, priority) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  if (amount === '' || amount === undefined || amount === null || Number(amount) === 0) {
    removeHabitualLine(state, productId);
    return null;
  }
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  return writeHabitualLine(state, { productId, quantity: quantity(amount), unit, priority });
}

export function removeHabitualLine(state, productId) {
  const before = state.habitualBasket.lines.length;
  state.habitualBasket.lines = state.habitualBasket.lines.filter(line => line.productId !== productId);
  state.habitualBasket.updatedAt = todayISO();
  return before !== state.habitualBasket.lines.length;
}

// Preguntar por un mes no puede abrirlo. Si leer noviembre lo creara, la app
// acabaría con doce meses «tocados» que nadie tocó, y ya no se podría distinguir
// un mes con excepciones de un mes que simplemente se miró.
export function monthChanges(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  return state.monthOverrides[month] || { month, changes: [] };
}

export function openMonthChanges(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (!state.monthOverrides[month]) {
    const date = todayISO();
    state.monthOverrides[month] = { month, changes: [], createdAt: date, updatedAt: date };
  }
  return state.monthOverrides[month];
}

// La canasta real de un mes: el hábito con sus excepciones ya aplicadas. Es lo
// único que hay que mirar para calcular una compra, y de dónde sale cada línea
// queda escrito para poder explicárselo a quien pregunte por qué está ahí.
export function effectiveBasket(state, month) {
  const changes = monthChanges(state, month).changes;
  const byProduct = new Map(changes.map(change => [change.productId, change]));
  const habituales = new Set(habitualLines(state).map(line => line.productId));
  const out = [];
  for (const line of habitualLines(state)) {
    const change = byProduct.get(line.productId);
    if (!change) { out.push({ productId: line.productId, quantity: line.quantity, unit: line.unit, priority: line.priority, source: 'habitual' }); continue; }
    if (change.removed) continue;
    out.push({ productId: change.productId, quantity: change.quantity, unit: change.unit, priority: change.priority, source: 'cambio' });
  }
  // Lo que no está en el hábito solo vive en este mes. Se mira la pertenencia y
  // no la marca guardada porque un alimento puede haber salido del hábito
  // después de escrito el cambio, y entonces la marca mentiría.
  for (const change of changes) {
    if (habituales.has(change.productId) || change.removed) continue;
    out.push({ productId: change.productId, quantity: change.quantity, unit: change.unit, priority: change.priority, source: 'extra' });
  }
  return out;
}

export function setMonthChange(state, month, productId, fields = {}) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const override = openMonthChanges(state, month);
  const habitual = habitualLines(state).find(line => line.productId === productId) || null;
  const previous = override.changes.find(change => change.productId === productId) || null;
  const unit = fields.unit ?? previous?.unit ?? habitual?.unit;
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  const change = {
    id: previous?.id || nextId(state, 'cambio'),
    productId,
    quantity: 'quantity' in fields ? optionalQuantity(fields.quantity) : previous?.quantity ?? habitual?.quantity ?? null,
    unit,
    priority: PRIORITIES.includes(fields.priority) ? fields.priority : previous?.priority || habitual?.priority || 'frecuente',
    removed: 'removed' in fields ? Boolean(fields.removed) : Boolean(previous?.removed),
    extra: !habitual,
    note: 'note' in fields ? String(fields.note || '').trim() : previous?.note || '',
    createdAt: previous?.createdAt || todayISO()
  };
  // Como mucho un cambio por producto y mes: volver a cambiarlo corrige el que
  // ya había en vez de apilar dos verdades sobre el mismo alimento.
  if (previous) override.changes[override.changes.indexOf(previous)] = change;
  else override.changes.push(change);
  override.updatedAt = todayISO();
  return change;
}

export function removeMonthChange(state, month, productId) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const override = state.monthOverrides[month];
  if (!override) return false;
  const before = override.changes.length;
  override.changes = override.changes.filter(change => change.productId !== productId);
  if (before === override.changes.length) return false;
  override.updatedAt = todayISO();
  return true;
}

// Pasar un cambio al hábito es siempre explícito y alimento por alimento: es lo
// que separa «este mes compré más pollo» de «en esta casa ahora se come más
// pollo». Confundirlos reescribiría la costumbre sin que nadie lo pidiera.
export function promoteToHabitual(state, month, productIds) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const wanted = [...new Set(productIds || [])];
  if (!wanted.length) throw new Error('Selecciona qué alimentos pasan a la canasta habitual.');
  const override = state.monthOverrides[month];
  if (!override || !override.changes.length) throw new Error('Ese mes no tiene cambios que pasar a la canasta habitual.');
  let applied = 0;
  for (const id of wanted) {
    const change = override.changes.find(row => row.productId === id);
    if (!change) continue;
    if (change.removed) removeHabitualLine(state, id);
    else writeHabitualLine(state, change);
    // Deja de ser una excepción del mes porque acaba de convertirse en la norma.
    override.changes = override.changes.filter(row => row.productId !== id);
    applied++;
  }
  if (applied) override.updatedAt = todayISO();
  return applied;
}

export function monthExtras(state, month) {
  const habituales = new Set(habitualLines(state).map(line => line.productId));
  return monthChanges(state, month).changes.filter(change => !habituales.has(change.productId) && !change.removed);
}

export function monthBasketSummary(state, month) {
  const basket = effectiveBasket(state, month);
  const habituales = new Set(habitualLines(state).map(line => line.productId));
  return {
    habituales: basket.filter(line => line.source === 'habitual').length,
    cambiados: basket.filter(line => line.source === 'cambio').length,
    quitados: monthChanges(state, month).changes.filter(change => change.removed && habituales.has(change.productId)).length,
    extras: basket.filter(line => line.source === 'extra').length
  };
}

// Se escribe por mes y se compra por quincena o por fechas sueltas. Un período
// que cruza dos meses no se puede prorratear con la duración de uno solo: del
// 28 de septiembre al 12 de octubre son 3 días de septiembre y 12 de octubre,
// cada uno sobre su propio mes y contra su propia canasta.
export function periodMonths(start, end) {
  const counts = new Map();
  for (const date of dateRange(start, end)) {
    const month = date.slice(0, 7);
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts].map(([month, days]) => {
    const bounds = monthBounds(month);
    const monthDays = dateRange(bounds.start, bounds.end).length;
    return { month, days, monthDays, share: days / monthDays };
  });
}
export function basketShare(start, end) {
  const months = periodMonths(start, end);
  const days = months.reduce((sum, item) => sum + item.days, 0);
  const monthDays = months.reduce((sum, item) => sum + item.monthDays, 0);
  return { days, monthDays, month: months[0].month, months, share: months.length === 1 ? months[0].share : days / monthDays };
}

/* ── Personas, preparaciones y menú ────────────────────────────────────── */

// Una restricción es una fila con tres cosas: qué alimento, escrito cómo, y por
// qué se evita. El «por qué» es lo único que cambia lo que hace quien cocina:
// un maní que mata no se trata igual que una berenjena que no gusta.
//
// `motivo` puede ser `null`, y significa exactamente «todavía no se ha dicho».
// No se rellena solo: inventar un motivo es lo único que esta parte de la app no
// puede permitirse. Mientras esté sin decir, la app avisa igual que siempre.
export const restriccionesDe = person => (Array.isArray(person?.restricciones) ? person.restricciones : []);
export const alimentosProhibidos = person => new Set(restriccionesDe(person).filter(fila => fila.productId).map(fila => fila.productId));
export const restriccionDe = (person, productId) => restriccionesDe(person).find(fila => fila.productId === productId) || null;

// Quién vive hoy en la casa. Una persona dada de baja no desaparece —su nombre
// tiene que seguir leyéndose en las comidas de marzo— pero deja de contar para
// lo que se va a cocinar a partir de ahora.
export const esActiva = person => person?.activo !== false;
export const personasActivas = state => state.people.filter(esActiva);

const claveDeTexto = texto => normalizeName(String(texto || ''));

// Deja la lista en su forma buena: sin repetidos, sin filas vacías, sin
// identificadores de alimentos que ya no existen y sin motivos inventados.
function normalizarRestricciones(state, filas) {
  const salida = [];
  const vistas = new Set();
  for (const fila of filas || []) {
    const enlazado = fila?.productId && product(state, fila.productId) ? fila.productId : null;
    const texto = String(fila?.texto || '').trim();
    if (!enlazado && !texto) continue;
    const llave = enlazado ? `id:${enlazado}` : `txt:${claveDeTexto(texto)}`;
    if (vistas.has(llave)) continue;
    vistas.add(llave);
    salida.push({
      productId: enlazado,
      texto: enlazado ? '' : texto,
      motivo: MOTIVOS_DE_RESTRICCION.includes(fila?.motivo) ? fila.motivo : null
    });
  }
  return salida;
}

// De dónde salen las restricciones que se van a guardar. Hay tres casos y los
// tres importan:
//
//  · Viene `restricciones`: es la forma de hoy y manda, aunque venga vacía —
//    vaciarla es una orden legítima—.
//  · Vienen las dos listas viejas: se convierten, y el motivo que ya tuviera
//    cada línea se conserva. Guardar desde una pantalla que todavía no pregunta
//    el motivo no puede borrar el que alguien escribió en otra.
//  · No viene ninguna: se deja lo que la persona ya tenía.
function restriccionesDesdeCampos(fields, person) {
  if (Array.isArray(fields.restricciones)) return fields.restricciones;
  if (!Array.isArray(fields.restrictions) && !Array.isArray(fields.pendingRestrictions)) return restriccionesDe(person);
  const previas = restriccionesDe(person);
  const motivoPrevio = (productId, texto) => previas.find(fila =>
    productId ? fila.productId === productId : claveDeTexto(fila.texto) === claveDeTexto(texto))?.motivo ?? null;
  return [
    ...(fields.restrictions || []).map(productId => ({ productId, texto: '', motivo: motivoPrevio(productId, '') })),
    ...(fields.pendingRestrictions || []).map(texto => ({ productId: null, texto, motivo: motivoPrevio(null, texto) }))
  ];
}

export function upsertPerson(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la persona.');
  let person = state.people.find(item => item.id === fields.id);
  if (!person) { person = { id: nextId(state, 'persona') }; state.people.push(person); }
  person.name = name;
  person.kind = CLASES_DE_PERSONA.includes(fields.kind) ? fields.kind : person.kind || 'adulto';
  person.activo = 'activo' in fields ? fields.activo !== false : esActiva(person);
  person.restricciones = normalizarRestricciones(state, restriccionesDesdeCampos(fields, person));
  person.habitual = (fields.habitual || []).map(item => ({ productId: item.productId, quantity: quantity(item.quantity), unit: item.unit }));
  // Una restricción escrita por nombre cuando el alimento todavía no existe no
  // se pierde: se guarda como texto y se enlaza en cuanto el alimento aparezca.
  // Bloquear a quien registra su casa por un producto que aún no creó sería
  // justo el orden invertido que hace que nadie termine de configurar nada.
  linkPendingRestrictions(state, person);
  return person;
}

// Dar de baja no es borrar. La persona se queda en la casa con su nombre, sus
// restricciones y su sitio en todas las comidas que ya se cocinaron; lo único
// que cambia es que a partir de ahora no cuenta para lo que se va a preparar.
// Por eso aquí no se toca ni un plan, ni una ausencia, ni una preparación: el
// historial de marzo tiene que seguir diciendo lo que decía en marzo.
export function setPersonActive(state, personId, activo) {
  const person = state.people.find(item => item.id === personId);
  if (!person) throw new Error('Esa persona ya no está en la casa.');
  person.activo = activo !== false;
  return person;
}

export function linkPendingRestrictions(state, person) {
  const porProducto = new Map();
  const filas = [];
  for (const fila of restriccionesDe(person)) {
    const id = fila.productId || productByName(state, fila.texto)?.id || null;
    if (!id) { filas.push(fila); continue; }
    const previa = porProducto.get(id);
    // El mismo alimento escrito dos veces —una por nombre y otra de la lista—
    // es una sola restricción. Si una de las dos traía motivo, ese se queda.
    if (previa) { if (!previa.motivo && fila.motivo) previa.motivo = fila.motivo; continue; }
    const nueva = { productId: id, texto: '', motivo: fila.motivo || null };
    porProducto.set(id, nueva);
    filas.push(nueva);
  }
  person.restricciones = filas;
  return person;
}
export function setAbsence(state, date, slot, personId, absent) {
  state.absences = state.absences.filter(item => !(item.date === date && item.slot === slot && item.personId === personId));
  if (absent) {
    state.absences.push({ date, slot, personId });
    const plan = planFor(state, date, slot);
    if (plan) {
      plan.participants = plan.participants.filter(id => id !== personId);
      plan.items = plan.items.filter(item => {
        if (item.personId !== personId) return true;
        if (reservedQuantity(state, plan.id, item.id) > 0) { item.personId = null; return true; }
        return false;
      });
      if (!plan.participants.length && plan.kind === 'linked') state.plans = state.plans.filter(item => item.id !== plan.id);
      else if (!plan.participants.length && plan.kind === 'recipe' && !dependents(state, plan.id).length) { plan.kind = 'outside'; plan.items = []; }
    }
  }
}
export const isAbsent = (state, date, slot, personId) => state.absences.some(item => item.date === date && item.slot === slot && item.personId === personId);
export function upsertRecipe(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la preparación.');
  const uses = [...new Set(fields.uses || [])].filter(slot => SLOTS.includes(slot));
  if (!uses.length) throw new Error('Selecciona cuándo se puede usar.');
  const items = (fields.items || []).map(item => {
    if (!product(state, item.productId) || !UNITS.includes(item.unit)) throw new Error('Selecciona un alimento y su unidad.');
    return { productId: item.productId, quantity: quantity(item.quantity), unit: item.unit, personId: item.personId || null };
  });
  // Una preparación se guarda con el nombre y poco más. Exigir un alimento
  // convertía «mangú con salami» en un formulario de inventario antes de dejar
  // apuntar la idea, y en una casa las cantidades se afinan después —o nunca—.
  // Sin alimentos, la preparación sirve igual para llenar el calendario; lo
  // único que no hace es aportar nada a la compra calculada desde el menú, y la
  // compra ya avisa de eso por su cuenta.
  let recipe = state.recipes.find(item => item.id === fields.id);
  if (!recipe) { recipe = { id: nextId(state, 'preparacion') }; state.recipes.push(recipe); }
  Object.assign(recipe, { name, uses, items, covers: (fields.covers || []).filter(id => state.people.some(person => person.id === id)), servings: fields.servings === '' || fields.servings === undefined || fields.servings === null ? null : quantity(fields.servings), note: String(fields.note || '').trim() });
  return recipe;
}
export function duplicateRecipe(state, id) {
  const source = state.recipes.find(item => item.id === id);
  if (!source) throw new Error('Preparación no encontrada.');
  const copy = structuredClone(source);
  copy.id = nextId(state, 'preparacion');
  copy.name = `${source.name} (copia)`;
  state.recipes.push(copy);
  return copy;
}
export function deleteRecipe(state, id) {
  state.recipes = state.recipes.filter(item => item.id !== id);
  // Calendar entries keep their own quantities and title.
}
export function planFor(state, date, slot) { return state.plans.find(item => item.date === date && item.slot === slot); }
// Sin decir nada, una comida es para toda la casa. Solo quien esté dado de baja
// o marcado fuera ese día se queda fuera de la cuenta.
export function effectiveParticipants(state, recipe, date, slot, selected) {
  const ids = selected || (recipe.covers.length ? recipe.covers : state.people.map(item => item.id));
  return ids.filter(id => {
    const person = state.people.find(item => item.id === id);
    if (!person) return false;
    // Una selección explícita manda —editar una comida de antes no puede
    // expulsar a quien ya figuraba en ella—; el reparto automático, no.
    if (!selected && !esActiva(person)) return false;
    return !isAbsent(state, date, slot, id);
  });
}
export function incompatibleItems(state, items, participants) {
  return items.filter(item => participants.some(id => {
    const person = state.people.find(p => p.id === id);
    return Boolean(person) && alimentosProhibidos(person).has(item.productId) && (!item.personId || item.personId === id);
  }));
}
// `routineId` deja escrito que esta comida la puso una rutina y no una persona.
// Sin esa marca no se podría deshacer «los domingos fuera» sin borrar también
// los domingos que alguien decidió a mano.
export function makeRecipePlan(state, recipeId, date, slot, selected, routineId = null) {
  const recipe = state.recipes.find(item => item.id === recipeId);
  if (!recipe || !recipe.uses.includes(slot)) throw new Error('Esta preparación no está disponible para esa comida.');
  if (planFor(state, date, slot)) throw new Error('Esa comida ya tiene un plan.');
  const participants = effectiveParticipants(state, recipe, date, slot, selected);
  if (personasActivas(state).length && !participants.length) throw new Error('Selecciona al menos una persona que comerá en casa.');
  const rawItems = recipe.items.filter(item => !item.personId || participants.includes(item.personId));
  if (incompatibleItems(state, rawItems, participants).length) throw new Error('La preparación incluye un alimento incompatible con una de las personas seleccionadas.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind: 'recipe', recipeId, routineId: routineId || null, title: recipe.name, note: recipe.note, servings: recipe.servings, participants, items: rawItems.map(item => ({ ...item, id: nextId(state, 'alimento') })) };
  state.plans.push(plan);
  return plan;
}
export function setStatusPlan(state, date, slot, kind, routineId = null) {
  if (!['outside', 'order', 'unplanned'].includes(kind)) throw new Error('Estado de comida no válido.');
  if (planFor(state, date, slot)) throw new Error('Elimina o cambia primero el plan existente.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind, routineId: routineId || null, participants: [], items: [] };
  state.plans.push(plan);
  return plan;
}
export function dependents(state, sourceId) { return state.plans.filter(plan => plan.kind === 'linked' && plan.sourceId === sourceId); }
export function reservedQuantity(state, sourceId, itemId) {
  return round(dependents(state, sourceId).flatMap(plan => plan.reservedItems || []).filter(item => item.sourceItemId === itemId).reduce((sum, item) => sum + item.quantity, 0));
}
export function linkPlan(state, sourceId, date, slot, allocation, extraItems = [], participants = []) {
  const source = state.plans.find(item => item.id === sourceId);
  if (!source || source.kind !== 'recipe') throw new Error('Selecciona una preparación del menú.');
  if (date <= source.date || planFor(state, date, slot)) throw new Error('La comida vinculada debe ser posterior y estar libre.');
  const reservedItems = Object.entries(allocation).filter(([, amount]) => Number(amount) > 0).map(([sourceItemId, amount]) => {
    const item = source.items.find(row => row.id === sourceItemId);
    if (!item) throw new Error('El alimento de origen ya no existe.');
    const total = quantity(amount) + reservedQuantity(state, sourceId, sourceItemId);
    if (total > item.quantity + EPS) throw new Error(`No puedes reservar más ${product(state, item.productId)?.name || 'alimento'} del preparado.`);
    return { sourceItemId, quantity: quantity(amount) };
  });
  if (!reservedItems.length) throw new Error('Indica qué cantidad vas a reservar.');
  if (personasActivas(state).length && !participants.length) throw new Error('Selecciona quién comerá la parte reservada.');
  if (participants.some(id => isAbsent(state, date, slot, id))) throw new Error('Una persona seleccionada está marcada fuera de casa en esa comida.');
  const items = extraItems.map(item => {
    if (!product(state, item.productId) || !UNITS.includes(item.unit)) throw new Error('Selecciona alimentos y unidades válidas.');
    return { ...item, id: nextId(state, 'alimento'), quantity: quantity(item.quantity) };
  });
  if (incompatibleItems(state, items, participants).length) throw new Error('Hay un alimento adicional incompatible con una persona seleccionada.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind: 'linked', sourceId, routineId: null, title: source.title, participants, reservedItems, items, note: '' };
  state.plans.push(plan);
  return plan;
}
export function updatePlan(state, planId, fields) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan || !['recipe', 'linked'].includes(plan.kind)) throw new Error('Comida no encontrada.');
  const items = fields.items.map(item => ({ ...item, quantity: quantity(item.quantity) }));
  if (plan.kind === 'recipe') {
    for (const old of plan.items) {
      const replacement = items.find(item => item.id === old.id);
      const reserved = reservedQuantity(state, plan.id, old.id);
      if (reserved > (replacement?.quantity || 0) + EPS) throw new Error('La cantidad preparada no puede ser menor que la parte reservada.');
      if (reserved && (replacement.productId !== old.productId || replacement.unit !== old.unit || replacement.personId !== old.personId)) throw new Error('Una comida vinculada depende de ese alimento. Quita o cambia primero la reserva.');
    }
  }
  const participants = fields.participants || plan.participants;
  if (participants.some(id => isAbsent(state, plan.date, plan.slot, id))) throw new Error('Una de las personas seleccionadas está marcada fuera de casa.');
  if (incompatibleItems(state, items, participants).length) throw new Error('Hay un alimento incompatible con una persona seleccionada.');
  plan.items = items;
  plan.participants = participants;
  plan.note = String(fields.note || '').trim();
  plan.title = String(fields.title || plan.title).trim();
}
export function deletePlan(state, id, cascade = false) {
  const children = dependents(state, id);
  if (children.length && !cascade) throw new Error(`Esta preparación tiene ${children.length} comida(s) que dependen de ella.`);
  const ids = new Set([id, ...children.map(item => item.id)]);
  state.plans = state.plans.filter(item => !ids.has(item.id));
  return children.length;
}
export function movePlan(state, id, date, slot) {
  const plan = state.plans.find(item => item.id === id);
  if (!plan || (planFor(state, date, slot) && planFor(state, date, slot).id !== id)) throw new Error('El destino ya está ocupado.');
  if (plan.kind === 'linked' && date <= state.plans.find(item => item.id === plan.sourceId)?.date) throw new Error('La comida reservada debe quedar después de su preparación.');
  if (dependents(state, id).some(item => item.date <= date)) throw new Error('La preparación debe quedar antes de las comidas que dependen de ella.');
  if (plan.participants.some(personId => isAbsent(state, date, slot, personId))) throw new Error('Una persona de esta comida está marcada fuera de casa en el destino. Ajusta los participantes antes de moverla.');
  plan.date = date; plan.slot = slot;
}
export function copyPlan(state, id, date, slot) {
  const source = state.plans.find(item => item.id === id);
  if (!source || planFor(state, date, slot)) throw new Error('El destino ya está ocupado.');
  if (source.kind === 'linked') throw new Error('Copia la preparación original y vincula de nuevo la parte reservada.');
  const copy = structuredClone(source);
  copy.id = nextId(state, 'comida'); copy.date = date; copy.slot = slot;
  // La copia la pidió una persona, no la rutina que puso el original: heredar la
  // marca haría que deshacer la rutina se llevara por delante una comida que
  // alguien colocó a mano.
  copy.routineId = null;
  copy.participants = copy.participants.filter(personId => !isAbsent(state, date, slot, personId));
  if (personasActivas(state).length && source.participants.length && !copy.participants.length) throw new Error('No hay participantes disponibles para esa comida.');
  copy.items = copy.items.filter(item => !item.personId || copy.participants.includes(item.personId)).map(item => ({ ...item, id: nextId(state, 'alimento') }));
  if (incompatibleItems(state, copy.items, copy.participants).length) throw new Error('La copia incluye un alimento incompatible con una persona.');
  state.plans.push(copy);
  return copy;
}
export function repeatWeek(state, start, targetMonth = start.slice(0, 7)) {
  let count = 0, skipped = 0;
  const source = state.plans.filter(item => item.date >= start && item.date <= addDays(start, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const month = targetMonth;
  for (const offset of [7, 14, 21, 28]) {
    const mapped = new Map();
    for (const plan of source.filter(item => item.kind !== 'linked')) {
      const target = addDays(plan.date, offset);
      if (target.slice(0, 7) !== month) continue;
      if (planFor(state, target, plan.slot)) { skipped++; continue; }
      try { mapped.set(plan.id, copyPlan(state, plan.id, target, plan.slot)); count++; } catch { skipped++; }
    }
    for (const plan of source.filter(item => item.kind === 'linked')) {
      const target = addDays(plan.date, offset);
      if (target.slice(0, 7) !== month) continue;
      const originalSource = state.plans.find(item => item.id === plan.sourceId);
      const newSource = mapped.get(plan.sourceId);
      if (!newSource || !originalSource || planFor(state, target, plan.slot)) { skipped++; continue; }
      const allocation = {};
      for (const reserved of plan.reservedItems) {
        const copiedOriginalItems = originalSource.items.filter(item => !item.personId || newSource.participants.includes(item.personId));
        const index = copiedOriginalItems.findIndex(item => item.id === reserved.sourceItemId);
        const newItem = newSource.items[index];
        if (newItem) allocation[newItem.id] = reserved.quantity;
      }
      try {
        const linked = linkPlan(state, newSource.id, target, plan.slot, allocation, plan.items, plan.participants.filter(id => !isAbsent(state, target, plan.slot, id)));
        linked.title = plan.title; linked.note = plan.note; count++;
      } catch { skipped++; }
    }
  }
  return { count, skipped };
}
export function generateMonth(state, month) {
  const { start, end } = monthBounds(month);
  let count = 0; const unavailable = [];
  for (const date of dateRange(start, end)) for (const slot of SLOTS) {
    if (planFor(state, date, slot)) continue;
    const options = state.recipes.filter(recipe => {
      if (!recipe.uses.includes(slot)) return false;
      const participants = effectiveParticipants(state, recipe, date, slot);
      return (!personasActivas(state).length || participants.length > 0) && !incompatibleItems(state, recipe.items, participants).length;
    });
    if (!options.length) { unavailable.push({ date, slot }); continue; }
    const scored = options.map(recipe => ({ recipe, uses: state.plans.filter(plan => plan.recipeId === recipe.id && plan.slot === slot).length, yesterday: state.plans.some(plan => plan.date === addDays(date, -1) && plan.slot === slot && plan.recipeId === recipe.id) }));
    scored.sort((a, b) => Number(a.yesterday) - Number(b.yesterday) || a.uses - b.uses || a.recipe.name.localeCompare(b.recipe.name));
    makeRecipePlan(state, scored[0].recipe.id, date, slot); count++;
  }
  return { count, unavailable };
}

/* ── Inventario: compras, revisiones y correcciones ────────────────────── */

function eventList(state) {
  return [
    ...state.purchases.map(item => ({ kind: 'purchase', item })),
    ...state.reviews.filter(item => item.status === 'confirmed').map(item => ({ kind: 'review', item })),
    ...state.corrections.map(item => ({ kind: 'correction', item }))
  ].sort((a, b) => a.item.date.localeCompare(b.item.date) || a.item.seq - b.item.seq);
}
export function balances(state, cutoff = null) {
  const result = Object.fromEntries(state.products.map(item => [item.id, Number(state.opening[item.id] || 0)]));
  const problems = [];
  for (const event of eventList(state)) {
    if (cutoff && (event.item.date > cutoff.date || (event.item.date === cutoff.date && event.item.seq >= cutoff.seq))) break;
    if (event.kind === 'purchase') for (const line of event.item.lines) result[line.productId] = round((result[line.productId] || 0) + line.controlQuantity);
    if (event.kind === 'review') for (const [id, amount] of Object.entries(event.item.consumed)) result[id] = round((result[id] || 0) - Number(amount || 0));
    if (event.kind === 'correction') result[event.item.productId] = round((result[event.item.productId] || 0) + event.item.delta);
    for (const [id, amount] of Object.entries(result)) if (amount < -EPS) problems.push({ event: event.item.id, productId: id, amount });
  }
  return { values: result, problems };
}
export const inventoryNow = state => balances(state, { date: addDays(todayISO(), 1), seq: -Infinity }).values;
export function addPurchase(state, fields) {
  const lines = (fields.lines || []).filter(line => Number(line.quantity) > 0).map(line => {
    const amount = quantity(line.quantity);
    if (line.unit === 'paquete' && !Number.isInteger(amount)) throw new Error('Los paquetes comprados deben ser completos.');
    const controlQuantity = convert(state, line.productId, amount, line.unit);
    if (controlQuantity === null) throw new Error(`Configura la equivalencia de ${product(state, line.productId)?.name || 'este producto'} antes de confirmar.`);
    return { productId: line.productId, quantity: amount, unit: line.unit, controlQuantity };
  });
  if (!lines.length) throw new Error('Agrega al menos un producto a la compra.');
  // Queda escrito con qué base se calculó. Sin eso, una compra que salió de la
  // canasta y otra que salió del menú son indistinguibles al mirarlas después,
  // y no se puede explicar por qué se pidió esa cantidad.
  const purchase = { id: nextId(state, 'compra'), seq: state.seq, date: fields.date || todayISO(), period: fields.period || null, basis: fields.basis || null, lines };
  state.purchases.push(purchase);
  return purchase;
}
export function createReview(state, date = todayISO(), mode = 'restante') {
  const review = { id: nextId(state, 'revision'), seq: state.seq, date, status: 'draft', mode: mode === 'consumido' ? 'consumido' : 'restante', productIds: [], consumed: {}, remaining: {} };
  state.reviews.push(review);
  syncReviewProducts(state, review);
  return review;
}
export function reviewAvailability(state, review) { return balances(state, { date: review.date, seq: review.seq }).values; }
export function syncReviewProducts(state, review) {
  const available = reviewAvailability(state, review);
  review.productIds = [...new Set([...review.productIds, ...Object.keys(available).filter(id => available[id] > EPS)])];
}
// Preguntar «¿cuánto queda?» en vez de «¿cuánto se consumió?» es la diferencia
// entre mirar la nevera y hacer una resta de memoria. Lo que se guarda sigue
// siendo el consumo —es lo que mueve el saldo—, pero se deduce de lo que quedó.
export function remainingToConsumed(available, remaining) {
  const left = quantity(remaining, true);
  if (left > available + EPS) return { consumed: null, excess: round(left - available) };
  return { consumed: round(Math.max(0, available - left)), excess: 0 };
}
export function saveReview(state, reviewId, inputs, confirm = false, mode = null) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status === 'confirmed') throw new Error('Para cambiar una revisión confirmada, usa Corregir revisión.');
  syncReviewProducts(state, review);
  if (mode) review.mode = mode === 'consumido' ? 'consumido' : 'restante';
  const available = reviewAvailability(state, review);
  const consumed = {}, remaining = {};
  for (const id of review.productIds) {
    const input = inputs[id];
    // Un campo vacío es «todavía no lo he mirado», no «no queda nada». Son dos
    // cosas distintas y confundirlas descontaría existencias que sí están.
    if (input === '' || input === null || input === undefined) continue;
    if (review.mode === 'restante') {
      const { consumed: used, excess } = remainingToConsumed(available[id] || 0, input);
      if (excess > 0) throw new Error(`Dices que quedan más ${product(state, id)?.name || 'unidades'} de las que la app tiene contadas (sobran ${excess}). Usa «Corregir existencias» para registrar la diferencia.`);
      remaining[id] = quantity(input, true);
      consumed[id] = used;
    } else {
      const amount = quantity(input, true);
      if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera las existencias. Usa Corregir existencias si hace falta.`);
      consumed[id] = amount;
      remaining[id] = round(Math.max(0, (available[id] || 0) - amount));
    }
  }
  if (confirm && review.productIds.some(id => consumed[id] === undefined)) throw new Error('Hay productos pendientes de revisar. Escribe 0 si no queda nada.');
  const previous = { status: review.status, consumed: review.consumed, remaining: review.remaining };
  review.consumed = consumed;
  review.remaining = remaining;
  if (confirm) review.status = 'confirmed';
  if (balances(state).problems.length) { Object.assign(review, previous); throw new Error('Esta revisión dejaría un saldo negativo en una fecha posterior. Corrige las existencias primero.'); }
  return review;
}
export function correctReview(state, reviewId, inputs) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status !== 'confirmed') throw new Error('Revisión confirmada no encontrada.');
  const available = reviewAvailability(state, review);
  const consumed = {}, remaining = {};
  for (const id of review.productIds) {
    if (inputs[id] === '' || inputs[id] === undefined || inputs[id] === null) throw new Error('Completa todos los productos de la revisión.');
    if (review.mode === 'restante') {
      const { consumed: used, excess } = remainingToConsumed(available[id] || 0, inputs[id]);
      if (excess > 0) throw new Error(`Quedan más ${product(state, id)?.name || 'unidades'} de las que había disponibles antes de esa revisión.`);
      consumed[id] = used;
      remaining[id] = quantity(inputs[id], true);
    } else {
      const amount = quantity(inputs[id], true);
      if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera lo disponible antes de esa revisión.`);
      consumed[id] = amount;
      remaining[id] = round(Math.max(0, (available[id] || 0) - amount));
    }
  }
  const previous = { consumed: review.consumed, remaining: review.remaining };
  review.consumed = consumed;
  review.remaining = remaining;
  if (balances(state).problems.length) { Object.assign(review, previous); throw new Error('La corrección dejaría un saldo negativo en una revisión posterior.'); }
  return review;
}
export function correctStock(state, productId, actual, reason) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const amount = quantity(actual, true);
  const current = inventoryNow(state)[productId] || 0;
  const correction = { id: nextId(state, 'ajuste'), seq: state.seq, date: todayISO(), productId, delta: round(amount - current), actual: amount, reason: String(reason || '').trim() };
  state.corrections.push(correction);
  if (balances(state).problems.length) { state.corrections.pop(); throw new Error('Esta corrección dejaría un saldo negativo en una revisión posterior.'); }
  return correction;
}
export function lastStockReview(state) {
  return [...state.reviews.filter(item => item.status === 'confirmed'), ...state.corrections].sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)[0]?.date || null;
}

/* ── Lista de compra ───────────────────────────────────────────────────── */

// Dos bases, y son excluyentes: lo que la casa consume —la canasta habitual con
// los cambios del mes— o los alimentos del menú planificado. Sumarlas contaría
// dos veces el mismo arroz.
export const BASES = ['casa', 'menu'];
// Todo lo que no sea el menú cae en «casa»: es la base recomendada, y los
// respaldos viejos traen escritos nombres de bases que ya no existen.
const normalizeBasis = basis => (basis === 'menu' ? 'menu' : 'casa');
export function shoppingList(state, start, end, basis = 'casa') {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Selecciona un período válido.');
  const resolved = normalizeBasis(basis);
  const need = {}, pending = [];
  let months = [];
  if (resolved === 'menu') {
    for (const plan of state.plans) {
      if (plan.date < start || plan.date > end || !['recipe', 'linked'].includes(plan.kind)) continue;
      for (const item of plan.items) {
        const converted = convert(state, item.productId, item.quantity, item.unit);
        if (converted === null) { pending.push({ productId: item.productId, unit: item.unit, date: plan.date, reason: 'equivalencia' }); continue; }
        need[item.productId] = round((need[item.productId] || 0) + converted);
      }
    }
  } else {
    months = periodMonths(start, end);
    // Si el período es exactamente una de las dos quincenas de un mes que se
    // compra por quincenas, manda el reparto que la casa haya decidido por
    // alimento. En cualquier otro caso se prorratea por días, como siempre.
    const quincena = quincenaDe(state, start, end);
    for (const segment of months) {
      // Cada tramo se cobra contra la canasta de SU mes —el hábito con los
      // cambios de ese mes ya aplicados—, prorrateado por los días de ese mes.
      // Usar la duración del mes inicial para todo el período daba un número
      // que no significaba nada cuando la compra cruzaba de mes.
      for (const line of effectiveBasket(state, segment.month)) {
        if (line.quantity === null) { pending.push({ productId: line.productId, unit: line.unit, date: null, reason: 'cantidad' }); continue; }
        const delPeriodo = quincena
          ? parteDeLaQuincena(state, line.productId, line.quantity, quincena.id)
          : line.quantity * segment.share;
        const converted = convert(state, line.productId, delPeriodo, line.unit);
        if (converted === null) { pending.push({ productId: line.productId, unit: line.unit, date: null, reason: 'equivalencia' }); continue; }
        need[line.productId] = round((need[line.productId] || 0) + converted);
      }
    }
  }
  const stock = inventoryNow(state);
  const lines = Object.entries(need).map(([id, amount]) => {
    const item = product(state, id);
    const available = stock[id] || 0;
    const shortfall = round(Math.max(0, amount - available));
    let purchaseQuantity = shortfall, purchaseUnit = item.purchaseUnit, acquiredControl = shortfall;
    if (purchaseUnit !== item.controlUnit) {
      const factor = item.equivalences?.[purchaseUnit];
      if (!Number.isFinite(factor) || factor <= 0) {
        if (shortfall > 0) pending.push({ productId: id, unit: purchaseUnit, date: null, reason: 'equivalencia' });
        purchaseQuantity = null; acquiredControl = null;
      } else {
        purchaseQuantity = purchaseUnit === 'paquete' ? Math.ceil((shortfall - EPS) / factor) : round(shortfall / factor);
        acquiredControl = round(purchaseQuantity * factor);
      }
    }
    return { productId: id, need: amount, available, shortfall, purchaseQuantity, purchaseUnit, acquiredControl };
  }).sort((a, b) => product(state, a.productId).name.localeCompare(product(state, b.productId).name));
  // Comprando por canasta el menú no hace falta, así que avisar de comidas sin
  // planificar sería un reproche por algo que no se pidió.
  const missing = resolved !== 'menu' ? [] : dateRange(start, end).flatMap(date => SLOTS.filter(slot => !planFor(state, date, slot) || planFor(state, date, slot).kind === 'unplanned').map(slot => ({ date, slot })));
  const share = resolved === 'menu' ? {} : basketShare(start, end);
  // Comprando por canasta, las comidas fuera no descuentan nada: rebajar el
  // detergente del mes porque la familia almorzó fuera un domingo no tiene
  // sentido. Se cuentan para poder decirlo como aviso, nunca para restarlo.
  const fuera = state.plans.filter(plan => plan.date >= start && plan.date <= end && ['outside', 'order'].includes(plan.kind)).length;
  return { start, end, basis: resolved, lines, missing, pending, months, fuera, lastReview: lastStockReview(state), future: start > todayISO(), ...share };
}
export const basisLabel = basis => ({ casa: 'mi canasta habitual', menu: 'el menú' })[normalizeBasis(basis)];

/* ── Cada cuánto se hace la compra ─────────────────────────────────────────

   Hay casas que compran una vez al mes y casas que compran cada quincena, y no
   es una preferencia de pantalla: cambia en cuántas veces se parte la lista.

   Lo que no puede pasar es que cambiar hoy la frecuencia reescriba lo que pasó
   en marzo. Si en marzo se compró una vez al mes, marzo se compró una vez al
   mes, y el historial tiene que seguir diciendo eso dentro de dos años. Por eso
   la frecuencia no es un interruptor: es una lista de tramos con fecha de
   vigencia, y cada mes pregunta cuál le tocaba a él.

       [{ desde: '2026-01', tipo: 'mensual' }, { desde: '2026-10', tipo: 'quincenal' }]

   Eso se lee «mensual hasta septiembre de 2026, quincenal desde octubre». Los
   meses anteriores al primer tramo son mensuales, que es como se comportaba la
   app antes de que esto existiera: quien ya la usaba no ve ningún cambio.

   Las quincenas son del 1 al 15 y del 16 al último día real del mes. No son
   ventanas de catorce días: en un mes de 31 la segunda quincena tiene dieciséis
   días y en febrero tiene trece, porque es cuando la casa come. */

export const FRECUENCIAS = ['mensual', 'quincenal'];
export const FRECUENCIA_POR_DEFECTO = 'mensual';
const frecuenciaValida = tipo => (FRECUENCIAS.includes(tipo) ? tipo : null);

const compraDe = state => (state?.settings?.compra && typeof state.settings.compra === 'object' ? state.settings.compra : {});

// Los tramos en orden, sin basura y sin repetidos por mes.
export function historialDeFrecuencia(state) {
  const filas = Array.isArray(compraDe(state).frecuencia) ? compraDe(state).frecuencia : [];
  const porMes = new Map();
  for (const fila of filas) {
    const tipo = frecuenciaValida(fila?.tipo);
    if (!tipo || !validMonth(fila?.desde)) continue;
    porMes.set(fila.desde, { desde: fila.desde, tipo });
  }
  return [...porMes.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

export function frecuenciaDe(state, mes) {
  if (!validMonth(mes)) return FRECUENCIA_POR_DEFECTO;
  let tipo = FRECUENCIA_POR_DEFECTO;
  for (const fila of historialDeFrecuencia(state)) {
    if (fila.desde > mes) break;
    tipo = fila.tipo;
  }
  return tipo;
}

// Cambiar la frecuencia a partir de un mes. Lo anterior a ese mes no se toca:
// ni este dato, ni las compras, ni las revisiones, ni nada.
export function ponerFrecuencia(state, tipo, desde) {
  const valido = frecuenciaValida(tipo);
  if (!valido) throw new Error('Elige si la compra es mensual o quincenal.');
  if (!validMonth(desde)) throw new Error('Elige desde qué mes entra en vigencia.');
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (!state.settings.compra || typeof state.settings.compra !== 'object') state.settings.compra = {};
  const filas = historialDeFrecuencia(state).filter(fila => fila.desde !== desde);
  filas.push({ desde, tipo: valido });
  filas.sort((a, b) => a.desde.localeCompare(b.desde));
  // Dos tramos seguidos que dicen lo mismo no son dos tramos: sobraría uno, y
  // el historial que se le enseña al usuario se llenaría de líneas sin cambio.
  const limpias = filas.filter((fila, indice) => indice === 0 || fila.tipo !== filas[indice - 1].tipo);
  state.settings.compra.frecuencia = limpias;
  return limpias;
}

// Los períodos de compra de un mes: uno si es mensual, dos si es quincenal.
export function periodosDelMes(state, mes) {
  if (!validMonth(mes)) throw new Error('Ese mes no es válido.');
  const { start, end } = monthBounds(mes);
  const dias = (desde, hasta) => dateRange(desde, hasta).length;
  if (frecuenciaDe(state, mes) !== 'quincenal') {
    return [{ id: 'mes', etiqueta: 'Todo el mes', start, end, dias: dias(start, end) }];
  }
  const corte = `${mes}-15`;
  return [
    { id: 'primera', etiqueta: '1.ª quincena', start, end: corte, dias: dias(start, corte) },
    { id: 'segunda', etiqueta: '2.ª quincena', start: `${mes}-16`, end, dias: dias(`${mes}-16`, end) }
  ];
}

// ¿Este período es exactamente una de las dos quincenas de un mes que se compra
// por quincenas? Solo entonces manda el reparto por producto. Cualquier otro
// rango de fechas —«del 3 al 9», un mes entero, una casa que compra mensual—
// sigue calculándose como siempre, por días.
export function quincenaDe(state, start, end) {
  if (!validDate(start) || !validDate(end)) return null;
  const mes = start.slice(0, 7);
  if (end.slice(0, 7) !== mes || frecuenciaDe(state, mes) !== 'quincenal') return null;
  return periodosDelMes(state, mes).find(periodo => periodo.start === start && periodo.end === end) || null;
}

/* ── Cómo se parte el mes entre las dos quincenas ──────────────────────────

   La necesidad del mes no se toca: sigue siendo la del hábito. Lo único que se
   guarda aquí es qué parte de ella se compra en la primera quincena, y solo
   para los alimentos donde alguien lo dijo.

   Sin decir nada, se reparte a la mitad. Es una sugerencia viva, no una
   división escrita: si mañana cambia la cantidad del mes, la sugerencia cambia
   con ella. Escribir de entrada la mitad de cada alimento en el disco sería
   convertir una suposición en un dato, y después nadie sabría cuáles eligió. */

export const MODOS_DE_REPARTO = ['mitad', 'todo', 'nada', 'cantidad'];

export function repartoDe(state, productId, total) {
  const cantidadMes = Number(total);
  if (!Number.isFinite(cantidadMes) || cantidadMes < 0) return { primera: 0, segunda: 0, modo: 'mitad', sugerido: true };
  const fila = compraDe(state).reparto?.[productId];
  const modo = MODOS_DE_REPARTO.includes(fila?.modo) ? fila.modo : 'mitad';
  if (modo === 'todo') return { primera: cantidadMes, segunda: 0, modo, sugerido: false };
  if (modo === 'nada') return { primera: 0, segunda: cantidadMes, modo, sugerido: false };
  if (modo === 'cantidad') {
    const primera = round(Math.min(cantidadMes, Math.max(0, Number(fila.cantidad) || 0)));
    return { primera, segunda: round(cantidadMes - primera), modo, sugerido: false };
  }
  const primera = round(cantidadMes / 2);
  return { primera, segunda: round(cantidadMes - primera), modo: 'mitad', sugerido: true };
}

export function ponerReparto(state, productId, modo, cantidad = null) {
  if (!product(state, productId)) throw new Error('Ese alimento ya no existe.');
  if (!MODOS_DE_REPARTO.includes(modo)) throw new Error('Ese reparto no es válido.');
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (!state.settings.compra || typeof state.settings.compra !== 'object') state.settings.compra = {};
  if (!state.settings.compra.reparto || typeof state.settings.compra.reparto !== 'object') state.settings.compra.reparto = {};
  // «A la mitad» es la ausencia de decisión, así que se guarda quitando la fila
  // en vez de escribiendo una: así la sugerencia sigue viva si cambia el mes.
  if (modo === 'mitad') delete state.settings.compra.reparto[productId];
  else state.settings.compra.reparto[productId] = { modo, cantidad: modo === 'cantidad' ? round(Math.max(0, Number(cantidad) || 0)) : null };
  return state.settings.compra.reparto[productId] || { modo: 'mitad', cantidad: null };
}

// Lo que le toca a una quincena de la cantidad mensual de un alimento. Las dos
// partes suman siempre el mes entero: es lo único que no puede fallar aquí.
export function parteDeLaQuincena(state, productId, total, cual) {
  const reparto = repartoDe(state, productId, total);
  return cual === 'primera' ? reparto.primera : reparto.segunda;
}

/* ── Respaldo ──────────────────────────────────────────────────────────── */

export function exportState(state) { return JSON.stringify(state, null, 2); }
export function importState(json) {
  const parsed = JSON.parse(json);
  // Migrar primero y validar después: así un respaldo viejo entra completo, y
  // si la conversión dejara algo incoherente se rechaza aquí, antes de tocar
  // nada de lo que el usuario ya tenía guardado.
  const result = migrate(parsed);
  if (!result.ok) throw new Error(result.error);
  const data = result.state;
  const empty = createEmptyState();
  if (!Number.isInteger(data.seq) || Object.keys(empty).some(key => !(key in data))) throw new Error('Este archivo no es un respaldo válido de ¿Qué comemos?.');
  for (const key of ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'mealRoutines', 'activity']) {
    if (!Array.isArray(data[key])) throw new Error('El respaldo tiene datos incompletos.');
  }
  if (typeof data.opening !== 'object' || data.opening === null) throw new Error('El respaldo no tiene existencias válidas.');
  if (!data.habitualBasket || !Array.isArray(data.habitualBasket.lines)) throw new Error('El respaldo no tiene una canasta habitual válida.');
  if (typeof data.monthOverrides !== 'object' || data.monthOverrides === null) throw new Error('El respaldo no tiene cambios mensuales válidos.');
  for (const [month, override] of Object.entries(data.monthOverrides)) {
    if (!validMonth(month) || !Array.isArray(override?.changes)) throw new Error(`Los cambios de ${month} están dañados.`);
  }
  if (typeof data.monthPlans !== 'object' || data.monthPlans === null) throw new Error('El respaldo no tiene meses válidos.');
  for (const month of Object.keys(data.monthPlans)) {
    if (!validMonth(month)) throw new Error(`El mes ${month} está dañado.`);
  }
  if (typeof data.settings !== 'object' || data.settings === null) throw new Error('El respaldo no tiene preferencias válidas.');
  if (balances(data).problems.length) throw new Error('El respaldo contiene existencias negativas.');
  return data;
}
