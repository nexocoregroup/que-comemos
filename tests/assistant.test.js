import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_NAMES, describeAction, runActions, scopeOf, toolSchemas, undoTo, validateAction
} from '../src/assistant.js';
import { interpretar } from '../src/chat-ui.js';
import {
  UNITS, addProduct, createEmptyState, effectiveBasket, habitualLines, inventoryNow, listasCerradas, monthChanges,
  setHabitualBasket, todayISO, upsertPerson, upsertRecipe
} from '../src/model.js';

// Una casa de verdad: lo que hay en el catálogo, lo que se compra todos los
// meses y una preparación guardada. Sin esto no se puede probar la diferencia
// entre «solo en octubre» y «desde ahora», que es de lo que trata este archivo.
function casa() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 8, category: 'viveres' }).id;
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 5, category: 'granos' }).id;
  const atun = addProduct(state, { name: 'Atún', controlUnit: 'lata', purchaseUnit: 'lata', opening: 2, category: 'mar' }).id;
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 12, category: 'viveres' }).id;
  const queso = addProduct(state, { name: 'Queso', controlUnit: 'lb', purchaseUnit: 'lb', opening: 2, category: 'lacteos' }).id;
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb', opening: 0, category: 'mar' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }, { productId: atun, quantity: 8, unit: 'lata' }]);
  upsertPerson(state, { name: 'Sofía', restrictions: [], habitual: [] });
  upsertRecipe(state, { name: 'Tortillas con jamón y queso', uses: ['desayuno'], items: [{ productId: huevo, quantity: 2, unit: 'unidad' }], covers: [] });
  return { state, platano, arroz, atun, huevo, queso, cangrejo };
}
const pedir = (state, action, args, opciones) => runActions(state, [{ action, arguments: args }], opciones);
const enHabitual = (state, productId) => habitualLines(state).find(line => line.productId === productId);
const mesDe = state => todayISO().slice(0, 7);

/* ── Lo que hay que entender ───────────────────────────────────────────── */

// Las ocho maneras de decir las cosas que tienen que salir bien, con su acción
// y —lo que más importa— con su alcance. Una frase bien entendida y aplicada al
// alcance equivocado hace más daño que una frase no entendida.
const FRASES = [
  { frase: 'Pon tortillas con jamón y queso todos los lunes, miércoles y viernes de desayuno.', accion: 'crear_rutina', alcance: 'pregunta' },
  { frase: 'Este mes no comeremos en casa ningún domingo.', accion: 'crear_rutina', alcance: 'mes' },
  { frase: 'Agrega cuatro libras de cangrejo solamente para octubre.', accion: 'cambiar_solo_este_mes', alcance: 'mes' },
  { frase: 'Desde ahora compraremos cuatro libras de cangrejo todos los meses.', accion: 'agregar_a_habitual', alcance: 'permanente' },
  { frase: 'Quedan dos plátanos, diez huevos y media libra de queso.', accion: 'registrar_restante', alcance: 'fecha' },
  { frase: 'Copia la rutina de septiembre para octubre.', accion: 'copiar_rutina_de_mes', alcance: 'mes' },
  { frase: 'Cambia solamente la cena de mañana.', accion: 'cambiar_solo_esta_comida', alcance: 'fecha' },
  { frase: 'Todos los viernes cenaremos fuera.', accion: 'crear_rutina', alcance: 'pregunta' }
];

for (const caso of FRASES) {
  test(`entiende «${caso.frase}» y sabe hasta dónde llega`, () => {
    const { state } = casa();
    const leido = interpretar(caso.frase);
    assert.ok(leido, 'la frase tiene que reconocerse sin servicio de lenguaje');
    assert.ok(leido.acciones.every(peticion => peticion.action === caso.accion), `esperaba ${caso.accion} y salió ${leido.acciones.map(p => p.action).join(', ')}`);
    assert.ok(leido.acciones.every(peticion => ACTION_NAMES.includes(peticion.action)), 'toda acción sale de la lista blanca');
    const primera = leido.acciones[0];
    if (caso.alcance === 'pregunta') {
      // Si la frase no dijo si es de este mes o de siempre, no se elige por ella.
      const check = validateAction(state, primera.action, primera.arguments);
      assert.equal(check.ok, false);
      assert.equal(check.questions[0].campo, 'alcance');
      assert.deepEqual(check.questions[0].opciones.map(opcion => opcion.id), ['mes', 'siempre']);
      return;
    }
    assert.equal(scopeOf(state, primera.action, primera.arguments).tipo, caso.alcance);
  });
}

