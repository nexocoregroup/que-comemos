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
export const monthBounds = month => ({ start: `${month}-01`, end: addDays(`${month}-01`, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() - 1) });
export const weekStart = date => addDays(date, -(new Date(`${date}T12:00:00`).getDay() + 6) % 7);
export const dateRange = (start, end) => {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Selecciona fechas válidas y en orden.');
  if (new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`) > 366 * 86400000) throw new Error('El período no puede superar un año.');
  const dates = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
};
export const createEmptyState = () => ({ version: 1, seq: 0, demo: false, products: [], people: [], recipes: [], plans: [], absences: [], opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [], basket: [] });
// Campos que aparecieron después de la primera versión del respaldo. Un archivo
// exportado antes de que existieran se rellena al importarlo en vez de
// rechazarse: nadie debería perder los datos de su casa porque la app creció.
const ADDED_AFTER_V1 = { basket: [] };
export function nextId(state, prefix) { state.seq += 1; return `${prefix}-${state.seq}`; }
export function quantity(value, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error('Escribe una cantidad mayor que cero.');
  return round(n);
}
export function product(state, id) { return state.products.find(item => item.id === id); }
export function convert(state, productId, amount, unit) {
  const item = product(state, productId);
  if (!item) throw new Error('El producto ya no existe.');
  if (unit === item.controlUnit) return round(Number(amount));
  const factor = item.equivalences?.[unit];
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return round(Number(amount) * factor);
}
export function addProduct(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre del producto.');
  if (!UNITS.includes(fields.controlUnit) || !UNITS.includes(fields.purchaseUnit)) throw new Error('Selecciona unidades válidas.');
  const item = { id: nextId(state, 'producto'), name, controlUnit: fields.controlUnit, purchaseUnit: fields.purchaseUnit, equivalences: {}, slice: null };
  state.products.push(item);
  setSlice(state, item.id, fields.slice);
  // Lo que ya hay en casa al registrar el producto. Es la apertura del saldo:
  // se fija una sola vez, aquí, porque después el inventario solo se mueve con
  // compras, revisiones y correcciones.
  state.opening[item.id] = fields.opening === '' || fields.opening === undefined || fields.opening === null ? 0 : quantity(fields.opening, true);
  return item;
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
}
// La canasta es lo que la casa consume en un mes corriente, escrito una vez y
// reutilizado. Vive aparte del menú a propósito: sirve para comprar sin haber
// planificado día por día. Como el menú, tampoco mueve existencias —eso sigue
// siendo cosa de compras, revisiones y correcciones—, solo calcula qué falta.
export function setBasket(state, lines) {
  const items = (lines || []).map(line => {
    if (!product(state, line.productId) || !UNITS.includes(line.unit)) throw new Error('Selecciona un alimento y su unidad.');
    return { id: line.id || nextId(state, 'canasta'), productId: line.productId, quantity: quantity(line.quantity), unit: line.unit };
  });
  state.basket = items;
  return items;
}
// Se escribe por mes y se compra por quincena o por fechas sueltas, así que a
// un período le toca su proporción de días sobre el mes en que empieza: una
// quincena de septiembre pide la mitad de la canasta.
export function basketShare(start, end) {
  const days = dateRange(start, end).length;
  const month = start.slice(0, 7);
  const bounds = monthBounds(month);
  const monthDays = dateRange(bounds.start, bounds.end).length;
  return { days, monthDays, month, share: days / monthDays };
}
export function upsertPerson(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la persona.');
  let person = state.people.find(item => item.id === fields.id);
  if (!person) { person = { id: nextId(state, 'persona') }; state.people.push(person); }
  person.name = name;
  person.restrictions = [...new Set(fields.restrictions || [])].filter(id => product(state, id));
  person.habitual = (fields.habitual || []).map(item => ({ productId: item.productId, quantity: quantity(item.quantity), unit: item.unit }));
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
  const purchase = { id: nextId(state, 'compra'), seq: state.seq, date: fields.date || todayISO(), period: fields.period || null, lines };
  state.purchases.push(purchase);
  return purchase;
}
export function createReview(state, date = todayISO()) {
  const review = { id: nextId(state, 'revision'), seq: state.seq, date, status: 'draft', productIds: [], consumed: {} };
  state.reviews.push(review);
  syncReviewProducts(state, review);
  return review;
}
export function reviewAvailability(state, review) { return balances(state, { date: review.date, seq: review.seq }).values; }
export function syncReviewProducts(state, review) {
  const available = reviewAvailability(state, review);
  review.productIds = [...new Set([...review.productIds, ...Object.keys(available).filter(id => available[id] > EPS)])];
}
export function saveReview(state, reviewId, inputs, confirm = false) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status === 'confirmed') throw new Error('Para cambiar una revisión confirmada, usa Corregir revisión.');
  syncReviewProducts(state, review);
  const available = reviewAvailability(state, review);
  const consumed = {};
  for (const id of review.productIds) {
    const input = inputs[id];
    if (input === '' || input === null || input === undefined) continue;
    const amount = quantity(input, true);
    if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera las existencias. Usa Corregir existencias si hace falta.`);
    consumed[id] = amount;
  }
  if (confirm && review.productIds.some(id => consumed[id] === undefined)) throw new Error('Hay productos pendientes de revisar. Escribe 0 si no se consumieron.');
  const previous = { status: review.status, consumed: review.consumed };
  review.consumed = consumed;
  if (confirm) review.status = 'confirmed';
  if (balances(state).problems.length) { Object.assign(review, previous); throw new Error('Esta revisión dejaría un saldo negativo en una fecha posterior. Corrige las existencias primero.'); }
  return review;
}
export function correctReview(state, reviewId, inputs) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status !== 'confirmed') throw new Error('Revisión confirmada no encontrada.');
  const available = reviewAvailability(state, review);
  const consumed = {};
  for (const id of review.productIds) {
    if (inputs[id] === '' || inputs[id] === undefined || inputs[id] === null) throw new Error('Completa todos los productos de la revisión.');
    const amount = quantity(inputs[id], true);
    if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera lo disponible antes de esa revisión.`);
    consumed[id] = amount;
  }
  const previous = review.consumed;
  review.consumed = consumed;
  if (balances(state).problems.length) { review.consumed = previous; throw new Error('La corrección dejaría un saldo negativo en una revisión posterior.'); }
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
// Dos bases posibles para calcular qué falta, y son excluyentes: el menú del
// período o la canasta del mes. Sumarlas contaría dos veces el mismo arroz.
export function shoppingList(state, start, end, basis = 'menu') {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Selecciona un período válido.');
  const need = {}, pending = [];
  if (basis === 'basket') {
    const { share } = basketShare(start, end);
    for (const line of state.basket || []) {
      const converted = convert(state, line.productId, line.quantity * share, line.unit);
      if (converted === null) { pending.push({ productId: line.productId, unit: line.unit, date: null }); continue; }
      need[line.productId] = round((need[line.productId] || 0) + converted);
    }
  } else for (const plan of state.plans) {
    if (plan.date < start || plan.date > end || !['recipe', 'linked'].includes(plan.kind)) continue;
    for (const item of plan.items) {
      const converted = convert(state, item.productId, item.quantity, item.unit);
      if (converted === null) { pending.push({ productId: item.productId, unit: item.unit, date: plan.date }); continue; }
      need[item.productId] = round((need[item.productId] || 0) + converted);
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
        if (shortfall > 0) pending.push({ productId: id, unit: purchaseUnit, date: null });
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
  const missing = basis === 'basket' ? [] : dateRange(start, end).flatMap(date => SLOTS.filter(slot => !planFor(state, date, slot) || planFor(state, date, slot).kind === 'unplanned').map(slot => ({ date, slot })));
  return { start, end, basis, lines, missing, pending, lastReview: lastStockReview(state), future: start > todayISO(), ...(basis === 'basket' ? basketShare(start, end) : {}) };
}
export function exportState(state) { return JSON.stringify(state, null, 2); }
export function importState(json) {
  const data = JSON.parse(json);
  const empty = createEmptyState();
  if (data && typeof data === 'object') for (const [key, value] of Object.entries(ADDED_AFTER_V1)) if (!(key in data)) data[key] = structuredClone(value);
  if (!data || data.version !== 1 || !Number.isInteger(data.seq) || Object.keys(empty).some(key => !(key in data))) throw new Error('Este archivo no es un respaldo válido de ¿Qué comemos?.');
  for (const key of ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'basket']) if (!Array.isArray(data[key])) throw new Error('El respaldo tiene datos incompletos.');
  if (typeof data.opening !== 'object' || data.opening === null) throw new Error('El respaldo no tiene existencias válidas.');
  if (balances(data).problems.length) throw new Error('El respaldo contiene existencias negativas.');
  return data;
}
