// Una regla une UNA preparación con UN momento.
//
// La ficha de la preparación dice en qué momentos **puede** comerse: el mangú
// con salami vale de desayuno y de cena. La regla dice cuándo **se pone**: los
// lunes de desayuno. Confundir las dos es lo que hacía imposible lo que una casa
// pide constantemente —cambiar el desayuno de los lunes sin tocar la cena de los
// viernes—, porque una sola regla arrastraba los dos momentos.
//
// El ejemplo que manda en este archivo es ese: mangú los lunes de desayuno y los
// viernes de cena. Tienen que salir exactamente esas comidas y ninguna más. Un
// cruce —mangú el lunes de cena, o el viernes de desayuno— es el fallo que todo
// esto existe para impedir.

import test from 'node:test';
import assert from 'node:assert/strict';

import { addProduct, createEmptyState, planFor, upsertRecipe } from '../src/model.js';
import { migrate } from '../src/migrate.js';
import {
  addRoutine, addRoutines, applyRoutine, deleteRoutine, openMonth, pausarRegla, regla,
  reglasDePreparacion, reglasDelMes, routinePlans, routinesFor, updateRoutine, weekdayOf
} from '../src/routines.js';

const MES = '2026-10';
const LUNES = 1, VIERNES = 5;

function cocina() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [{ productId: platano }] }).id;
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [] }).id;
  return { state, mangu, locrio };
}

/* ── El ejemplo del mangú ──────────────────────────────────────────────── */

test('mangú los lunes de desayuno y los viernes de cena: esas comidas y ni una más', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  const cenas = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES], scope: 'permanent' });

  applyRoutine(state, desayunos.id, MES, { modo: 'vacios' });
  applyRoutine(state, cenas.id, MES, { modo: 'vacios' });

  const puestas = state.plans.filter(plan => plan.recipeId === mangu);
  // Cada comida cae donde le toca: el día de la semana que dice su regla y el
  // momento que dice su regla. Nada más.
  for (const plan of puestas) {
    const dia = weekdayOf(plan.date);
    if (plan.slot === 'desayuno') assert.equal(dia, LUNES, `un desayuno de mangú cayó en el día ${dia}`);
    else if (plan.slot === 'cena') assert.equal(dia, VIERNES, `una cena de mangú cayó en el día ${dia}`);
    else assert.fail(`el mangú apareció en «${plan.slot}», que no es de ninguna de sus dos reglas`);
  }

  // Y ningún cruce: ni cena de lunes, ni desayuno de viernes.
  for (const plan of state.plans) {
    const dia = weekdayOf(plan.date);
    assert.ok(!(dia === LUNES && plan.slot === 'cena'), `se puso una cena el lunes ${plan.date}`);
    assert.ok(!(dia === VIERNES && plan.slot === 'desayuno'), `se puso un desayuno el viernes ${plan.date}`);
  }

  // Octubre de 2026 tiene cuatro lunes y cinco viernes.
  assert.equal(puestas.filter(plan => plan.slot === 'desayuno').length, 4);
  assert.equal(puestas.filter(plan => plan.slot === 'cena').length, 5);
  assert.equal(reglasDePreparacion(state, mangu).length, 2);
});

test('editar la del lunes no toca la del viernes', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const cenas = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES] });

  updateRoutine(state, desayunos.id, { weekdays: [2], momento: 'desayuno' });
  assert.deepEqual(regla(state, desayunos.id).weekdays, [2]);
  assert.deepEqual(regla(state, cenas.id).weekdays, [VIERNES], 'se movió la otra regla');
  assert.equal(regla(state, cenas.id).momento, 'cena');
});

test('borrar la del lunes deja viva la del viernes y sus comidas', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const cenas = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES] });
  applyRoutine(state, desayunos.id, MES, {});
  applyRoutine(state, cenas.id, MES, {});
  const antes = routinePlans(state, cenas.id).length;

  deleteRoutine(state, desayunos.id, { comidas: 'quitar', desde: '2026-10-01' });
  assert.equal(regla(state, desayunos.id), null);
  assert.ok(regla(state, cenas.id), 'se llevó por delante la regla del viernes');
  assert.equal(routinePlans(state, cenas.id).length, antes, 'se llevó por delante las cenas');
  assert.equal(state.plans.filter(plan => plan.slot === 'desayuno').length, 0);
});

