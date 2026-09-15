import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProduct, addPurchase, basketLines, baseLines, createEmptyState, inventoryNow, monthBasket,
  monthDiff, openMonthBasket, periodMonths, promoteToBase, removeMonthBasketLine, setBaseBasket,
  setBaseBasketLine, setMonthBasketLine, shoppingList
} from '../src/model.js';

function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const atun = addProduct(state, { name: 'Atún', controlUnit: 'lata', purchaseUnit: 'lata' }).id;
  const pollo = addProduct(state, { name: 'Pollo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setBaseBasket(state, [
    { productId: arroz, quantity: 30, unit: 'lb', priority: 'obligatorio' },
    { productId: atun, quantity: 8, unit: 'lata', priority: 'ocasional' }
  ]);
  return { state, arroz, atun, pollo };
}

test('crear octubre copia la canasta base tal como está ese día', () => {
  const { state, arroz } = casa();
  const octubre = openMonthBasket(state, '2026-10');
  assert.equal(octubre.lines.length, 2);
  assert.equal(octubre.lines.find(line => line.productId === arroz).quantity, 30);
  // Copia, no referencia: son dos listas con vidas separadas a partir de aquí.
  assert.notEqual(octubre.lines[0].id, baseLines(state)[0].id, 'cada línea del mes tiene su propia identidad');
  setMonthBasketLine(state, '2026-10', arroz, 45, 'lb');
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 30, 'la base no se movió');
});

test('quitar el atún de octubre no lo quita de la canasta base ni de noviembre', () => {
  const { state, atun } = casa();
  openMonthBasket(state, '2026-10');
  assert.equal(removeMonthBasketLine(state, '2026-10', atun), true);
  assert.equal(basketLines(state, '2026-10').some(line => line.productId === atun), false);
  assert.equal(baseLines(state).some(line => line.productId === atun), true, 'sigue siendo parte del hábito');
  openMonthBasket(state, '2026-11');
  assert.equal(basketLines(state, '2026-11').some(line => line.productId === atun), true, 'noviembre nace de la base, no de octubre');
});

test('un producto extraordinario de septiembre no aparece en octubre ni en la base', () => {
  const { state, pollo } = casa();
  setMonthBasketLine(state, '2026-09', pollo, 4, 'lb');
  assert.equal(basketLines(state, '2026-09').length, 3);
  assert.equal(baseLines(state).length, 2, 'la base sigue con dos');
  openMonthBasket(state, '2026-10');
  assert.equal(basketLines(state, '2026-10').length, 2, 'octubre salió de la base, no de septiembre');
});

test('aplicar un cambio a la base sí afecta a los meses que se abran después', () => {
  const { state, pollo, arroz } = casa();
  setMonthBasketLine(state, '2026-09', pollo, 4, 'lb');
  setMonthBasketLine(state, '2026-09', arroz, 45, 'lb');
  assert.equal(promoteToBase(state, '2026-09', [pollo, arroz]), 2);
  assert.equal(baseLines(state).length, 3);
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 45);
  openMonthBasket(state, '2026-12');
  assert.equal(basketLines(state, '2026-12').length, 3, 'diciembre ya nace con el cambio');
  assert.throws(() => promoteToBase(state, '2026-09', []), /Selecciona/);
});

test('las canastas de meses anteriores conservan su estado cuando la base cambia', () => {
  const { state, arroz } = casa();
  openMonthBasket(state, '2026-08');
  setMonthBasketLine(state, '2026-08', arroz, 20, 'lb');
  setBaseBasketLine(state, arroz, 50, 'lb');
  assert.equal(basketLines(state, '2026-08').find(line => line.productId === arroz).quantity, 20, 'agosto ya cerró: no se reescribe');
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 50);
});