test('«solamente para octubre» habla de octubre y de nada más', () => {
  const { state, cangrejo } = casa();
  const leido = interpretar('Agrega cuatro libras de cangrejo solamente para octubre.');
  const peticion = leido.acciones[0];
  assert.match(peticion.arguments.mes, /-10$/, 'octubre, no el mes en curso');
  const mes = peticion.arguments.mes;
  const result = runActions(state, leido.acciones, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.alcance.tipo, 'mes');
  // Lo que de verdad importa: la costumbre de la casa no se movió.
  assert.equal(enHabitual(state, cangrejo), undefined, 'el cangrejo NO entró en mi canasta habitual');
  assert.equal(habitualLines(state).length, 2, 'la canasta habitual sigue teniendo arroz y atún, y nada más');
  const enOctubre = effectiveBasket(state, mes).find(line => line.productId === cangrejo);
  assert.equal(enOctubre.quantity, 4);
  assert.equal(enOctubre.source, 'extra');
});

test('«desde ahora, todos los meses» entra en la canasta habitual y no deja un cambio suelto', () => {
  const { state, cangrejo } = casa();
  const leido = interpretar('Desde ahora compraremos cuatro libras de cangrejo todos los meses.');
  assert.equal(leido.acciones[0].action, 'agregar_a_habitual');
  const previa = runActions(state, leido.acciones);
  assert.equal(previa.needsConfirmation, true, 'cambiar la costumbre se confirma antes');
  assert.equal(previa.alcance.tipo, 'permanente');
  assert.equal(enHabitual(state, cangrejo), undefined, 'sin confirmar no se tocó nada');

  const result = runActions(state, leido.acciones, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(enHabitual(state, cangrejo).quantity, 4);
  assert.equal(enHabitual(state, cangrejo).unit, 'lb');
  // Y no se queda además como excepción del mes: sería contarlo dos veces.
  assert.equal(monthChanges(state, mesDe(state)).changes.length, 0);
});

test('un cambio de octubre no aparece en noviembre', () => {
  const { state, arroz } = casa();
  const result = pedir(state, 'cambiar_solo_este_mes', { mes: '2026-10', producto: 'Arroz', cantidad: 45, unidad: 'lb' }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(effectiveBasket(state, '2026-10').find(line => line.productId === arroz).quantity, 45);
  assert.equal(effectiveBasket(state, '2026-11').find(line => line.productId === arroz).quantity, 30);
  assert.equal(enHabitual(state, arroz).quantity, 30, 'lo habitual sigue siendo 30');
  assert.equal(monthChanges(state, '2026-11').changes.length, 0);
});

test('quitar algo de un mes no se confunde con quitarlo de la costumbre', () => {
  const { state, atun } = casa();
  const mes = pedir(state, 'quitar_solo_este_mes', { mes: '2026-10', producto: 'Atún' }, { confirmed: true });
  assert.equal(mes.ok, true);
  assert.match(mes.summary, /Sigue en mis productos habituales/);
  assert.ok(enHabitual(state, atun), 'sigue siendo parte del hábito');
  assert.equal(effectiveBasket(state, '2026-10').some(line => line.productId === atun), false);
  assert.equal(effectiveBasket(state, '2026-11').some(line => line.productId === atun), true);
  // Quitarlo del hábito sí es otra cosa, y se confirma.
  const siempre = pedir(state, 'quitar_de_habitual', { producto: 'Atún' });
  assert.equal(siempre.needsConfirmation, true);
  assert.equal(siempre.alcance.tipo, 'permanente');
  assert.ok(enHabitual(state, atun), 'sigue ahí hasta que se confirme');
});

test('una frase sin alcance pregunta, y cada respuesta lleva su propia acción', () => {
  const { state } = casa();
  const leido = interpretar('Agrega 4 lb de cangrejo');
  assert.equal(leido.duda.opciones.length, 2);
  assert.deepEqual(leido.duda.opciones.map(opcion => opcion.id), ['mes', 'siempre']);
  assert.equal(leido.duda.opciones[0].acciones[0].action, 'cambiar_solo_este_mes');
  assert.equal(leido.duda.opciones[1].acciones[0].action, 'agregar_a_habitual');
  assert.match(leido.duda.pregunta, /todos los meses/);
});

/* ── Rutinas ───────────────────────────────────────────────────────────── */

test('una acción amplia exige confirmación antes de tocar nada', () => {
  const { state } = casa();
  const leido = interpretar('Todos los viernes cenaremos fuera.');
  const acciones = [{ ...leido.acciones[0], arguments: { ...leido.acciones[0].arguments, alcance: 'siempre' } }];
  const previa = runActions(state, acciones);
  assert.equal(previa.needsConfirmation, true);
  assert.equal(previa.alcance.tipo, 'permanente');
  assert.ok(previa.alcance.fechas.length >= 4, 'la vista previa enseña las fechas afectadas');
  assert.match(previa.preview[0], /Desde ahora, todos los meses/);
  assert.equal(state.mealRoutines.length, 0, 'sin confirmar no se escribió la rutina');
  assert.equal(state.plans.length, 0, 'sin confirmar no se escribió ninguna comida');

  const result = runActions(state, acciones, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(state.mealRoutines.length, 1);
  assert.equal(state.mealRoutines[0].scope, 'permanent');
  assert.equal(state.plans.length, previa.alcance.fechas.length, 'una cena fuera por cada viernes del mes');
  assert.ok(state.plans.every(plan => plan.kind === 'outside' && plan.slot === 'cena'));
});

test('una rutina de este mes no se vuelve la costumbre de la casa', () => {
  const { state } = casa();
  const leido = interpretar('Este mes no comeremos en casa ningún domingo.');
  const result = runActions(state, leido.acciones, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(state.mealRoutines[0].scope, 'month');
  assert.equal(state.mealRoutines[0].month, mesDe(state));
  assert.equal(result.alcance.tipo, 'mes');
  assert.ok(state.plans.length >= 12, 'las tres comidas de cada domingo del mes');
});

test('«cambia solamente la cena de mañana» toca un solo día y pregunta qué poner', () => {
  const { state } = casa();
  const leido = interpretar('Cambia solamente la cena de mañana.');
  const alcance = scopeOf(state, 'cambiar_solo_esta_comida', leido.acciones[0].arguments);
  assert.equal(alcance.tipo, 'fecha');
  assert.equal(alcance.fechas.length, 1);
  const result = runActions(state, leido.acciones);
  // No hay preparaciones de cena en esta casa: se dice, en vez de enseñar una
  // lista vacía de opciones.
  assert.equal(result.ok, false);
  assert.match(result.question, /preparaciones para la cena/);
  assert.equal(state.plans.length, 0, 'preguntar no es cambiar');
});

/* ── Las garantías de siempre ──────────────────────────────────────────── */

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
  const inventado = pedir(state, 'quitar_de_habitual', { producto: 'producto-999' });
  assert.equal(inventado.ok, false);
  assert.match(inventado.errors[0], /No encuentro/);
  // Por nombre sí, aunque venga escrito de otra forma.
  const porNombre = pedir(state, 'agregar_a_habitual', { producto: 'arroz', cantidad: 45, unidad: 'lb' }, { confirmed: true });
  assert.equal(porNombre.ok, true);
  assert.equal(enHabitual(state, arroz).quantity, 45);
});

test('un nombre que encaja con dos alimentos devuelve una pregunta, no una suposición', () => {
  const { state } = casa();
  addProduct(state, { name: 'Arroz integral', controlUnit: 'lb', purchaseUnit: 'lb' });
  const antes = habitualLines(state).length;
  const result = pedir(state, 'agregar_a_habitual', { producto: 'arro', cantidad: 5, unidad: 'lb' });
  assert.equal(result.ok, false);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].opciones.length, 2);
  assert.match(result.questions[0].pregunta, /Cuál/i);
  assert.equal(habitualLines(state).length, antes, 'una duda no cambia nada');
});

