import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_NAMES, describeAction, runActions, toolSchemas, undoTo, validateAction } from '../src/assistant.js';
import { addProduct, baseLines, createEmptyState, inventoryNow, setBaseBasket, todayISO, upsertPerson } from '../src/model.js';

function casa() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 8, category: 'viveres' }).id;
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 5, category: 'granos' }).id;
  const atun = addProduct(state, { name: 'Atún', controlUnit: 'lata', purchaseUnit: 'lata', opening: 2, category: 'mar' }).id;
  setBaseBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }, { productId: atun, quantity: 8, unit: 'lata' }]);
  upsertPerson(state, { name: 'Sofía', restrictions: [], habitual: [] });
  return { state, platano, arroz, atun };
}
const pedir = (state, action, args, opciones) => runActions(state, [{ action, arguments: args }], opciones);

test('una acción que no está en la lista blanca no existe, por convincente que suene', () => {
  const { state } = casa();
  const result = pedir(state, 'borrar_todo', {});
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /no es una acción/);
  // Tampoco se puede colar por otro camino: la validación es la misma puerta.
  assert.equal(validateAction(state, 'eval', { codigo: '1' }).ok, false);
  assert.equal(ACTION_NAMES.includes('eval'), false);
  assert.equal(toolSchemas().length, ACTION_NAMES.length, 'lo que se le describe al modelo es la misma tabla que valida');
});

test('no se confía en un identificador inventado: se resuelve contra lo que existe', () => {
  const { state, arroz } = casa();
  const inventado = pedir(state, 'agregar_a_base', { producto: 'producto-999', cantidad: 5, unidad: 'lb' });
  assert.equal(inventado.ok, false);
  assert.match(inventado.errors[0], /No encuentro/);
  // Por nombre sí, aunque venga escrito de otra forma.
  const porNombre = pedir(state, 'agregar_a_base', { producto: 'arroz', cantidad: 45, unidad: 'lb' });
  assert.equal(porNombre.ok, true);
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 45);
});

test('un nombre que encaja con dos alimentos devuelve una pregunta, no una suposición', () => {
  const { state } = casa();
  addProduct(state, { name: 'Arroz integral', controlUnit: 'lb', purchaseUnit: 'lb' });
  const result = pedir(state, 'agregar_a_base', { producto: 'arro', cantidad: 5, unidad: 'lb' });
  assert.equal(result.ok, false);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].opciones.length, 2);
  assert.match(result.questions[0].pregunta, /Cuál/i);
});

test('«agrega ocho plátanos a la compra» propone la acción correcta y pide confirmación', () => {
  const { state, platano } = casa();
  const sinConfirmar = pedir(state, 'registrar_compra', { lineas: [{ producto: 'plátano maduro', cantidad: 8, unidad: 'unidad' }] });
  assert.equal(sinConfirmar.ok, false);
  assert.equal(sinConfirmar.needsConfirmation, true);
  assert.match(sinConfirmar.preview[0], /8 unidad de Plátano maduro/);
  assert.match(sinConfirmar.preview[0], /aumentará tus existencias/);
  assert.equal(inventoryNow(state)[platano], 8, 'mientras no se confirme, no se movió nada');
  const confirmado = pedir(state, 'registrar_compra', { lineas: [{ producto: 'plátano maduro', cantidad: 8, unidad: 'unidad' }] }, { confirmed: true });
  assert.equal(confirmado.ok, true);
  assert.equal(inventoryNow(state)[platano], 16);
});

test('«de los ocho plátanos quedan dos» registra seis consumidos', () => {
  const { state, platano } = casa();
  const result = pedir(state, 'registrar_restante', { producto: 'Plátano maduro', queda: 2 }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].result.consumido, 6);
  const revision = state.reviews[0];
  assert.equal(revision.consumed[platano], 6);
  assert.equal(revision.status, 'draft', 'anotar no es confirmar');
  assert.equal(inventoryNow(state)[platano], 8, 'una revisión sin confirmar no descuenta');
});

test('mandar dos veces la misma petición no la ejecuta dos veces', () => {
  const { state, platano } = casa();
  const args = { lineas: [{ producto: 'Plátano maduro', cantidad: 8, unidad: 'unidad' }] };
  const uno = runActions(state, [{ action: 'registrar_compra', arguments: args }], { confirmed: true, requestId: 'peticion-1' });
  const dos = runActions(state, [{ action: 'registrar_compra', arguments: args }], { confirmed: true, requestId: 'peticion-1' });
  assert.equal(uno.ok, true);
  assert.equal(dos.ok, true);
  assert.equal(dos.repeated, true);
  assert.equal(inventoryNow(state)[platano], 16, 'dieciséis, no veinticuatro');
  assert.equal(state.purchases.length, 1);
});

test('un grupo con una acción mala no deja nada a medias', () => {
  const { state, arroz } = casa();
  const antes = JSON.stringify(state);
  const result = runActions(state, [
    { action: 'agregar_a_base', arguments: { producto: 'Arroz', cantidad: 45, unidad: 'lb' } },
    { action: 'agregar_a_base', arguments: { producto: 'Arroz', cantidad: 5, unidad: 'kilogramo' } }
  ], { confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), antes, 'ni la primera acción, que era buena, quedó aplicada');
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 30);
});

test('una acción que falla al ejecutarse también revierte el grupo entero', () => {
  const { state, platano } = casa();
  const antes = JSON.stringify(state);
  const result = runActions(state, [
    { action: 'agregar_a_base', arguments: { producto: 'Plátano maduro', cantidad: 40, unidad: 'unidad' } },
    { action: 'corregir_existencias', arguments: { producto: 'Plátano maduro', cantidad: -5 } }
  ], { confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), antes);
  assert.equal(inventoryNow(state)[platano], 8);
});

