import { containsWords, normalizeName, similarity } from './nombres.js';
import { SCHEMA_VERSION, migrate } from './migrate.js';

export { normalizeName, SCHEMA_VERSION };

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
  // La canasta base es lo que la casa consume en un mes corriente. Cada mes
  // tiene además su propia copia, que puede apartarse de la base sin cambiarla:
  // comprar algo extraordinario en septiembre no debe reescribir el hábito.
  baseBasket: { lines: [], updatedAt: null, history: [] },
  monthlyBaskets: {},
  invoices: [], activity: []
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
      person.restrictions = [...new Set(person.restrictions.map(swap))];
      person.habitual = person.habitual.map(row => ({ ...row, productId: swap(row.productId) }));
    }
    for (const basket of [state.baseBasket, ...Object.values(state.monthlyBaskets)]) {
      basket.lines = mergeBasketLines(basket.lines.map(line => ({ ...line, productId: swap(line.productId) })));
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

/* ── Canasta base y canasta de cada mes ────────────────────────────────── */

// La canasta base es el hábito: lo que la casa consume en un mes corriente,
// escrito una vez. La canasta de un mes es lo que pasó de verdad ese mes, y
// nace como copia de la base. Son dos cosas distintas a propósito: quitar el
// atún en septiembre no debe borrarlo del hábito, y agregar algo extraordinario
// tampoco debe aparecer en octubre.
//
// Cada mes guarda su lista completa, no las diferencias. Las diferencias se
// calculan comparando; guardarlas sería atar el pasado a una base que todavía
// puede cambiar, y un mes cerrado tiene que quedarse como quedó.

export function baseLines(state) { return state.baseBasket.lines; }
export function monthBasket(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  return state.monthlyBaskets[month] || null;
}
// Lo que se usa para calcular: la canasta del mes si existe, y si no la base.
// Que un mes no se haya abierto no significa que la casa no coma ese mes.
export function basketLines(state, month = null) {
  if (!month) return baseLines(state);
  return monthBasket(state, month)?.lines || baseLines(state);
}
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
export function setBaseBasket(state, lines, options = {}) {
  const next = normalizeBasketLines(state, lines, options);
  const date = todayISO();
  if (state.baseBasket.lines.length) {
    state.baseBasket.history = [...(state.baseBasket.history || []), { date, count: state.baseBasket.lines.length }].slice(-24);
  }
  state.baseBasket.lines = next;
  state.baseBasket.updatedAt = date;
  return next;
}
// El consumo mensual de un solo alimento, para poder escribirlo desde su propia
// ficha. La canasta y la ficha del producto son la misma lista vista de dos
// formas. Vacío o cero borra la línea en vez de guardar un consumo de cero, que
// no significa nada.
export function setBaseBasketLine(state, productId, amount, unit, priority) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const lines = state.baseBasket.lines;
  const index = lines.findIndex(line => line.productId === productId);
  if (amount === '' || amount === undefined || amount === null || Number(amount) === 0) {
    if (index >= 0) lines.splice(index, 1);
    state.baseBasket.updatedAt = todayISO();
    return null;
  }
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  const line = {
    id: index >= 0 ? lines[index].id : nextId(state, 'canasta'),
    productId, quantity: quantity(amount), unit,
    priority: PRIORITIES.includes(priority) ? priority : lines[index]?.priority || 'frecuente'
  };
  if (index >= 0) lines[index] = line; else lines.push(line);
  state.baseBasket.updatedAt = todayISO();
  return line;
}
// Abrir un mes lo copia de la base. Es el único momento en que la base entra en
// un mes: a partir de aquí las dos viven separadas.
export function openMonthBasket(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (state.monthlyBaskets[month]) return state.monthlyBaskets[month];
  const date = todayISO();
  state.monthlyBaskets[month] = {
    month,
    lines: structuredClone(state.baseBasket.lines).map(line => ({ ...line, id: nextId(state, 'canasta') })),
    createdAt: date, updatedAt: date, basedOn: state.baseBasket.updatedAt
  };
  return state.monthlyBaskets[month];
}
export function setMonthBasket(state, month, lines, options = {}) {
  const basket = openMonthBasket(state, month);
  basket.lines = normalizeBasketLines(state, lines, options);
  basket.updatedAt = todayISO();
  return basket.lines;
}
export function setMonthBasketLine(state, month, productId, amount, unit, priority) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const basket = openMonthBasket(state, month);
  const index = basket.lines.findIndex(line => line.productId === productId);
  if (amount === '' || amount === undefined || amount === null || Number(amount) === 0) {
    if (index >= 0) basket.lines.splice(index, 1);
    basket.updatedAt = todayISO();
    return null;
  }
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  const line = {
    id: index >= 0 ? basket.lines[index].id : nextId(state, 'canasta'),
    productId, quantity: quantity(amount), unit,
    priority: PRIORITIES.includes(priority) ? priority : basket.lines[index]?.priority || 'frecuente'
  };
  if (index >= 0) basket.lines[index] = line; else basket.lines.push(line);
  basket.updatedAt = todayISO();
  return line;
}
export function removeMonthBasketLine(state, month, productId) {
  const basket = openMonthBasket(state, month);
  const before = basket.lines.length;
  basket.lines = basket.lines.filter(line => line.productId !== productId);
  basket.updatedAt = todayISO();
  return before !== basket.lines.length;
}
// En qué se aparta este mes de la costumbre. Es lo que permite enseñar «esto lo
// cambiaste solo para septiembre» y preguntar si debe pasar también a la base.
export function monthDiff(state, month) {
  const basket = monthBasket(state, month);
  if (!basket) return { added: [], removed: [], changed: [], same: [], open: false };
  const base = new Map(baseLines(state).map(line => [line.productId, line]));
  const added = [], changed = [], same = [];
  for (const line of basket.lines) {
    const origin = base.get(line.productId);
    if (!origin) { added.push(line); continue; }
    if (origin.quantity !== line.quantity || origin.unit !== line.unit) changed.push({ line, base: origin });
    else same.push(line);
  }
  const ids = new Set(basket.lines.map(line => line.productId));
  const removed = baseLines(state).filter(line => !ids.has(line.productId));
  return { added, removed, changed, same, open: true };
}
// Pasar un cambio del mes a la base es siempre explícito y por alimento: es lo
// que separa «este mes compré más pollo» de «en esta casa ahora se come más
// pollo». Confundirlos reescribiría el hábito sin que nadie lo pidiera.
export function promoteToBase(state, month, productIds) {
  const basket = monthBasket(state, month);
  if (!basket) throw new Error('Ese mes todavía no tiene canasta.');
  const wanted = new Set(productIds || []);
  if (!wanted.size) throw new Error('Selecciona qué alimentos pasan a la canasta base.');
  let applied = 0;
  for (const id of wanted) {
    const line = basket.lines.find(row => row.productId === id);
    if (line) { setBaseBasketLine(state, id, line.quantity, line.unit, line.priority); applied++; continue; }
    // Lo que se quitó del mes y se manda a la base es una baja del hábito.
    if (baseLines(state).some(row => row.productId === id)) { setBaseBasketLine(state, id, ''); applied++; }
  }
  return applied;
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

export function upsertPerson(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la persona.');
  let person = state.people.find(item => item.id === fields.id);
  if (!person) { person = { id: nextId(state, 'persona') }; state.people.push(person); }
  person.name = name;
  person.kind = ['adulto', 'nino'].includes(fields.kind) ? fields.kind : person.kind || 'adulto';
  person.restrictions = [...new Set(fields.restrictions || [])].filter(id => product(state, id));
  // Una restricción escrita por nombre cuando el alimento todavía no existe no
  // se pierde: se guarda como texto y se enlaza en cuanto el alimento aparezca.
  // Bloquear a quien registra su casa por un producto que aún no creó sería
  // justo el orden invertido que hace que nadie termine de configurar nada.
  person.pendingRestrictions = [...new Set((fields.pendingRestrictions || []).map(value => String(value).trim()).filter(Boolean))];
  person.habitual = (fields.habitual || []).map(item => ({ productId: item.productId, quantity: quantity(item.quantity), unit: item.unit }));
  linkPendingRestrictions(state, person);
  return person;
}
export function linkPendingRestrictions(state, person) {
  const left = [];
  for (const text of person.pendingRestrictions || []) {
    const match = productByName(state, text);
    if (match) { if (!person.restrictions.includes(match.id)) person.restrictions.push(match.id); }
    else left.push(text);
  }
  person.pendingRestrictions = left;
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
  if (!items.length) throw new Error('Agrega al menos un alimento principal.');
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
export function effectiveParticipants(state, recipe, date, slot, selected) {
  const ids = selected || (recipe.covers.length ? recipe.covers : state.people.map(item => item.id));
  return ids.filter(id => state.people.some(person => person.id === id) && !isAbsent(state, date, slot, id));
}
export function incompatibleItems(state, items, participants) {
  return items.filter(item => participants.some(id => {
    const person = state.people.find(p => p.id === id);
    return person?.restrictions.includes(item.productId) && (!item.personId || item.personId === id);
  }));
}
export function makeRecipePlan(state, recipeId, date, slot, selected) {
  const recipe = state.recipes.find(item => item.id === recipeId);
  if (!recipe || !recipe.uses.includes(slot)) throw new Error('Esta preparación no está disponible para esa comida.');
  if (planFor(state, date, slot)) throw new Error('Esa comida ya tiene un plan.');
  const participants = effectiveParticipants(state, recipe, date, slot, selected);
  if (state.people.length && !participants.length) throw new Error('Selecciona al menos una persona que comerá en casa.');
  const rawItems = recipe.items.filter(item => !item.personId || participants.includes(item.personId));
  if (incompatibleItems(state, rawItems, participants).length) throw new Error('La preparación incluye un alimento incompatible con una de las personas seleccionadas.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind: 'recipe', recipeId, title: recipe.name, note: recipe.note, servings: recipe.servings, participants, items: rawItems.map(item => ({ ...item, id: nextId(state, 'alimento') })) };
  state.plans.push(plan);
  return plan;
}
export function setStatusPlan(state, date, slot, kind) {
  if (!['outside', 'order', 'unplanned'].includes(kind)) throw new Error('Estado de comida no válido.');
  if (planFor(state, date, slot)) throw new Error('Elimina o cambia primero el plan existente.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind, participants: [], items: [] };
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
  if (state.people.length && !participants.length) throw new Error('Selecciona quién comerá la parte reservada.');
  if (participants.some(id => isAbsent(state, date, slot, id))) throw new Error('Una persona seleccionada está marcada fuera de casa en esa comida.');
  const items = extraItems.map(item => {
    if (!product(state, item.productId) || !UNITS.includes(item.unit)) throw new Error('Selecciona alimentos y unidades válidas.');
    return { ...item, id: nextId(state, 'alimento'), quantity: quantity(item.quantity) };
  });
  if (incompatibleItems(state, items, participants).length) throw new Error('Hay un alimento adicional incompatible con una persona seleccionada.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind: 'linked', sourceId, title: source.title, participants, reservedItems, items, note: '' };
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
  copy.participants = copy.participants.filter(personId => !isAbsent(state, date, slot, personId));
  if (state.people.length && source.participants.length && !copy.participants.length) throw new Error('No hay participantes disponibles para esa comida.');
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
      return (!state.people.length || participants.length > 0) && !incompatibleItems(state, recipe.items, participants).length;
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

// Tres bases posibles, y son excluyentes: el menú del período, la canasta base,
// o la canasta de cada mes que toca el período. Sumarlas contaría dos veces el
// mismo arroz.
export const BASES = ['menu', 'base', 'mensual'];
const normalizeBasis = basis => (basis === 'basket' ? 'mensual' : BASES.includes(basis) ? basis : 'menu');
export function shoppingList(state, start, end, basis = 'menu') {
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
    for (const segment of months) {
      // Cada tramo se cobra contra la canasta de SU mes, prorrateado por los
      // días de ese mes. Usar la duración del mes inicial para todo el período
      // daba un número que no significaba nada cuando la compra cruzaba de mes.
      const lines = resolved === 'base' ? baseLines(state) : basketLines(state, segment.month);
      for (const line of lines) {
        if (line.quantity === null) { pending.push({ productId: line.productId, unit: line.unit, date: null, reason: 'cantidad' }); continue; }
        const converted = convert(state, line.productId, line.quantity * segment.share, line.unit);
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
  return { start, end, basis: resolved, lines, missing, pending, months, lastReview: lastStockReview(state), future: start > todayISO(), ...share };
}
export const basisLabel = basis => ({ menu: 'el menú', base: 'la canasta base', mensual: 'la canasta del mes' })[normalizeBasis(basis)];

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
  for (const key of ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'invoices', 'activity']) {
    if (!Array.isArray(data[key])) throw new Error('El respaldo tiene datos incompletos.');
  }
  if (typeof data.opening !== 'object' || data.opening === null) throw new Error('El respaldo no tiene existencias válidas.');
  if (!data.baseBasket || !Array.isArray(data.baseBasket.lines)) throw new Error('El respaldo no tiene una canasta base válida.');
  if (typeof data.monthlyBaskets !== 'object' || data.monthlyBaskets === null) throw new Error('El respaldo no tiene canastas mensuales válidas.');
  for (const [month, basket] of Object.entries(data.monthlyBaskets)) {
    if (!validMonth(month) || !Array.isArray(basket?.lines)) throw new Error(`La canasta de ${month} está dañada.`);
  }
  if (balances(data).problems.length) throw new Error('El respaldo contiene existencias negativas.');
  return data;
}
