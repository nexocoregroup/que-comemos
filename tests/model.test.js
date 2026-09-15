import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addProduct, product, setSlice, setHabitualBasket, setHabitualLine, addPurchase, balances, convert, correctReview, createEmptyState, createReview, exportState, importState, inventoryNow, linkPlan, makeRecipePlan, repeatWeek, saveReview, setAbsence, setEquivalence, shoppingList, todayISO, updatePlan, upsertPerson, upsertRecipe, weekStart } from '../src/model.js';
import { loadState, saveState, STORAGE_KEY } from '../src/storage.js';

function setup() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const recipeId = upsertRecipe(state, { name: 'Plátano cocido', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 7, unit: 'unidad' }], covers: [], note: '' }).id;
  state.opening[platano] = 8;
  return { state, platano, recipeId };
}

test('de ocho plátanos quedan dos: consumió seis y el próximo menú de siete sugiere cinco', () => {
  const { state, platano, recipeId } = setup();
  // El modo normal pregunta lo que se puede mirar en la nevera —cuánto queda—
  // y deduce el consumo. Es la misma cuenta al revés, pero sin obligar a nadie
  // a restar de memoria.
  const review = createReview(state);
  assert.equal(review.mode, 'restante');
  saveReview(state, review.id, { [platano]: 2 }, true);
  assert.equal(review.consumed[platano], 6, 'de ocho quedan dos: se consumieron seis');
  assert.equal(inventoryNow(state)[platano], 2);
  const tomorrow = addDays(todayISO(), 1);
  makeRecipePlan(state, recipeId, tomorrow, 'desayuno');
  const list = shoppingList(state, tomorrow, tomorrow, 'menu');
  assert.equal(list.lines[0].purchaseQuantity, 5);
});

test('la preparación reservada se compra una sola vez y en la fecha de preparación', () => {
  const { state, platano, recipeId } = setup();
  state.opening[platano] = 0;
  const prep = '2026-09-15';
  const source = makeRecipePlan(state, recipeId, prep, 'cena');
  linkPlan(state, source.id, '2026-09-16', 'desayuno', { [source.items[0].id]: 2 });
  assert.equal(shoppingList(state, prep, prep, 'menu').lines[0].need, 7);
  assert.equal(shoppingList(state, '2026-09-16', '2026-09-16', 'menu').lines.length, 0);
  assert.equal(shoppingList(state, '2026-09-16', '2026-09-30', 'menu').lines.length, 0);
});

test('la compra sugerida no cambia las existencias y la confirmada sí', () => {
  const { state, platano, recipeId } = setup();
  makeRecipePlan(state, recipeId, todayISO(), 'cena');
  shoppingList(state, todayISO(), todayISO(), 'menu');
  assert.equal(inventoryNow(state)[platano], 8);
  addPurchase(state, { lines: [{ productId: platano, quantity: 3, unit: 'unidad' }] });
  assert.equal(inventoryNow(state)[platano], 11);
});

test('reconfirmar no duplica, corregir recalcula, la siguiente revisión parte del saldo nuevo', () => {
  const { state, platano } = setup();
  const first = createReview(state, todayISO(), 'consumido');
  saveReview(state, first.id, { [platano]: 6 }, true);
  assert.throws(() => saveReview(state, first.id, { [platano]: 6 }, true));
  assert.equal(inventoryNow(state)[platano], 2);
  correctReview(state, first.id, { [platano]: 5 });
  assert.equal(inventoryNow(state)[platano], 3);
  const next = createReview(state, addDays(todayISO(), 1), 'consumido');
  assert.equal(balances(state, { date: next.date, seq: next.seq }).values[platano], 3);
  saveReview(state, next.id, { [platano]: 1 }, true);
  assert.equal(balances(state).values[platano], 2);
});

test('vacío significa pendiente; cero explícito completa', () => {
  const { state, platano } = setup();
  const review = createReview(state, todayISO(), 'consumido');
  saveReview(state, review.id, { [platano]: '' }, false);
  assert.equal(review.status, 'draft');
  assert.equal(review.consumed[platano], undefined);
  assert.throws(() => saveReview(state, review.id, { [platano]: '' }, true), /pendientes/);
  saveReview(state, review.id, { [platano]: 0 }, true);
  assert.equal(review.status, 'confirmed');
  assert.equal(inventoryNow(state)[platano], 8);
});