test('la comparación con la base dice exactamente en qué se aparta el mes', () => {
  const { state, arroz, atun, pollo } = casa();
  openMonthBasket(state, '2026-09');
  setMonthBasketLine(state, '2026-09', arroz, 45, 'lb');
  setMonthBasketLine(state, '2026-09', pollo, 4, 'lb');
  removeMonthBasketLine(state, '2026-09', atun);
  const diff = monthDiff(state, '2026-09');
  assert.deepEqual(diff.added.map(line => line.productId), [pollo]);
  assert.deepEqual(diff.removed.map(line => line.productId), [atun]);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].base.quantity, 30);
  assert.equal(diff.changed[0].line.quantity, 45);
  assert.equal(monthDiff(state, '2026-12').open, false, 'un mes que no se ha abierto no tiene diferencias que enseñar');
});

test('un mes sin abrir se calcula con la canasta base: la casa come igual', () => {
  const { state } = casa();
  assert.equal(monthBasket(state, '2026-11'), null);
  assert.equal(basketLines(state, '2026-11').length, 2);
});

test('un período entre dos meses se prorratea con los días de cada mes, no con los del primero', () => {
  const { state, arroz } = casa();
  // Del 28 de septiembre al 12 de octubre: 3 días de septiembre (de 30) y 12 de
  // octubre (de 31). Con la cuenta vieja —15 días sobre los 30 de septiembre—
  // salía media canasta, que no significaba nada.
  const tramos = periodMonths('2026-09-28', '2026-10-12');
  assert.equal(tramos.length, 2);
  assert.deepEqual(tramos.map(item => [item.month, item.days, item.monthDays]), [['2026-09', 3, 30], ['2026-10', 12, 31]]);
  const lista = shoppingList(state, '2026-09-28', '2026-10-12', 'base');
  const esperado = Math.round((30 * (3 / 30) + 30 * (12 / 31)) * 1000) / 1000;
  assert.equal(lista.lines.find(line => line.productId === arroz).need, esperado);
  assert.notEqual(lista.lines.find(line => line.productId === arroz).need, 15, 'ya no es media canasta de septiembre');
});

test('cada tramo se cobra contra la canasta de su propio mes', () => {
  const { state, arroz } = casa();
  setMonthBasketLine(state, '2026-09', arroz, 30, 'lb');
  setMonthBasketLine(state, '2026-10', arroz, 62, 'lb');
  const lista = shoppingList(state, '2026-09-28', '2026-10-12', 'mensual');
  const esperado = Math.round((30 * (3 / 30) + 62 * (12 / 31)) * 1000) / 1000;
  assert.equal(lista.lines.find(line => line.productId === arroz).need, esperado);
  // Y con la base fija, el mismo período pide otra cosa: son bases distintas.
  assert.notEqual(shoppingList(state, '2026-09-28', '2026-10-12', 'base').lines.find(line => line.productId === arroz).need, esperado);
});

test('cambiar de base devuelve otra lista, nunca la anterior', () => {
  const { state, arroz } = casa();
  const porCanasta = shoppingList(state, '2026-09-01', '2026-09-30', 'base');
  const porMenu = shoppingList(state, '2026-09-01', '2026-09-30', 'menu');
  assert.equal(porCanasta.basis, 'base');
  assert.equal(porMenu.basis, 'menu');
  assert.equal(porCanasta.lines.length, 2);
  assert.equal(porMenu.lines.length, 0, 'sin menú planificado no hay nada que comprar por menú');
  assert.ok(porMenu.missing.length > 0, 'el menú sí avisa de las comidas sin decidir');
  assert.equal(shoppingList(state, '2026-09-01', '2026-09-30', 'basket').basis, 'mensual', 'el nombre viejo sigue entendiéndose');
  assert.equal(porCanasta.lines.find(line => line.productId === arroz).need, 30);
});

test('la canasta nunca mueve existencias: solo la compra confirmada', () => {
  const { state, arroz } = casa();
  setMonthBasketLine(state, '2026-09', arroz, 100, 'lb');
  shoppingList(state, '2026-09-01', '2026-09-30', 'mensual');
  assert.equal(inventoryNow(state)[arroz], 0);
  addPurchase(state, { date: '2026-09-02', lines: [{ productId: arroz, quantity: 10, unit: 'lb' }], basis: 'mensual' });
  assert.equal(inventoryNow(state)[arroz], 10);
  assert.equal(state.purchases[0].basis, 'mensual', 'queda escrito con qué base se calculó');
});
