import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addProduct, setSlice, setBasket, addPurchase, balances, convert, correctReview, createEmptyState, createReview, exportState, importState, inventoryNow, linkPlan, makeRecipePlan, repeatWeek, saveReview, setAbsence, setEquivalence, shoppingList, todayISO, updatePlan, upsertPerson, upsertRecipe, weekStart } from '../src/model.js';
import { loadState, saveState, STORAGE_KEY } from '../src/storage.js';

function setup() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const recipeId = upsertRecipe(state, { name: 'Plátano cocido', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 7, unit: 'unidad' }], covers: [], note: '' }).id;
  state.opening[platano] = 8;
  return { state, platano, recipeId };
}

test('ocho plátanos menos seis deja dos; el próximo menú de siete sugiere cinco', () => {
  const { state, platano, recipeId } = setup();
  const review = createReview(state);
  saveReview(state, review.id, { [platano]: 6 }, true);
  assert.equal(inventoryNow(state)[platano], 2);
  const tomorrow = addDays(todayISO(), 1);
  makeRecipePlan(state, recipeId, tomorrow, 'desayuno');
  const list = shoppingList(state, tomorrow, tomorrow);
  assert.equal(list.lines[0].purchaseQuantity, 5);
});

test('la preparación reservada se compra una sola vez y en la fecha de preparación', () => {
  const { state, platano, recipeId } = setup();
  state.opening[platano] = 0;
  const prep = '2026-09-15';
  const source = makeRecipePlan(state, recipeId, prep, 'cena');
  linkPlan(state, source.id, '2026-09-16', 'desayuno', { [source.items[0].id]: 2 });
  assert.equal(shoppingList(state, prep, prep).lines[0].need, 7);
  assert.equal(shoppingList(state, '2026-09-16', '2026-09-16').lines.length, 0);
  assert.equal(shoppingList(state, '2026-09-16', '2026-09-30').lines.length, 0);
});

test('la compra sugerida no cambia las existencias y la confirmada sí', () => {
  const { state, platano, recipeId } = setup();
  makeRecipePlan(state, recipeId, todayISO(), 'cena');
  shoppingList(state, todayISO(), todayISO());
  assert.equal(inventoryNow(state)[platano], 8);
  addPurchase(state, { lines: [{ productId: platano, quantity: 3, unit: 'unidad' }] });
  assert.equal(inventoryNow(state)[platano], 11);
});

test('reconfirmar no duplica, corregir recalcula, la siguiente revisión parte del saldo nuevo', () => {
  const { state, platano } = setup();
  const first = createReview(state);
  saveReview(state, first.id, { [platano]: 6 }, true);
  assert.throws(() => saveReview(state, first.id, { [platano]: 6 }, true));
  assert.equal(inventoryNow(state)[platano], 2);
  correctReview(state, first.id, { [platano]: 5 });
  assert.equal(inventoryNow(state)[platano], 3);
  const next = createReview(state, addDays(todayISO(), 1));
  assert.equal(balances(state, { date: next.date, seq: next.seq }).values[platano], 3);
  saveReview(state, next.id, { [platano]: 1 }, true);
  assert.equal(balances(state).values[platano], 2);
});

test('vacío significa pendiente; cero explícito completa', () => {
  const { state, platano } = setup();
  const review = createReview(state);
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
  let list = shoppingList(state, todayISO(), todayISO());
  assert.ok(list.pending.some(item => item.productId === rice));
  assert.equal(list.lines.find(item => item.productId === salami).purchaseQuantity, null);
  setEquivalence(state, rice, 'lb', 2);
  setEquivalence(state, salami, 'paquete', 12);
  list = shoppingList(state, todayISO(), todayISO());
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
  assert.equal(shoppingList(state, '2026-09-14', '2026-09-14').lines[0].need, 7);
  assert.equal(shoppingList(state, '2026-09-15', '2026-09-15').lines.length, 0);
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

test('la canasta se escribe por mes y se pide por la parte del período que toca', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 4 }).id;
  setBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }]);
  // Septiembre tiene 30 días: una quincena de 15 pide la mitad de la canasta.
  const quincena = shoppingList(state, '2026-09-01', '2026-09-15', 'basket');
  const linea = quincena.lines.find(line => line.productId === arroz);
  assert.equal(linea.need, 15);
  assert.equal(linea.available, 4);
  assert.equal(linea.shortfall, 11);
  assert.deepEqual(quincena.missing, [], 'comprando por canasta no se reprochan las comidas sin planificar');
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-30', 'basket').lines[0].need, 30, 'el mes entero pide la canasta completa');
  // Las dos bases son excluyentes: el menú por defecto no suma la canasta.
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-15').lines.length, 0);
  assert.equal(inventoryNow(state)[arroz], 4, 'escribir la canasta no mueve existencias');
  assert.throws(() => setBasket(state, [{ productId: 'producto-inventado', quantity: 1, unit: 'lb' }]), /alimento/);
  assert.throws(() => setBasket(state, [{ productId: arroz, quantity: 0, unit: 'lb' }]), /mayor que cero/);
  assert.equal(state.basket.length, 1, 'una canasta rechazada deja la anterior intacta');
});

test('un respaldo anterior a la canasta se rellena en vez de rechazarse', () => {
  const state = createEmptyState();
  addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 2 });
  const viejo = JSON.parse(exportState(state));
  delete viejo.basket;
  assert.deepEqual(importState(JSON.stringify(viejo)).basket, []);
  // Lo que existía desde la primera versión sigue siendo obligatorio.
  const roto = JSON.parse(exportState(state));
  delete roto.purchases;
  assert.throws(() => importState(JSON.stringify(roto)), /no es un respaldo válido/);
});