test('unidades incompatibles quedan pendientes hasta configurar equivalencia; paquetes enteros', () => {
  const state = createEmptyState();
  const rice = addProduct(state, { name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb' }).id;
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete' }).id;
  assert.equal(convert(state, rice, 2, 'lb'), null);
  const recipe = upsertRecipe(state, { name: 'Comida', uses: ['cena'], items: [{ productId: rice, quantity: 2, unit: 'lb' }, { productId: salami, quantity: 17, unit: 'rueda' }], covers: [] });
  makeRecipePlan(state, recipe.id, todayISO(), 'cena');
  let list = shoppingList(state, todayISO(), todayISO(), 'menu');
  assert.ok(list.pending.some(item => item.productId === rice));
  assert.equal(list.lines.find(item => item.productId === salami).purchaseQuantity, null);
  setEquivalence(state, rice, 'lb', 2);
  setEquivalence(state, salami, 'paquete', 12);
  list = shoppingList(state, todayISO(), todayISO(), 'menu');
  assert.equal(list.lines.find(item => item.productId === rice).need, 4);
  assert.equal(list.lines.find(item => item.productId === salami).purchaseQuantity, 2);
  assert.equal(list.lines.find(item => item.productId === salami).acquiredControl, 24);
});

test('exportación, importación y recarga del almacenamiento local recuperan datos', () => {
  const { state, platano } = setup();
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  saveState(state, storage);
  assert.ok(memory.has(STORAGE_KEY));
  assert.deepEqual(loadState(storage), state);
  assert.deepEqual(importState(exportState(state)), state);
  assert.equal(loadState(storage).opening[platano], 8);
});

test('repetir semana conserva el vínculo y no duplica la necesidad en el día de servir', () => {
  const { state, platano, recipeId } = setup();
  state.opening[platano] = 0;
  const source = makeRecipePlan(state, recipeId, '2026-09-07', 'cena');
  linkPlan(state, source.id, '2026-09-08', 'desayuno', { [source.items[0].id]: 2 });
  const result = repeatWeek(state, weekStart('2026-09-07'), '2026-09');
  assert.ok(result.count >= 2);
  const repeated = state.plans.find(item => item.date === '2026-09-15' && item.slot === 'desayuno');
  assert.equal(repeated.kind, 'linked');
  assert.equal(shoppingList(state, '2026-09-14', '2026-09-14', 'menu').lines[0].need, 7);
  assert.equal(shoppingList(state, '2026-09-15', '2026-09-15', 'menu').lines.length, 0);
});

test('restricciones y ausencias evitan asignaciones automáticas incompatibles', () => {
  const { state, platano, recipeId } = setup();
  const child = upsertPerson(state, { name: 'Persona', restrictions: [platano], habitual: [] });
  const other = upsertPerson(state, { name: 'Otra persona', restrictions: [], habitual: [] });
  assert.throws(() => makeRecipePlan(state, recipeId, todayISO(), 'desayuno'), /incompatible/);
  setAbsence(state, todayISO(), 'desayuno', child.id, true);
  const plan = makeRecipePlan(state, recipeId, todayISO(), 'desayuno');
  assert.deepEqual(plan.participants, [other.id]);
});

test('una comida vinculada protege el alimento reservado ante cambios de cantidad o unidad', () => {
  const { state, recipeId } = setup();
  const source = makeRecipePlan(state, recipeId, todayISO(), 'cena');
  linkPlan(state, source.id, addDays(todayISO(), 1), 'desayuno', { [source.items[0].id]: 2 });
  const original = structuredClone(source.items[0]);
  assert.throws(() => updatePlan(state, source.id, { title: source.title, note: '', participants: [], items: [{ ...original, quantity: 1 }] }), /menor/);
  assert.throws(() => updatePlan(state, source.id, { title: source.title, note: '', participants: [], items: [{ ...original, unit: 'paquete' }] }), /vinculada/);
  assert.deepEqual(source.items[0], original);
});

test('un período de compra inválido se rechaza sin calcular una lista engañosa', () => {
  const { state } = setup();
  assert.throws(() => shoppingList(state, '2026-02-30', '2026-03-02'), /válido/);
  assert.throws(() => shoppingList(state, '2026-09-20', '2026-09-01'), /válido/);
});

test('un producto nuevo arranca con lo que ya hay en casa, no en cero', () => {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 7 }).id;
  const sal = addProduct(state, { name: 'Sal', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  assert.equal(inventoryNow(state)[platano], 7);
  assert.equal(inventoryNow(state)[sal], 0, 'sin cantidad declarada, arranca en cero');
  assert.throws(() => addProduct(state, { name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb', opening: -1 }));
});

test('el grosor solo se guarda en lo que de verdad se corta en ruedas', () => {
  const state = createEmptyState();
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete', slice: 'gruesa' });
  assert.equal(salami.slice, 'gruesa');
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', slice: 'fina' });
  assert.equal(arroz.slice, null, 'una libra de arroz no tiene grosor de rueda');
  const queso = addProduct(state, { name: 'Queso', controlUnit: 'rebanada', purchaseUnit: 'rebanada' });
  assert.equal(queso.slice, null, 'sin declararlo queda vacío, no se inventa un grosor');
  // Un valor que no está en la lista se descarta en vez de guardarse tal cual.
  assert.equal(setSlice(state, salami.id, 'finisima'), null);
  assert.equal(setSlice(state, salami.id, 'media'), 'media');
  assert.throws(() => setSlice(state, 'producto-inexistente', 'fina'), /producto/);
});

test('un respaldo anterior al grosor sigue siendo válido', () => {
  const state = createEmptyState();
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'rueda', opening: 4 }).id;
  const old = JSON.parse(exportState(state));
  delete old.products[0].slice;
  const restored = importState(JSON.stringify(old));
  assert.equal(restored.products[0].slice, undefined);
  assert.equal(inventoryNow(restored)[salami], 4, 'las existencias se leen igual sin el campo nuevo');
});

test('la canasta habitual se escribe por mes y se pide por la parte del período que toca', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 4 }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }]);
  // Septiembre tiene 30 días: una quincena de 15 pide la mitad de la canasta.
  const quincena = shoppingList(state, '2026-09-01', '2026-09-15', 'casa');
  const linea = quincena.lines.find(line => line.productId === arroz);
  assert.equal(linea.need, 15);
  assert.equal(linea.available, 4);
  assert.equal(linea.shortfall, 11);
  assert.deepEqual(quincena.missing, [], 'comprando por canasta no se reprochan las comidas sin planificar');
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-30', 'casa').lines[0].need, 30, 'el mes entero pide la canasta completa');
  // Las dos bases son excluyentes: el menú no suma la canasta.
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-15', 'menu').lines.length, 0);
  assert.equal(inventoryNow(state)[arroz], 4, 'escribir la canasta no mueve existencias');
  assert.throws(() => setHabitualBasket(state, [{ productId: 'producto-inventado', quantity: 1, unit: 'lb' }]), /alimento/);
  assert.equal(state.habitualBasket.lines.length, 1, 'una canasta rechazada deja la anterior intacta');
});

