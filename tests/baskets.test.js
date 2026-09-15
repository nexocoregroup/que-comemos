import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addProduct, addPurchase, correctReview, createEmptyState, createReview, effectiveBasket,
  habitualLines, inventoryNow, makeRecipePlan, monthBasketSummary, monthBounds, monthChanges,
  monthExtras, openMonthChanges, periodMonths, promoteToHabitual, removeHabitualLine,
  removeMonthChange, saveReview, setHabitualBasket, setHabitualLine, setMonthChange, shoppingList,
  todayISO, upsertRecipe
} from '../src/model.js';

function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const atun = addProduct(state, { name: 'Atún', controlUnit: 'lata', purchaseUnit: 'lata' }).id;
  const pollo = addProduct(state, { name: 'Pollo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [
    { productId: arroz, quantity: 30, unit: 'lb', priority: 'obligatorio' },
    { productId: atun, quantity: 8, unit: 'lata', priority: 'ocasional' }
  ]);
  return { state, arroz, atun, pollo };
}

const cantidad = (basket, productId) => basket.find(line => line.productId === productId)?.quantity;
const origen = (basket, productId) => basket.find(line => line.productId === productId)?.source;

/* ── La canasta habitual ───────────────────────────────────────────────── */

test('la canasta se escribe una vez y vale para todos los meses', () => {
  const { state, arroz, atun } = casa();
  assert.equal(habitualLines(state).length, 2);
  // Ningún mes hace falta abrirlo para saber qué se come en él.
  assert.deepEqual(state.monthOverrides, {});
  for (const mes of ['2026-10', '2026-11', '2027-03']) {
    assert.equal(effectiveBasket(state, mes).length, 2, `${mes} sale de la costumbre`);
    assert.equal(cantidad(effectiveBasket(state, mes), arroz), 30);
    assert.equal(origen(effectiveBasket(state, mes), atun), 'habitual');
  }
});

test('añadir un alimento a la canasta habitual lo pone en todos los meses', () => {
  const { state, pollo } = casa();
  setHabitualLine(state, pollo, 6, 'lb', 'frecuente');
  assert.equal(habitualLines(state).length, 3);
  assert.equal(cantidad(effectiveBasket(state, '2026-10'), pollo), 6);
  assert.equal(cantidad(effectiveBasket(state, '2027-01'), pollo), 6);
  // Volver a escribirlo corrige la línea que ya existe, no añade otra.
  const id = habitualLines(state).find(line => line.productId === pollo).id;
  setHabitualLine(state, pollo, 9, 'lb');
  assert.equal(habitualLines(state).length, 3, 'sigue habiendo una sola línea de pollo');
  assert.equal(habitualLines(state).find(line => line.productId === pollo).id, id, 'conserva su identidad');
  assert.equal(habitualLines(state).find(line => line.productId === pollo).priority, 'frecuente', 'y su prioridad');
  // Vacío o cero la quita: un consumo de cero no significa nada.
  setHabitualLine(state, pollo, '', 'lb');
  assert.equal(habitualLines(state).length, 2);
  assert.throws(() => setHabitualLine(state, 'producto-inventado', 5, 'lb'), /producto/);
});

test('quitar un alimento de la canasta habitual lo quita de la costumbre, no del historial', () => {
  const { state, atun } = casa();
  assert.equal(removeHabitualLine(state, atun), true);
  assert.equal(removeHabitualLine(state, atun), false, 'quitar lo que ya no está no cambia nada');
  assert.equal(effectiveBasket(state, '2026-10').some(line => line.productId === atun), false);
  assert.ok(state.products.some(item => item.id === atun), 'el alimento sigue existiendo');
});

/* ── Los cambios de un mes ─────────────────────────────────────────────── */

test('añadir un alimento solo para octubre no lo mete en la canasta habitual', () => {
  const { state, pollo } = casa();
  const cambio = setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  assert.equal(cambio.extra, true, 'no está en la habitual: es un extra del mes');
  assert.equal(habitualLines(state).length, 2, 'la costumbre no se movió');
  const octubre = effectiveBasket(state, '2026-10');
  assert.equal(octubre.length, 3);
  assert.equal(origen(octubre, pollo), 'extra');
  assert.equal(cantidad(octubre, pollo), 4);
  assert.deepEqual(monthExtras(state, '2026-10').map(item => item.productId), [pollo]);
});

