// Una regla une UNA preparación con UN momento.
//
// Antes una sola regla podía cubrir varios momentos del día a la vez, y eso
// hacía imposible lo que una casa pide constantemente: cambiar el desayuno de
// los lunes sin tocar la cena. Se editaba «la rutina» y se movían las dos.
//
// Ahora son reglas distintas e independientes. Lo que estas pruebas vigilan es
// la parte delicada de esa separación: que las comidas que ya estaban puestas
// sigan colgando de la regla que de verdad las puso —la de SU momento— y no de
// la primera de la lista. Si eso se torciera, borrar el desayuno de los lunes
// se llevaría por delante cenas que nadie quiso quitar.

import test from 'node:test';
import assert from 'node:assert/strict';

import { addProduct, createEmptyState, planFor, upsertRecipe } from '../src/model.js';
import { migrate } from '../src/migrate.js';
import {
  addRoutine, addRoutines, applyRoutine, deleteRoutine, grupoComoRegla, grupoDeRegla, gruposDeReglas,
  openMonth, reglasDePreparacion, routinePlans, routinesFor, updateRoutine
} from '../src/routines.js';

const MES = '2026-10';

function cocina() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 3, unit: 'unidad' }] }).id;
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [] }).id;
  return { state, mangu, locrio };
}

/* ── Escribir ──────────────────────────────────────────────────────────── */

test('pedir tres momentos de una sentada escribe tres reglas, no una que valga para tres', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['cena', 'desayuno', 'almuerzo'], weekdays: [7], label: 'Domingo de playa' });
  assert.equal(reglas.length, 3);
  assert.deepEqual(reglas.map(regla => regla.momento), ['desayuno', 'almuerzo', 'cena'], 'en el orden del día, no en el que se marcaron');
  assert.equal(new Set(reglas.map(regla => regla.id)).size, 3, 'cada una con su identificador');
  assert.equal(new Set(reglas.map(regla => regla.grupoId)).size, 1, 'y todas recordando que se escribieron de una vez');
  for (const regla of reglas) assert.deepEqual(regla.slots, [regla.momento]);
});

test('una preparación puede tener varias reglas independientes', () => {
  const { state, mangu } = cocina();
  const lunes = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  const viernes = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [5] });
  assert.equal(reglasDePreparacion(state, mangu).length, 2);
  assert.notEqual(lunes.grupoId, viernes.grupoId, 'dos respuestas distintas no son el mismo grupo');

  // Y son de verdad independientes: cambiar los días de una no toca la otra.
  updateRoutine(state, lunes.id, { weekdays: [2] });
  assert.deepEqual(state.mealRoutines.find(regla => regla.id === lunes.id).weekdays, [2]);
  assert.deepEqual(state.mealRoutines.find(regla => regla.id === viernes.id).weekdays, [5]);
});

test('una regla sin momento no se puede guardar', () => {
  const { state } = cocina();
  assert.throws(() => addRoutine(state, { kind: 'outside', slots: [], weekdays: [1] }), /comida del día/);
});

/* ── Cada comida cuelga de la regla de su momento ──────────────────────── */

test('las comidas que pone un grupo cuelgan cada una de la regla que le toca', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7], label: 'Domingo de playa' });
  applyRoutine(state, reglas[0].id, MES, { hasta: '2026-10-04' });

  for (const regla of reglas) {
    const plan = planFor(state, '2026-10-04', regla.momento);
    assert.equal(plan.kind, 'outside');
    assert.equal(plan.routineId, regla.id, `la comida de ${regla.momento} tiene que colgar de la regla de ${regla.momento}`);
  }
});

test('aplicar una del grupo aplica el grupo entero: es lo que la persona pidió', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7], label: 'Domingo de playa' });
  const resultado = applyRoutine(state, reglas[2].id, MES, { hasta: '2026-10-04' });
  assert.equal(resultado.creados.length, 3);
});