test('deshacer devuelve el estado a como estaba', () => {
  const { state, arroz } = casa();
  const result = pedir(state, 'agregar_a_base', { producto: 'Arroz', cantidad: 99, unidad: 'lb' });
  assert.equal(result.ok, true);
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 99);
  undoTo(state, result.undo);
  assert.equal(baseLines(state).find(line => line.productId === arroz).quantity, 30);
  assert.throws(() => undoTo(state, null), /no se puede deshacer/);
});

test('las consultas no cambian nada, no confirman y no se registran', () => {
  const { state } = casa();
  const antes = JSON.stringify(state);
  const result = pedir(state, 'consultar_existencias', { producto: 'Arroz' });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].result.cantidad, 5);
  assert.equal(result.undo, null);
  assert.equal(JSON.stringify(state), antes);
  assert.equal(state.activity.length, 0);
});

test('la confirmación se explica en español, con nombres y cantidades, nunca en JSON', () => {
  const { state } = casa();
  const texto = describeAction(state, 'corregir_existencias', { producto: 'Arroz', cantidad: 2 });
  assert.match(texto, /Arroz/);
  assert.match(texto, /de 5 a 2 lb/);
  assert.doesNotMatch(texto, /[{}[\]]/, 'nada de llaves ni corchetes');
  assert.doesNotMatch(describeAction(state, 'quitar_de_base', { producto: 'Atún' }), /productId/);
});

test('quitar algo de un mes no se confunde con quitarlo del hábito', () => {
  const { state, atun } = casa();
  const mes = pedir(state, 'quitar_de_mes', { mes: '2026-09', producto: 'Atún' });
  assert.equal(mes.ok, true);
  assert.match(mes.summary, /Sigue estando en la canasta base/);
  assert.equal(baseLines(state).some(line => line.productId === atun), true);
  // Quitarlo de la base sí es sensible: cambia la costumbre de la casa.
  const base = pedir(state, 'quitar_de_base', { producto: 'Atún' });
  assert.equal(base.needsConfirmation, true);
  assert.equal(baseLines(state).some(line => line.productId === atun), true, 'sigue ahí hasta que se confirme');
});

test('crear un alimento que ya existe casi igual pregunta en vez de duplicarlo', () => {
  const { state } = casa();
  const result = pedir(state, 'crear_producto', { nombre: 'Platanos maduros', unidad: 'unidad' });
  assert.equal(result.ok, false);
  assert.match(result.question, /parecido/);
  assert.equal(result.options[0].nombre, 'Plátano maduro');
  assert.equal(state.products.length, 3, 'no se creó nada');
  // Uno que de verdad es nuevo sí entra.
  assert.equal(pedir(state, 'crear_producto', { nombre: 'Yuca', unidad: 'lb' }).ok, true);
  assert.equal(state.products.length, 4);
});

test('una restricción de una persona no se bloquea porque el alimento aún no exista', () => {
  const { state } = casa();
  const result = pedir(state, 'agregar_restriccion', { persona: 'Sofía', alimento: 'Maní' });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].result.enlazado, false);
  assert.deepEqual(state.people[0].pendingRestrictions, ['Maní']);
  // Y en cuanto el alimento aparece, se enlaza solo al guardar la persona.
  addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb' });
  upsertPerson(state, { id: state.people[0].id, name: 'Sofía', restrictions: [], pendingRestrictions: ['Maní'], habitual: [] });
  assert.equal(state.people[0].restrictions.length, 1);
  assert.deepEqual(state.people[0].pendingRestrictions, []);
});

test('la lista calculada explica por qué pide cada cantidad', () => {
  const { state } = casa();
  const result = pedir(state, 'calcular_lista', { desde: '2026-09-01', hasta: '2026-09-30', base: 'base' });
  assert.equal(result.ok, true);
  const arroz = result.results[0].result.lineas.find(line => line.nombre === 'Arroz');
  assert.equal(arroz.necesario, 30);
  assert.equal(arroz.disponible, 5);
  assert.equal(arroz.porComprar, 25);
  assert.match(arroz.porque, /Hacen falta 30 y hay 5/);
});

test('el registro de actividad guarda lo que pasó, en español', () => {
  const { state } = casa();
  pedir(state, 'agregar_a_base', { producto: 'Arroz', cantidad: 45, unidad: 'lb' });
  assert.equal(state.activity.length, 1);
  assert.equal(state.activity[0].date, todayISO());
  assert.deepEqual(state.activity[0].actions, ['agregar_a_base']);
  assert.match(state.activity[0].summary, /45 lb de Arroz/);
});

test('un argumento de más no llega a la función', () => {
  const { state } = casa();
  const check = validateAction(state, 'consultar_existencias', { producto: 'Arroz', ejecutar: 'rm -rf /' });
  assert.equal(check.ok, true);
  assert.deepEqual(check.extra, ['ejecutar']);
  assert.equal('ejecutar' in check.args, false, 'lo que no está en el esquema no pasa');
});

test('varias acciones que tocan el inventario a la vez se confirman aunque cada una fuera menor', () => {
  const { state } = casa();
  const result = runActions(state, [
    { action: 'registrar_restante', arguments: { producto: 'Arroz', queda: 1 } },
    { action: 'registrar_restante', arguments: { producto: 'Atún', queda: 1 } }
  ]);
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.preview.length, 2);
});