test('cambiar la cantidad de octubre no cambia la de ningún otro mes', () => {
  const { state, arroz } = casa();
  setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  const octubre = effectiveBasket(state, '2026-10');
  assert.equal(cantidad(octubre, arroz), 45);
  assert.equal(origen(octubre, arroz), 'cambio');
  assert.equal(habitualLines(state).find(line => line.productId === arroz).quantity, 30, 'el hábito sigue en 30');
  assert.equal(cantidad(effectiveBasket(state, '2026-11'), arroz), 30, 'noviembre no se enteró');
  assert.equal(cantidad(effectiveBasket(state, '2026-09'), arroz), 30, 'septiembre tampoco');
});

test('un cambio de octubre no aparece en noviembre', () => {
  const { state, arroz, atun, pollo } = casa();
  setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  setMonthChange(state, '2026-10', atun, { removed: true });
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  const noviembre = effectiveBasket(state, '2026-11');
  assert.equal(noviembre.length, 2, 'noviembre es la canasta de siempre, entera');
  assert.equal(cantidad(noviembre, arroz), 30);
  assert.ok(noviembre.every(line => line.source === 'habitual'));
  assert.equal(noviembre.some(line => line.productId === pollo), false, 'el extra de octubre se quedó en octubre');
  assert.deepEqual(Object.keys(state.monthOverrides), ['2026-10'], 'solo octubre guarda excepciones');
  assert.deepEqual(monthChanges(state, '2026-11').changes, [], 'noviembre no tiene ninguna');
});

test('quitar un alimento solo este mes lo devuelve solo el mes siguiente', () => {
  const { state, atun } = casa();
  setMonthChange(state, '2026-10', atun, { removed: true });
  assert.equal(effectiveBasket(state, '2026-10').some(line => line.productId === atun), false, 'este mes no se compra');
  assert.ok(habitualLines(state).some(line => line.productId === atun), 'pero sigue siendo parte del hábito');
  assert.ok(effectiveBasket(state, '2026-11').some(line => line.productId === atun), 'y vuelve solo en noviembre');
  // Y se puede arrepentir: el mes vuelve a lo habitual sin escribir nada.
  assert.equal(removeMonthChange(state, '2026-10', atun), true);
  assert.equal(cantidad(effectiveBasket(state, '2026-10'), atun), 8);
  assert.equal(removeMonthChange(state, '2026-10', atun), false, 'quitar un cambio que ya no está no inventa nada');
});

test('volver a cambiar el mismo alimento corrige su cambio en vez de duplicarlo', () => {
  const { state, arroz, pollo } = casa();
  const primero = setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  const segundo = setMonthChange(state, '2026-10', arroz, { quantity: 50, unit: 'lb' });
  assert.equal(segundo.id, primero.id, 'es el mismo cambio corregido');
  assert.equal(monthChanges(state, '2026-10').changes.length, 1);
  assert.equal(cantidad(effectiveBasket(state, '2026-10'), arroz), 50);
  // Tampoco se duplica el alimento en la canasta que sale de ahí.
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  setMonthChange(state, '2026-10', pollo, { quantity: 6, unit: 'lb' });
  const octubre = effectiveBasket(state, '2026-10');
  assert.equal(octubre.filter(line => line.productId === pollo).length, 1);
  assert.equal(octubre.length, 3, 'dos habituales y un extra, ni uno más');
  assert.equal(monthChanges(state, '2026-10').changes.length, 2);
});

test('preguntar por un mes no lo abre; escribir en él sí', () => {
  const { state, arroz } = casa();
  monthChanges(state, '2026-11');
  effectiveBasket(state, '2026-11');
  monthBasketSummary(state, '2026-11');
  assert.deepEqual(state.monthOverrides, {}, 'mirar no deja huella');
  openMonthChanges(state, '2026-11');
  assert.deepEqual(Object.keys(state.monthOverrides), ['2026-11']);
  assert.deepEqual(state.monthOverrides['2026-11'].changes, []);
  setMonthChange(state, '2026-11', arroz, { quantity: 40, unit: 'lb' });
  assert.equal(state.monthOverrides['2026-11'].changes.length, 1);
  assert.throws(() => monthChanges(state, '2026-13'), /mes válido/);
});