test('borrar la rutina borra sus tres reglas, no solo el desayuno', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7] });
  applyRoutine(state, reglas[0].id, MES, { hasta: '2026-10-04' });
  const resultado = deleteRoutine(state, reglas[0].id, { comidas: 'quitar', desde: '2026-10-01' });

  assert.equal(state.mealRoutines.length, 0, 'no puede quedar media rutina viva');
  assert.equal(resultado.quitadas, 3);
  for (const slot of ['desayuno', 'almuerzo', 'cena']) assert.equal(planFor(state, '2026-10-04', slot), undefined);
});

test('borrar conservando las comidas las deja escritas y sueltas', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'cena'], weekdays: [7] });
  applyRoutine(state, reglas[0].id, MES, { hasta: '2026-10-04' });
  deleteRoutine(state, reglas[0].id);
  assert.equal(state.mealRoutines.length, 0);
  for (const slot of ['desayuno', 'cena']) {
    const plan = planFor(state, '2026-10-04', slot);
    assert.equal(plan.kind, 'outside', 'la comida se queda: la decidió alguien');
    assert.equal(plan.routineId, null, 'pero ya no viene de ninguna regla');
  }
});

test('las comidas del grupo se buscan por el grupo, no por la primera regla', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'cena'], weekdays: [7] });
  applyRoutine(state, reglas[0].id, MES, { hasta: '2026-10-04' });
  assert.equal(routinePlans(state, reglas[0].id).length, 2);
  assert.equal(routinePlans(state, reglas[1].id).length, 2, 'se pregunte por la que se pregunte');
});

/* ── Editar reconcilia el grupo ────────────────────────────────────────── */

test('marcar un momento más estrena una regla y deja la que había donde estaba', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  applyRoutine(state, desayunos.id, MES, {});
  const puestas = routinePlans(state, desayunos.id).length;

  updateRoutine(state, desayunos.id, { slots: ['desayuno', 'cena'] });
  const { reglas } = grupoDeRegla(state, desayunos.id);
  assert.equal(reglas.length, 2);
  assert.ok(reglas.some(regla => regla.id === desayunos.id && regla.momento === 'desayuno'), 'la que había conserva su id');
  assert.equal(routinePlans(state, desayunos.id).length, puestas, 'y con él las comidas que ya había puesto');
});

test('desmarcar un momento quita esa regla y deja sus comidas escritas', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'cena'], weekdays: [7] });
  applyRoutine(state, reglas[0].id, MES, { hasta: '2026-10-04' });

  updateRoutine(state, reglas[0].id, { slots: ['desayuno'] });
  assert.equal(grupoDeRegla(state, reglas[0].id).reglas.length, 1);
  const cena = planFor(state, '2026-10-04', 'cena');
  assert.equal(cena.kind, 'outside', 'la cena de ese domingo no se borra');
  assert.equal(cena.routineId, null, 'pero deja de venir de una regla');
});

/* ── Enseñarlas como se escribieron ────────────────────────────────────── */

test('las pantallas siguen viendo una rutina donde ahora hay tres reglas', () => {
  const { state } = cocina();
  addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7], label: 'Domingo de playa' });
  assert.equal(routinesFor(state, MES).length, 3, 'por dentro son tres');
  const grupos = gruposDeReglas(state, MES);
  assert.equal(grupos.length, 1, 'y para quien las escribió, una');
  assert.deepEqual(grupos[0].slots, ['desayuno', 'almuerzo', 'cena']);
  assert.equal(grupos[0].label, 'Domingo de playa');
  assert.equal(grupos[0].reglas.length, 3);
});

test('abrir un mes no aplica cada regla tantas veces como hermanas tenga', () => {
  const { state } = cocina();
  addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7], scope: 'permanent' });
  const resultado = openMonth(state, MES);
  const domingos = 4;   // octubre de 2026 tiene cuatro domingos
  assert.equal(resultado.creados.length, domingos * 3);
  assert.equal(new Set(resultado.creados).size, resultado.creados.length, 'ni una comida contada dos veces');
});

/* ── Lo que había guardado ─────────────────────────────────────────────── */

