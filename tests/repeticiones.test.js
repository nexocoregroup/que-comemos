// De la ficha de una preparación a la costumbre de una casa.
//
// Son dos cosas y ahora se ven como dos. La ficha dice qué es el plato y en qué
// momentos **puede** comerse; la regla dice cuándo **se pone**, y hay una por
// momento. El camino entre las dos —«Hacer que se repita»— tiene que llevar de
// la mano lo que ya se sabe: la preparación, y el momento si viene de una comida
// ya puesta en el calendario. Volver a preguntarlo es lo que hacía que la gente
// se perdiera entre dos pantallas.
//
// Y el ejemplo que manda: mangú los lunes de desayuno y los viernes de cena.
// Dos reglas, dos filas, dos botones de editar y dos de quitar.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MOMENTOS, addProduct, createEmptyState, makeRecipePlan, upsertPerson, upsertRecipe } from '../src/model.js';
import { addRoutine, applyRoutine, pausarRegla, regla, reglasDePreparacion } from '../src/routines.js';
import { MES_ACTIONS, MES_FORMS, emptyMes, modalRutina, renderMes } from '../src/page-mes.js';
import { emptyMas, renderMas } from '../src/page-mas.js';

const MES = '2026-10';
const LUNES = 1, VIERNES = 5;

globalThis.window = { ...(globalThis.window || {}), confirm: () => true };