test('un extra de octubre se convierte en costumbre y deja de ser excepción', () => {
  const { state, arroz, pollo } = casa();
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb', priority: 'frecuente' });
  setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  assert.equal(promoteToHabitual(state, '2026-10', [pollo, arroz]), 2);
  assert.equal(habitualLines(state).length, 3);
  assert.equal(habitualLines(state).find(line => line.productId === pollo).quantity, 4);
  assert.equal(habitualLines(state).find(line => line.productId === arroz).quantity, 45);
  // Ya es la norma: deja de contarse como excepción de octubre.
  assert.deepEqual(monthChanges(state, '2026-10').changes, []);
  assert.ok(effectiveBasket(state, '2026-10').every(line => line.source === 'habitual'));
  assert.equal(cantidad(effectiveBasket(state, '2026-12'), pollo), 4, 'diciembre ya nace con el cambio');
});

test('ascender un alimento quitado lo da de baja del hábito y no toca otros meses', () => {
  const { state, atun, arroz } = casa();
  setMonthChange(state, '2026-09', arroz, { quantity: 20, unit: 'lb' });
  setMonthChange(state, '2026-10', atun, { removed: true });
  assert.equal(promoteToHabitual(state, '2026-10', [atun]), 1);
  assert.equal(habitualLines(state).some(line => line.productId === atun), false, 'ya no se compra nunca');
  assert.equal(effectiveBasket(state, '2026-11').some(line => line.productId === atun), false);
  assert.equal(cantidad(effectiveBasket(state, '2026-09'), arroz), 20, 'septiembre conserva su propia excepción');
  assert.throws(() => promoteToHabitual(state, '2026-10', []), /Selecciona/);
  assert.throws(() => promoteToHabitual(state, '2026-12', [atun]), /no tiene cambios/);
});

test('el resumen del mes cuenta habituales, cambiados, quitados y extras por separado', () => {
  const { state, arroz, atun, pollo } = casa();
  const sal = addProduct(state, { name: 'Sal', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, sal, 2, 'lb');
  setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  setMonthChange(state, '2026-10', atun, { removed: true });
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  assert.deepEqual(monthBasketSummary(state, '2026-10'), { habituales: 1, cambiados: 1, quitados: 1, extras: 1 });
  assert.deepEqual(monthBasketSummary(state, '2026-11'), { habituales: 3, cambiados: 0, quitados: 0, extras: 0 });
});

/* ── La compra ─────────────────────────────────────────────────────────── */

test('la compra por canasta pide lo del mes y descuenta lo que ya hay en casa', () => {
  const { state, arroz, atun } = casa();
  state.opening[arroz] = 4;
  const mes = shoppingList(state, '2026-10-01', '2026-10-31', 'casa');
  assert.equal(mes.basis, 'casa', 'es la base por omisión y la recomendada');
  assert.equal(shoppingList(state, '2026-10-01', '2026-10-31').basis, 'casa');
  const linea = mes.lines.find(line => line.productId === arroz);
  assert.equal(linea.need, 30, 'el mes entero pide la canasta completa');
  assert.equal(linea.available, 4);
  assert.equal(linea.shortfall, 26, 'no se compra lo que ya está en la despensa');
  assert.equal(mes.lines.find(line => line.productId === atun).shortfall, 8);
  // Media quincena de un mes de 31 días pide la parte que le toca.
  const quincena = shoppingList(state, '2026-10-01', '2026-10-15', 'casa');
  assert.equal(quincena.lines.find(line => line.productId === arroz).need, Math.round(30 * (15 / 31) * 1000) / 1000);
  assert.deepEqual(mes.missing, [], 'comprando por canasta no se reprochan las comidas sin planificar');
});

test('la compra de octubre aplica los cambios de octubre y la de noviembre no', () => {
  const { state, arroz, atun, pollo } = casa();
  setMonthChange(state, '2026-10', arroz, { quantity: 62, unit: 'lb' });
  setMonthChange(state, '2026-10', atun, { removed: true });
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  const octubre = shoppingList(state, '2026-10-01', '2026-10-31', 'casa');
  assert.equal(octubre.lines.find(line => line.productId === arroz).need, 62);
  assert.equal(octubre.lines.some(line => line.productId === atun), false, 'este mes no se compra atún');
  assert.equal(octubre.lines.find(line => line.productId === pollo).need, 4);
  const noviembre = shoppingList(state, '2026-11-01', '2026-11-30', 'casa');
  assert.equal(noviembre.lines.find(line => line.productId === arroz).need, 30);
  assert.equal(noviembre.lines.find(line => line.productId === atun).need, 8);
  assert.equal(noviembre.lines.some(line => line.productId === pollo), false);
});

test('un período entre dos meses cobra cada tramo contra la canasta de su propio mes', () => {
  const { state, arroz } = casa();
  setMonthChange(state, '2026-10', arroz, { quantity: 62, unit: 'lb' });
  // Del 28 de septiembre al 12 de octubre: 3 días de septiembre (de 30) y 12 de
  // octubre (de 31). Con la cuenta vieja —15 días sobre los 30 de septiembre—
  // salía media canasta, que no significaba nada.
  const tramos = periodMonths('2026-09-28', '2026-10-12');
  assert.deepEqual(tramos.map(item => [item.month, item.days, item.monthDays]), [['2026-09', 3, 30], ['2026-10', 12, 31]]);
  const lista = shoppingList(state, '2026-09-28', '2026-10-12', 'casa');
  const esperado = Math.round((30 * (3 / 30) + 62 * (12 / 31)) * 1000) / 1000;
  assert.equal(lista.lines.find(line => line.productId === arroz).need, esperado);
  assert.notEqual(lista.lines.find(line => line.productId === arroz).need, 15, 'ya no es media canasta de septiembre');
});

test('el menú y la canasta nunca se suman: son dos formas de pedir lo mismo', () => {
  const { state, arroz } = casa();
  const receta = upsertRecipe(state, { name: 'Arroz blanco', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], covers: [] }).id;
  makeRecipePlan(state, receta, '2026-10-05', 'almuerzo');
  const porCanasta = shoppingList(state, '2026-10-01', '2026-10-31', 'casa');
  const porMenu = shoppingList(state, '2026-10-01', '2026-10-31', 'menu');
  assert.equal(porCanasta.lines.find(line => line.productId === arroz).need, 30, 'la canasta no suma el arroz del menú');
  assert.equal(porMenu.lines.find(line => line.productId === arroz).need, 2, 'el menú no suma la canasta');
  assert.notEqual(porCanasta.basis, porMenu.basis);
  assert.ok(porMenu.missing.length > 0, 'el menú sí avisa de las comidas sin decidir');
});