/* ── Escribir reglas ───────────────────────────────────────────────────── */

test('una regla nueva es de un momento, y lo dice en su propio campo', () => {
  const { state, mangu } = cocina();
  const nueva = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  assert.match(nueva.id, /^regla-/);
  assert.equal(nueva.momento, 'desayuno');
  assert.deepEqual(nueva.slots, ['desayuno']);
  assert.equal(nueva.grupoId, undefined, 'el andamio de la etapa anterior ya no se escribe');
  assert.equal(nueva.scope, 'permanent', 'una costumbre es permanente mientras no se diga otra cosa');
  assert.equal(nueva.active, true);
});

test('pedir varios momentos de una vez escribe varias reglas independientes', () => {
  const { state } = cocina();
  const reglas = addRoutines(state, { kind: 'outside', slots: ['cena', 'desayuno', 'almuerzo'], weekdays: [7], label: 'Domingo de playa' });
  assert.equal(reglas.length, 3);
  assert.deepEqual(reglas.map(item => item.momento), ['desayuno', 'almuerzo', 'cena'], 'en el orden del día');
  assert.equal(new Set(reglas.map(item => item.id)).size, 3);
  // Y son independientes de verdad: quitar una deja las otras dos.
  deleteRoutine(state, reglas[0].id);
  assert.equal(state.mealRoutines.length, 2);
});

test('una excepción vale solo para su mes; una costumbre, para todos', () => {
  const { state, mangu } = cocina();
  const siempre = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const soloOctubre = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES], scope: 'month', month: MES });
  assert.equal(siempre.scope, 'permanent');
  assert.equal(soloOctubre.scope, 'month');
  assert.ok(routinesFor(state, MES).some(item => item.id === soloOctubre.id));
  assert.ok(!routinesFor(state, '2026-11').some(item => item.id === soloOctubre.id), 'la excepción se coló en noviembre');
  assert.ok(routinesFor(state, '2026-11').some(item => item.id === siempre.id));
});

test('primer y tercer domingo son los que caen en el mes, sean las fechas que sean', () => {
  const { state } = cocina();
  const playa = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3] });
  const resultado = applyRoutine(state, playa.id, MES, {});
  assert.equal(resultado.creados.length, 2);
  const fechas = state.plans.map(plan => plan.date).sort();
  assert.deepEqual(fechas, ['2026-10-04', '2026-10-18']);
});

/* ── Pausar ────────────────────────────────────────────────────────────── */

test('pausar una regla deja de poner comidas sin borrar la regla ni lo ya puesto', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  applyRoutine(state, desayunos.id, MES, {});
  const puestas = routinePlans(state, desayunos.id).length;
  assert.ok(puestas > 0);

  pausarRegla(state, desayunos.id);
  assert.equal(regla(state, desayunos.id).active, false, 'la regla sigue escrita, solo que apagada');
  assert.equal(routinePlans(state, desayunos.id).length, puestas, 'pausar no puede borrar comidas ya puestas');
  assert.ok(!routinesFor(state, '2026-11').some(item => item.id === desayunos.id), 'una regla en pausa no puede poner nada');
  // Pero sigue a la vista, o no habría forma de reanudarla.
  assert.ok(reglasDelMes(state, '2026-11').some(item => item.id === desayunos.id), 'una regla en pausa desapareció de la pantalla');

  pausarRegla(state, desayunos.id, false);
  assert.equal(regla(state, desayunos.id).active, true);
  assert.ok(routinesFor(state, '2026-11').some(item => item.id === desayunos.id));
});

test('abrir un mes salta las reglas en pausa', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  pausarRegla(state, desayunos.id);
  assert.equal(openMonth(state, MES).creados.length, 0);
});

test('pausar algo que no existe se dice, no se traga', () => {
  const { state } = cocina();
  assert.throws(() => pausarRegla(state, 'regla-que-no-existe'), /no encontrada/);
});

/* ── Enseñarlas ────────────────────────────────────────────────────────── */