test('la canasta crea los alimentos que no existen, sin registrarlos aparte', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [
    { name: '  arroz ', quantity: 30, unit: 'lb' },
    { name: 'Huevo', quantity: 60, unit: 'unidad' },
    { name: 'huevos', quantity: 12, unit: 'unidad' }
  ]);
  const lineas = state.habitualBasket.lines;
  assert.equal(state.products.length, 2, 'solo se crea el huevo, y una sola vez');
  assert.equal(lineas[0].productId, arroz, 'un nombre que ya existe no duplica el alimento');
  assert.equal(lineas[1].productId, lineas[2].productId, 'singular y plural son el mismo alimento');
  const huevo = product(state, lineas[1].productId);
  assert.equal(huevo.name, 'Huevo');
  assert.equal(huevo.controlUnit, 'unidad', 'toma la unidad de su propia línea');
  assert.equal(huevo.origin, 'canasta', 'queda escrito de dónde salió');
  assert.equal(inventoryNow(state)[huevo.id], 0, 'nace sin existencias: la canasta dice qué se consume, no qué hay');
  // Una línea mal escrita no puede dejar media canasta registrada.
  assert.throws(() => setHabitualBasket(state, [{ name: 'Sal', quantity: 2, unit: 'lb' }, { name: 'Aceite', quantity: 2, unit: 'inventada' }]), /unidad/);
  assert.equal(state.products.length, 2, 'no se creó nada a medias');
  assert.equal(state.habitualBasket.lines.length, 3, 'la canasta anterior queda intacta');
});

test('la canasta y la ficha del producto escriben la misma línea', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, arroz, 30, 'lb');
  assert.equal(state.habitualBasket.lines.length, 1);
  const id = state.habitualBasket.lines[0].id;
  // Volver a escribirlo corrige la línea que ya existe, no añade otra.
  setHabitualLine(state, arroz, 25, 'lb');
  assert.equal(state.habitualBasket.lines.length, 1);
  assert.equal(state.habitualBasket.lines[0].quantity, 25);
  assert.equal(state.habitualBasket.lines[0].id, id, 'conserva su identidad al corregirla');
  // Y lo escrito en la ficha es lo que lee la compra por canasta.
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-30', 'casa').lines[0].need, 25);
  // Vacío o cero la quita: un consumo de cero no significa nada.
  setHabitualLine(state, arroz, '', 'lb');
  assert.equal(state.habitualBasket.lines.length, 0);
  setHabitualLine(state, arroz, 10, 'lb');
  setHabitualLine(state, arroz, 0, 'lb');
  assert.equal(state.habitualBasket.lines.length, 0);
  assert.throws(() => setHabitualLine(state, 'producto-inventado', 5, 'lb'), /producto/);
});

test('una cantidad que todavía no se sabe se guarda pendiente en vez de perder el alimento', () => {
  const state = createEmptyState();
  setHabitualBasket(state, [
    { name: 'Arroz', quantity: 30, unit: 'lb' },
    { name: 'Detergente', quantity: '', unit: 'paquete' }
  ]);
  assert.equal(state.habitualBasket.lines.length, 2, 'el alimento sin cantidad se conserva');
  assert.equal(state.habitualBasket.lines[1].quantity, null);
  const lista = shoppingList(state, '2026-09-01', '2026-09-30', 'casa');
  assert.equal(lista.lines.length, 1, 'una línea sin cantidad no se puede calcular…');
  assert.ok(lista.pending.some(item => item.reason === 'cantidad'), '…pero se avisa de que está pendiente');
});