function contexto(state, extra = {}) {
  const ui = { page: 'mes', modal: null, mes: emptyMes(MES), mas: emptyMas(), ...extra };
  const ctx = {
    state, ui, avisos: [],
    commit: mensaje => { if (mensaje) ctx.avisos.push(mensaje); },
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {}, guardar: () => {},
    closeModal: () => { ui.modal = null; },
    openModal: (type, extras) => { ui.modal = { type, ...extras }; },
    startTour: () => {},
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
  return ctx;
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}»`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

function casa() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [{ productId: platano }] }).id;
  return { state, mangu, platano };
}

/* ── La ventana de una regla pregunta UN momento ───────────────────────── */

test('la ventana pide un solo momento, con botones de uno solo', () => {
  const { state } = casa();
  const html = modalRutina(contexto(state), { month: MES });
  revisar(html, 'ventana de una regla');
  assert.ok(html.includes('type="radio" name="momento"'), 'sigue pidiendo varios momentos a la vez');
  assert.ok(!/name="slots"/.test(html), 'quedó la lista de momentos');
  // Los cinco momentos están, meriendas incluidas.
  for (const momento of MOMENTOS) {
    assert.ok(html.includes(`value="${momento.id}"`), `falta ${momento.etiqueta}`);
  }
  // Y se explica por qué es uno solo.
  assert.ok(/los lunes de desayuno y los viernes de cena/.test(html));
});

test('sin momento no se guarda, y se dice cuál falta', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  const form = {
    dataset: { month: MES, id: '' },
    querySelectorAll: () => [],
    querySelector: selector => (selector === '[data-dias-sueltos]' ? { hidden: true } : null)
  };
  const datos = new Map([['kind', 'recipe'], ['recipeId', mangu], ['momento', '']]);
  assert.throws(() => MES_FORMS.rutina(form, datos, ctx), /comida del día/);
  assert.equal(state.mealRoutines.length, 0);
});

test('la ventana ofrece añadir otra repetición, y editando no', () => {
  const { state, mangu } = casa();
  const nueva = modalRutina(contexto(state), { month: MES, receta: mangu });
  assert.ok(nueva.includes('name="otra" value="1"'), 'no se puede encadenar una segunda regla');
  assert.ok(nueva.includes('Guardar y añadir otra repetición'));

  const existente = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const editando = modalRutina(contexto(state), { month: MES, id: existente.id });
  assert.ok(!editando.includes('name="otra"'), 'editar una regla no es añadir otra');
});

/* ── Lo que ya se sabe no se vuelve a preguntar ────────────────────────── */

test('desde una preparación, la ventana abre con esa preparación puesta', () => {
  const { state, mangu } = casa();
  const html = modalRutina(contexto(state), { month: MES, receta: mangu });
  revisar(html, 'ventana desde una preparación');
  assert.ok(new RegExp(`value="${mangu}" selected`).test(html), 'la preparación no viene elegida');
});

test('desde una comida ya puesta, la ventana abre con preparación y momento', () => {
  const { state, mangu } = casa();
  const plan = makeRecipePlan(state, mangu, '2026-10-05', 'desayuno', null);
  const ctx = contexto(state);

  // Es lo que hace el botón de la comida: manda la preparación y el momento.
  MES_ACTIONS['mes-nueva-rutina']({ dataset: { receta: plan.recipeId, slot: plan.slot } }, ctx);
  assert.equal(ctx.ui.modal.type, 'rutina');
  assert.equal(ctx.ui.modal.receta, mangu);
  assert.equal(ctx.ui.modal.slot, 'desayuno');

  const html = modalRutina(ctx, ctx.ui.modal);
  revisar(html, 'ventana desde una comida');
  assert.ok(new RegExp(`value="${mangu}" selected`).test(html));
  assert.ok(/name="momento" value="desayuno" checked/.test(html), 'el momento de la comida no viene marcado');
});

/* ── Editar, pausar y quitar cada regla por separado ───────────────────── */

test('cada regla trae sus tres botones, y son suyos', () => {
  const { state, mangu } = casa();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const cenas = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES] });

  const html = renderMes(contexto(state));
  revisar(html, 'plan mensual con dos reglas');
  for (const item of [desayunos, cenas]) {
    for (const accion of ['open-routine', 'regla-pausar', 'mes-borrar-rutina']) {
      assert.ok(html.includes(`data-action="${accion}" data-id="${item.id}"`), `falta «${accion}» para la regla de ${item.momento}`);
    }
  }
  assert.ok(html.includes('Desayuno ·'), 'no dice de qué momento es cada regla');
  assert.ok(html.includes('Cena ·'));
});

test('pausar deja la regla a la vista, con su botón de reanudar', () => {
  const { state, mangu } = casa();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  const ctx = contexto(state);

  MES_ACTIONS['regla-pausar']({ dataset: { id: desayunos.id } }, ctx);
  assert.equal(regla(state, desayunos.id).active, false);
  const html = renderMes(ctx);
  revisar(html, 'plan mensual con una regla en pausa');
  assert.ok(html.includes('en pausa'));
  assert.ok(html.includes(`data-action="regla-reanudar" data-id="${desayunos.id}"`), 'no hay forma de reanudarla');
  assert.ok(!html.includes(`data-action="regla-pausar" data-id="${desayunos.id}"`));

  MES_ACTIONS['regla-reanudar']({ dataset: { id: desayunos.id } }, ctx);
  assert.equal(regla(state, desayunos.id).active, true);
});

/* ── La tarjeta de la preparación ──────────────────────────────────────── */

function enPreparaciones(state) {
  const ctx = contexto(state, { page: 'preparaciones' });
  ctx.ui.mas.page = 'preparaciones';
  return renderMas({ ...ctx, ui: { ...ctx.ui, page: 'preparaciones' } });
}

test('la tarjeta enseña sus dos reglas y el camino para añadir otra', () => {
  const { state, mangu } = casa();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES] });
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES] });

  const html = enPreparaciones(state);
  revisar(html, 'preparaciones con dos reglas');
  assert.ok(html.includes('Todos los lunes'), 'no dice cuándo se repite la primera');
  assert.ok(html.includes('Todos los viernes'));
  assert.ok(html.includes('+ Añadir otra repetición'));
  assert.ok(html.includes(`data-action="mes-nueva-rutina" data-receta="${mangu}"`), 'no lleva la preparación a la ventana de la regla');
  assert.equal(reglasDePreparacion(state, mangu).length, 2);
});

test('una preparación sin reglas lo dice, y ofrece hacer que se repita', () => {
  const { state, mangu } = casa();
  const html = enPreparaciones(state);
  revisar(html, 'preparaciones sin reglas');
  assert.ok(html.includes('Todavía no se repite sola'));
  assert.ok(html.includes('Hacer que se repita'));
  assert.ok(!html.includes('+ Añadir otra repetición'));
});

test('la misma ficha sale en sus dos momentos sin duplicarse', () => {
  const { state, mangu } = casa();
  const html = enPreparaciones(state);
  // Una vez por bloque —Desayunos y Cenas— y ninguna más: son dos vistas del
  // mismo registro, no dos registros.
  assert.equal((html.match(/Mangú con salami/g) || []).length, 2);
  assert.equal(state.recipes.length, 1);
  assert.equal((html.match(new RegExp(`data-action="open-recipe" data-id="${mangu}"`, 'g')) || []).length, 2);
  // Y las meriendas siguen teniendo su bloque, aunque estén vacías.
  assert.ok(html.includes('Meriendas de mañana'));
  assert.ok(html.includes('Meriendas de tarde'));
});

test('la tarjeta ya no promete porciones que la ficha no pregunta', () => {
  const { state, mangu } = casa();
  state.recipes[0].servings = 6;
  const html = enPreparaciones(state);
  assert.ok(!/6 porciones/.test(html), 'sigue enseñando un dato que ya no se puede escribir');
  assert.equal(state.recipes[0].servings, 6, 'pero el dato no se borra: se conserva de cuando se preguntaba');
});

/* ── El ejemplo entero, de punta a punta ───────────────────────────────── */

test('el mangú de los lunes y el de los viernes, escritos desde la pantalla', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);

  // Lo que hace el formulario, con las piezas del formulario.
  const enviar = (momento, dia, otra) => {
    const marcadas = { weekdays: [{ value: String(dia) }] };
    const form = {
      dataset: { month: MES, id: '' },
      querySelectorAll: selector => (selector === '[name="weekdays"]:checked' ? marcadas.weekdays : []),
      querySelector: selector => (selector === '[data-dias-sueltos]' ? { hidden: true } : null)
    };
    const datos = new Map([
      ['kind', 'recipe'], ['recipeId', mangu], ['momento', momento],
      ['weeks', 'todas'], ['scope', 'permanent'], ['modo', 'vacios'], ['otra', otra ? '1' : '']
    ]);
    MES_FORMS.rutina(form, datos, ctx);
  };

  enviar('desayuno', LUNES, true);
  // «Guardar y añadir otra repetición» deja la ventana abierta con el plato.
  assert.equal(ctx.ui.modal?.type, 'rutina');
  assert.equal(ctx.ui.modal.receta, mangu, 'no conservó la preparación para la siguiente');

  enviar('cena', VIERNES, false);
  assert.equal(ctx.ui.modal, null, 'la segunda cierra la ventana');

  assert.equal(reglasDePreparacion(state, mangu).length, 2);
  const puestas = state.plans.filter(plan => plan.recipeId === mangu);
  assert.ok(puestas.length > 0);
  for (const plan of puestas) {
    const dia = new Date(`${plan.date}T12:00:00`).getDay() || 7;
    if (plan.slot === 'desayuno') assert.equal(dia, LUNES);
    else if (plan.slot === 'cena') assert.equal(dia, VIERNES);
    else assert.fail(`el mangú apareció en «${plan.slot}»`);
  }
});

/* ── Las alergias que no se pueden comprobar ───────────────────────────── */

test('con alguien que evita algo, una preparación sin alimentos lo dice', () => {
  const state = createEmptyState();
  upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [] });
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  const html = enPreparaciones(state);
  revisar(html, 'preparación sin alimentos con una alergia en casa');
  assert.ok(/no ha revisado/.test(html));
});