test('las reglas del mes salen en el orden del día', () => {
  const { state, mangu, locrio } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES] });
  addRoutine(state, { kind: 'recipe', recipeId: locrio, slots: ['almuerzo'], weekdays: [3] });
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  assert.deepEqual(reglasDelMes(state, MES).map(item => item.momento), ['desayuno', 'almuerzo', 'cena']);
});

/* ── Lo que había guardado ─────────────────────────────────────────────── */

const estadoViejo = (version, reglas, plans = []) => ({
  version, seq: 40, demo: false,
  products: [], people: [], recipes: [], absences: [], opening: {}, purchases: [], reviews: [],
  corrections: [], manualItems: [], habitualBasket: { lines: [], updatedAt: null, history: [] },
  monthOverrides: {}, monthPlans: { [MES]: { month: MES, openedAt: '2026-10-01', preparedAt: null, summary: null } },
  closedPeriods: [], settings: { reviewWeekday: 5, onboarded: true }, activity: [],
  mealRoutines: reglas, plans
});

test('una rutina vieja de tres momentos se parte en tres, y sus comidas se reparten', () => {
  const viejo = estadoViejo(8, [{
    id: 'rutina-9', kind: 'outside', recipeId: null, slots: ['desayuno', 'almuerzo', 'cena'],
    weekdays: [7], weeks: null, scope: 'permanent', month: null, desde: null, until: null,
    label: 'Domingo de playa', active: true
  }], ['desayuno', 'almuerzo', 'cena'].flatMap(slot => ['2026-10-04', '2026-10-11'].map((date, i) => ({
    id: `comida-${slot}-${i}`, date, slot, kind: 'outside', routineId: 'rutina-9',
    origen: 'rutina', participants: [], items: []
  }))));

  const { ok, state } = migrate(viejo);
  assert.ok(ok);
  assert.equal(state.mealRoutines.length, 3, 'una regla por momento');
  assert.ok(state.mealRoutines.some(item => item.id === 'rutina-9'), 'la primera conserva su identificador');

  const porMomento = new Map(state.mealRoutines.map(item => [item.momento, item.id]));
  assert.deepEqual([...porMomento.keys()], ['desayuno', 'almuerzo', 'cena']);
  for (const plan of state.plans) {
    assert.equal(plan.routineId, porMomento.get(plan.slot), `la comida de ${plan.slot} quedó colgando de la regla equivocada`);
  }

  // Y la prueba de fuego: borrar el desayuno no se lleva las cenas.
  deleteRoutine(state, porMomento.get('desayuno'), { comidas: 'quitar', desde: '2026-10-01' });
  assert.equal(state.plans.filter(plan => plan.slot === 'cena').length, 2, 'se llevó las cenas por delante');
  assert.equal(state.plans.filter(plan => plan.slot === 'desayuno').length, 0);
});

test('el andamio de la etapa anterior se cae al convertir, y nada más se mueve', () => {
  const conAndamio = estadoViejo(9, [
    { id: 'regla-1', kind: 'outside', recipeId: null, momento: 'desayuno', slots: ['desayuno'], grupoId: 'regla-1', weekdays: [7], weeks: null, scope: 'permanent', month: null, desde: null, until: null, label: 'Playa', active: true },
    { id: 'regla-2', kind: 'outside', recipeId: null, momento: 'cena', slots: ['cena'], grupoId: 'regla-1', weekdays: [7], weeks: null, scope: 'permanent', month: null, desde: null, until: null, label: 'Playa', active: true }
  ]);
  const { ok, state } = migrate(conAndamio);
  assert.ok(ok);
  assert.equal(state.mealRoutines.length, 2, 'no se junta ni se parte nada');
  for (const item of state.mealRoutines) {
    assert.equal('grupoId' in item, false, 'quedó el campo que ya no lee nadie');
  }
  assert.deepEqual(state.mealRoutines.map(item => [item.id, item.momento]), [['regla-1', 'desayuno'], ['regla-2', 'cena']]);
});

test('convertir dos veces deja exactamente lo mismo', () => {
  const { state } = cocina();
  addRoutines(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7] });
  const una = migrate(state).state;
  const otra = migrate(una).state;
  assert.deepEqual(otra.mealRoutines, una.mealRoutines);
  assert.equal(otra.mealRoutines.length, 3);
});