test('una regla vieja de tres momentos se parte en tres, y sus comidas se reparten', () => {
  // Tal como estaba guardada en la versión 8: un registro, tres momentos, y seis
  // comidas apuntando todas al mismo identificador.
  const viejo = {
    version: 8, seq: 40, demo: false,
    products: [], people: [], recipes: [], absences: [], opening: {}, purchases: [], reviews: [],
    corrections: [], manualItems: [], habitualBasket: { lines: [], updatedAt: null, history: [] },
    monthOverrides: {}, monthPlans: { [MES]: { month: MES, openedAt: '2026-10-01', preparedAt: null, summary: null } },
    closedPeriods: [], settings: { reviewWeekday: 5, onboarded: true }, activity: [],
    mealRoutines: [{
      id: 'rutina-9', kind: 'outside', recipeId: null, slots: ['desayuno', 'almuerzo', 'cena'],
      weekdays: [7], weeks: null, scope: 'permanent', month: null, desde: null, until: null,
      label: 'Domingo de playa', active: true
    }],
    plans: ['desayuno', 'almuerzo', 'cena'].flatMap(slot => ['2026-10-04', '2026-10-11'].map((date, i) => ({
      id: `comida-${slot}-${i}`, date, slot, kind: 'outside', routineId: 'rutina-9',
      origen: 'rutina', participants: [], items: []
    })))
  };

  const { ok, state } = migrate(viejo);
  assert.ok(ok);
  assert.equal(state.mealRoutines.length, 3, 'una regla por momento');
  assert.equal(new Set(state.mealRoutines.map(regla => regla.grupoId)).size, 1, 'y todas del mismo grupo');
  assert.ok(state.mealRoutines.some(regla => regla.id === 'rutina-9'), 'la primera conserva su identificador');

  const porMomento = new Map(state.mealRoutines.map(regla => [regla.momento, regla.id]));
  assert.deepEqual([...porMomento.keys()], ['desayuno', 'almuerzo', 'cena']);
  for (const plan of state.plans) {
    assert.equal(plan.routineId, porMomento.get(plan.slot), `la comida de ${plan.slot} quedó colgando de la regla equivocada`);
  }

  // Y la prueba de fuego: borrar el desayuno no se lleva las cenas.
  deleteRoutine(state, porMomento.get('desayuno'), { comidas: 'quitar', desde: '2026-10-01' });
  assert.equal(state.plans.length, 0, 'borrar el grupo entero se lleva las seis');
});

test('la partición no se repite: dos migraciones dejan las mismas tres reglas', () => {
  const { state } = cocina();
  addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7] });
  const una = migrate(state).state;
  const otra = migrate(una).state;
  assert.equal(otra.mealRoutines.length, 3);
  assert.deepEqual(otra.mealRoutines, una.mealRoutines);
});

test('la ventana de editar abre marcados todos los momentos del grupo', () => {
  // El fallo que esto impide: abrirla marcando solo el momento de la primera
  // regla. Quien entrara a cambiar los días y guardara perdería la cena sin que
  // nada se lo dijera.
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'cena'], weekdays: [7], label: 'Domingo de playa' });
  const paraEditar = grupoComoRegla(state, reglas[0].id);
  assert.deepEqual(paraEditar.slots, ['desayuno', 'cena']);
  assert.equal(paraEditar.label, 'Domingo de playa');
  assert.equal(paraEditar.id, reglas[0].id, 'y sigue siendo la regla por la que se preguntó');
});

test('una regla apagada no vuelve sola al abrir la ventana', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['desayuno', 'cena'], weekdays: [7] });
  state.mealRoutines.find(regla => regla.id === reglas[1].id).active = false;
  assert.deepEqual(grupoComoRegla(state, reglas[0].id).slots, ['desayuno']);
});

test('preguntar por un grupo que no existe devuelve nada en vez de reventar', () => {
  const { state } = cocina();
  assert.equal(grupoComoRegla(state, 'regla-que-no-existe'), null);
  assert.deepEqual(grupoDeRegla(state, 'regla-que-no-existe').reglas, []);
  assert.equal(deleteRoutine(state, 'regla-que-no-existe'), false);
});