test('confirmar la compra es lo único que mueve las existencias', () => {
  const { state, arroz } = casa();
  // Las existencias son las de hoy: una compra con fecha futura todavía no está
  // en la despensa, así que estas cuentas se hacen sobre el mes corriente.
  const mes = todayISO().slice(0, 7);
  const { start, end } = monthBounds(mes);
  shoppingList(state, start, end, 'casa');
  assert.equal(inventoryNow(state)[arroz], 0, 'calcular una lista no compra nada');
  addPurchase(state, { date: todayISO(), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }], basis: 'casa' });
  assert.equal(inventoryNow(state)[arroz], 10);
  assert.equal(state.purchases[0].basis, 'casa', 'queda escrito con qué base se calculó');
  const despues = shoppingList(state, start, end, 'casa');
  assert.equal(despues.lines.find(line => line.productId === arroz).shortfall, 20, 'y la siguiente lista ya lo descuenta');
});

test('la revisión pregunta cuánto queda, y corregirla rehace la cuenta', () => {
  const { state, arroz } = casa();
  addPurchase(state, { date: addDays(todayISO(), -10), lines: [{ productId: arroz, quantity: 30, unit: 'lb' }] });
  const revision = createReview(state, todayISO());
  assert.equal(revision.mode, 'restante', 'mirar la despensa es más fácil que restar de memoria');
  saveReview(state, revision.id, { [arroz]: 12 }, true);
  assert.equal(revision.consumed[arroz], 18, 'de 30 quedan 12: se gastaron 18');
  assert.equal(inventoryNow(state)[arroz], 12);
  // Decir que queda más de lo que la app tiene contado no se traga en silencio.
  assert.throws(() => correctReview(state, revision.id, { [arroz]: 45 }), /más/);
  correctReview(state, revision.id, { [arroz]: 10 });
  assert.equal(inventoryNow(state)[arroz], 10);
  assert.equal(state.reviews[0].consumed[arroz], 20);
});