test('un alimento que todavía no existe se registra, pero avisando antes', () => {
  const { state } = casa();
  const previa = pedir(state, 'agregar_a_habitual', { producto: 'Lechosa', cantidad: 2, unidad: 'unidad' });
  assert.equal(previa.needsConfirmation, true);
  assert.match(previa.preview[0], /Registrar «Lechosa» como alimento nuevo/);
  assert.equal(state.products.length, 6, 'sin confirmar no se registró nada');
  const result = pedir(state, 'agregar_a_habitual', { producto: 'Lechosa', cantidad: 2, unidad: 'unidad' }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(state.products.length, 7);
  assert.equal(habitualLines(state).length, 3);
});

test('«agrega ocho plátanos a la compra» propone la acción correcta y pide confirmación', () => {
  const { state, platano } = casa();
  const sinConfirmar = pedir(state, 'registrar_compra', { lineas: [{ producto: 'plátano maduro', cantidad: 8, unidad: 'unidad' }] });
  assert.equal(sinConfirmar.ok, false);
  assert.equal(sinConfirmar.needsConfirmation, true);
  assert.match(sinConfirmar.preview[0], /8 unidades de Plátano maduro/);
  // Ya no sube ninguna existencia, y la confirmación lo dice: la app dejó de
  // llevar la cuenta de la despensa. Lo que se guarda es la compra en sí.
  assert.match(sinConfirmar.preview[0], /No cambia lo que la app cree que hay en casa/);
  assert.equal(listasCerradas(state).length, 0, 'mientras no se confirme, no se guardó nada');

  const confirmado = pedir(state, 'registrar_compra', { lineas: [{ producto: 'plátano maduro', cantidad: 8, unidad: 'unidad' }] }, { confirmed: true });
  assert.equal(confirmado.ok, true);
  const guardada = listasCerradas(state)[0];
  assert.ok(guardada, 'la compra no llegó al historial');
  assert.deepEqual(guardada.lineas.map(fila => [fila.productId, fila.cantidad, fila.comprada, fila.comprado]), [[platano, 8, 8, true]]);
  assert.equal(inventoryNow(state)[platano], 8, 'una compra anotada al hablar no puede mover las existencias');
});

test('«quedan dos plátanos, diez huevos y media libra de queso» anota los tres', () => {
  const { state, platano, huevo, queso } = casa();
  const leido = interpretar('Quedan dos plátanos, diez huevos y media libra de queso.');
  assert.equal(leido.acciones.length, 3);
  const previa = runActions(state, leido.acciones);
  assert.equal(previa.needsConfirmation, true, 'tres anotaciones de existencias se confirman juntas');
  assert.equal(previa.preview.length, 3);
  const result = runActions(state, leido.acciones, { confirmed: true });
  assert.equal(result.ok, true);
  const revision = state.reviews[0];
  assert.equal(revision.consumed[platano], 6);
  assert.equal(revision.consumed[huevo], 2);
  assert.equal(revision.consumed[queso], 1.5);
  assert.equal(revision.status, 'draft', 'anotar no es confirmar la revisión');
});

test('mandar dos veces la misma petición no la ejecuta dos veces', () => {
  const { state, platano } = casa();
  const args = { lineas: [{ producto: 'Plátano maduro', cantidad: 8, unidad: 'unidad' }] };
  const uno = runActions(state, [{ action: 'registrar_compra', arguments: args }], { confirmed: true, requestId: 'peticion-1' });
  const dos = runActions(state, [{ action: 'registrar_compra', arguments: args }], { confirmed: true, requestId: 'peticion-1' });
  assert.equal(uno.ok, true);
  assert.equal(dos.ok, true);
  assert.equal(dos.repeated, true);
  assert.equal(listasCerradas(state).length, 1, 'una compra guardada, no dos');
  assert.equal(state.purchases.length, 0, 'ya no se escribe en el inventario viejo');
});

test('un grupo con una acción mala no deja nada a medias', () => {
  const { state, arroz } = casa();
  const antes = JSON.stringify(state);
  const result = runActions(state, [
    { action: 'agregar_a_habitual', arguments: { producto: 'Arroz', cantidad: 45, unidad: 'lb' } },
    { action: 'agregar_a_habitual', arguments: { producto: 'Arroz', cantidad: 5, unidad: 'kilogramo' } }
  ], { confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), antes, 'ni la primera acción, que era buena, quedó aplicada');
  assert.equal(enHabitual(state, arroz).quantity, 30);
});

test('una acción que falla al ejecutarse también revierte el grupo entero', () => {
  const { state, platano } = casa();
  const antes = JSON.stringify(state);
  const result = runActions(state, [
    { action: 'agregar_a_habitual', arguments: { producto: 'Plátano maduro', cantidad: 40, unidad: 'unidad' } },
    { action: 'corregir_existencias', arguments: { producto: 'Plátano maduro', cantidad: -5 } }
  ], { confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), antes);
  assert.equal(inventoryNow(state)[platano], 8);
});

test('deshacer deja el estado exactamente como estaba', () => {
  const { state, arroz } = casa();
  const antes = structuredClone(state);
  const result = pedir(state, 'agregar_a_habitual', { producto: 'Arroz', cantidad: 99, unidad: 'lb' }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(enHabitual(state, arroz).quantity, 99);
  undoTo(state, result.undo);
  assert.deepStrictEqual(state, antes, 'hasta el registro de actividad vuelve a como estaba');
  assert.throws(() => undoTo(state, null), /no se puede deshacer/);
});

test('deshacer también devuelve una rutina y las comidas que escribió', () => {
  const { state } = casa();
  const antes = structuredClone(state);
  const result = pedir(state, 'crear_rutina', { tipo: 'fuera', comidas: ['cena'], dias: [5], alcance: 'siempre' }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.ok(state.plans.length > 0);
  undoTo(state, result.undo);
  assert.deepStrictEqual(state, antes);
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
  assert.doesNotMatch(describeAction(state, 'quitar_de_habitual', { producto: 'Atún' }), /productId/);
  // Y el alcance se dice con palabras, no con la palabra «permanent».
  assert.match(describeAction(state, 'agregar_a_habitual', { producto: 'Arroz', cantidad: 40, unidad: 'lb' }), /Desde ahora, todos los meses/);
  assert.match(describeAction(state, 'cambiar_solo_este_mes', { mes: '2026-10', producto: 'Arroz', cantidad: 40, unidad: 'lb' }), /solo en octubre de 2026/);
});

test('crear un alimento que ya existe casi igual pregunta en vez de duplicarlo', () => {
  const { state } = casa();
  const result = pedir(state, 'crear_producto', { nombre: 'Platanos maduros', unidad: 'unidad' });
  assert.equal(result.ok, false);
  assert.match(result.question, /parecido/);
  assert.equal(result.options[0].nombre, 'Plátano maduro');
  assert.equal(state.products.length, 6, 'no se creó nada');
  // Uno que de verdad es nuevo sí entra.
  assert.equal(pedir(state, 'crear_producto', { nombre: 'Yuca', unidad: 'lb' }, { confirmed: true }).ok, true);
  assert.equal(state.products.length, 7);
});

test('una restricción de una persona no se bloquea porque el alimento aún no exista', () => {
  const { state } = casa();
  const result = pedir(state, 'agregar_restriccion', { persona: 'Sofía', alimento: 'Maní' }, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].result.enlazado, false);
  assert.deepEqual(state.people[0].restricciones, [{ productId: null, texto: 'Maní', motivo: null }]);
  // Y en cuanto el alimento aparece, se enlaza solo al guardar la persona.
  addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb' });
  upsertPerson(state, { id: state.people[0].id, name: 'Sofía', habitual: [] });
  assert.equal(state.people[0].restricciones.length, 1);
  assert.ok(state.people[0].restricciones[0].productId, 'el texto pasó a apuntar al alimento');
  assert.equal(state.people[0].restricciones[0].texto, '');
});

test('la lista calculada explica por qué pide cada cantidad', () => {
  const { state } = casa();
  const result = pedir(state, 'calcular_lista', { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].result.base, 'casa');
  const arroz = result.results[0].result.lineas.find(line => line.nombre === 'Arroz');
  assert.equal(arroz.necesario, 30);
  assert.equal(arroz.disponible, 5);
  assert.equal(arroz.porComprar, 25);
  assert.match(arroz.porque, /Hacen falta 30 y hay 5/);
});

test('el registro de actividad guarda lo que pasó, en español y con su alcance', () => {
  const { state } = casa();
  pedir(state, 'agregar_a_habitual', { producto: 'Arroz', cantidad: 45, unidad: 'lb' }, { confirmed: true });
  assert.equal(state.activity.length, 1);
  assert.equal(state.activity[0].date, todayISO());
  assert.deepEqual(state.activity[0].actions, ['agregar_a_habitual']);
  assert.match(state.activity[0].summary, /45 lb de Arroz/);
  assert.equal(state.activity[0].alcance.tipo, 'permanente');
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

test('las herramientas del intérprete están bien formadas, una por acción', () => {
  // Esta lista nació para mandársela a un modelo por un servicio externo. Ese
  // servicio se quitó —la asistente entiende aquí dentro, reconociendo formas de
  // frase— pero la comprobación sigue valiendo por sí sola: cada acción tiene su
  // herramienta, con su descripción y su esquema, y un descuadre aquí es una
  // acción que el intérprete no sabría nombrar.
  const tools = toolSchemas();
  assert.equal(tools.length, ACTION_NAMES.length, 'una herramienta por acción, ni más ni menos');
  for (const tool of tools) {
    assert.deepEqual(Object.keys(tool).sort(), ['descripcion', 'nombre', 'parametros'], `${tool.nombre}: las tres claves de una herramienta`);
    assert.ok(ACTION_NAMES.includes(tool.nombre));
    assert.ok(tool.descripcion.length > 12, `${tool.nombre} necesita una descripción que sirva para elegirla`);
    assert.ok(Array.isArray(tool.parametros.required));
    for (const [clave, esquema] of Object.entries(tool.parametros.properties)) {
      assert.ok(typeof esquema.type === 'string', `${tool.nombre}.${clave} necesita un tipo de JSON Schema`);
    }
    for (const obligatorio of tool.parametros.required) {
      assert.ok(obligatorio in tool.parametros.properties, `${tool.nombre}: «${obligatorio}» es obligatorio pero no está descrito`);
    }
  }
  // Las unidades que se le ofrecen al modelo son las del modelo, no una copia
  // que se pueda quedar atrás.
  assert.deepEqual(tools.find(tool => tool.nombre === 'agregar_a_habitual').parametros.properties.unidad.enum, UNITS);
  // Y el alcance de una rutina es obligatorio: sin él, el modelo tendría que
  // elegir entre «este mes» y «siempre» por su cuenta, que es lo que no puede.
  const rutina = tools.find(tool => tool.nombre === 'crear_rutina');
  assert.ok(rutina.parametros.required.includes('alcance'));
  assert.deepEqual(rutina.parametros.properties.alcance.enum, ['mes', 'siempre']);
});

test('las canastas viejas ya no existen: ni por nombre se pueden pedir', () => {
  const { state } = casa();
  for (const vieja of ['agregar_a_base', 'quitar_de_base', 'agregar_a_mes', 'quitar_de_mes', 'ver_canasta_base', 'ver_canasta_mes', 'comparar_mes_con_base', 'aplicar_mes_a_base']) {
    assert.equal(ACTION_NAMES.includes(vieja), false, `«${vieja}» tenía que haber desaparecido`);
    assert.equal(validateAction(state, vieja, {}).ok, false);
  }
});
