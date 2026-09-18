// El plan semanal: siete días, o catorce si se piden, y nada más.
//
// Tres ideas gobiernan este archivo.
//
// 1. **Nunca un mes.** Ni una cuadrícula de treinta y una casillas, ni un
//    porcentaje del mes, ni un botón que lleve a uno. Lo que se mira es la
//    semana en que se está y las de al lado.
//
// 2. **Nada se llena solo.** Ni una comida se pone sin que alguien la ponga.
//    Las semanas que vienen se quedan vacías hasta que alguien las mire, y
//    mirarlas no escribe nada.
//
// 3. **Cambiar el jueves no toca el viernes.** Es la frase entera del encargo, y
//    es lo que hay que poder comprobar de una en una.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addDays, addProduct, anotarComidaSuelta, comidasDecididas, createEmptyState, dateRange,
  deletePlan, makeRecipePlan, origenDe, planFor, reutilizarComida, setAbsence, setStatusPlan, todayISO, updatePlan,
  upsertPerson, upsertRecipe, weekStart, weekdayOf
} from '../src/model.js';
import {
  DIAS_POR_VISTA, SEMANA_ACTIONS, SEMANA_FORMS, emptySemana, modalDia, modalIrAFecha,
  modalPonerEnDias, renderSemana, tituloDePlan
} from '../src/page-semana.js';

// Vaciar un día pregunta antes de tirar nada, y en Node no hay quien conteste.
globalThis.window = { ...(globalThis.window || {}), confirm: () => true };

const HOY = todayISO();
const LUNES = weekStart(HOY);

function contexto(state, extra = {}) {
  const ui = { page: 'semana', modal: null, semana: emptySemana(), ...extra };
  return {
    state, ui,
    commit: () => {}, toast: () => {}, render: () => {}, guardar: () => {},
    closeModal: () => { ui.modal = null; }, openModal: (type, extras) => { ui.modal = { type, ...extras }; },
    startTour: () => {}
  };
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}»`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

// Una casa con tres preparaciones y dos personas.
function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] });
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }], note: 'Majar caliente' });
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo', 'cena'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  const sopa = upsertRecipe(state, { name: 'Sopa', uses: ['almuerzo', 'cena'], items: [], note: '' });
  return { state, mangu: mangu.id, locrio: locrio.id, sopa: sopa.id, arroz, platano };
}

/* ── Siete días, de lunes a domingo ────────────────────────────────────── */

test('la semana empieza en lunes y termina en domingo, venga uno de donde venga', () => {
  // Da igual el día en que se abra la app: la semana es la semana.
  for (const dia of dateRange(LUNES, addDays(LUNES, 6))) {
    assert.equal(weekStart(dia), LUNES, `${dia} debería caer en la semana del ${LUNES}`);
    assert.equal(weekStart(weekStart(dia)), LUNES, 'el lunes de un lunes es él mismo');
  }
  assert.equal(weekdayOf(LUNES), 1);
  assert.equal(weekdayOf(addDays(LUNES, 6)), 7);
});

test('se ven siete días, y catorce cuando se piden', () => {
  const { state } = casa();
  const ctx = contexto(state);

  const una = renderSemana(ctx);
  revisar(una, 'renderSemana (una semana)');
  assert.equal((una.match(/class="card semana-dia/g) || []).length, 7, 'deberían verse siete días');

  SEMANA_ACTIONS['semana-vista']({ dataset: { vista: 'dos' } }, ctx);
  const dos = renderSemana(ctx);
  revisar(dos, 'renderSemana (dos semanas)');
  assert.equal((dos.match(/class="card semana-dia/g) || []).length, 14, 'deberían verse catorce días');
  assert.deepEqual(DIAS_POR_VISTA, { una: 7, dos: 14 });
});

test('nunca hay una cuadrícula del mes', () => {
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno');
  const ctx = contexto(state);
  for (const vista of ['una', 'dos']) {
    SEMANA_ACTIONS['semana-vista']({ dataset: { vista } }, ctx);
    const html = renderSemana(ctx);
    for (const rastro of ['calendar-month', 'month-cell', 'Plan mensual', 'Ver el mes', 'Este mes']) {
      assert.ok(!html.includes(rastro), `la semana enseña «${rastro}», que es del mes`);
    }
  }
});

test('las flechas mueven una semana, aunque se estén viendo dos', () => {
  const { state } = casa();
  const ctx = contexto(state);
  SEMANA_ACTIONS['semana-vista']({ dataset: { vista: 'dos' } }, ctx);

  SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '1' } }, ctx);
  assert.equal(ctx.ui.semana.inicio, addDays(LUNES, 7),
    'viendo dos semanas y pulsando «siguiente» se salta una semana entera si el paso fuera de catorce días');

  SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '-1' } }, ctx);
  assert.equal(ctx.ui.semana.inicio, LUNES);
});

test('se puede ir hacia atrás a mirar lo que ya se comió', () => {
  const { state, locrio } = casa();
  const haceDosSemanas = addDays(LUNES, -14);
  makeRecipePlan(state, locrio, addDays(haceDosSemanas, 2), 'almuerzo', null, null, 'manual');

  const ctx = contexto(state);
  SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '-1' } }, ctx);
  SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '-1' } }, ctx);
  assert.equal(ctx.ui.semana.inicio, haceDosSemanas);

  const html = renderSemana(ctx);
  assert.ok(html.includes('Locrio'), 'no se ve lo que se comió hace dos semanas');
  assert.ok(html.includes('ya-paso'), 'los días pasados deberían verse como pasados');

  // Y volver es un botón, no contar semanas hacia adelante.
  SEMANA_ACTIONS['semana-hoy']({ dataset: {} }, ctx);
  assert.equal(ctx.ui.semana.inicio, LUNES);
});

test('«ir a una fecha» lleva a la semana de ese día, sin abrir ningún mes', () => {
  const { state } = casa();
  const ctx = contexto(state);
  const ventana = modalIrAFecha(ctx);
  revisar(ventana, 'modalIrAFecha');
  assert.ok(ventana.includes('type="date"'), 'debería pedir un día del calendario');
  assert.ok(!ventana.includes('month'), 'no debería pedir un mes');

  const lejos = addDays(LUNES, 40);
  SEMANA_FORMS['ir-a-fecha']({}, new Map([['fecha', lejos]]), ctx);
  assert.equal(ctx.ui.semana.inicio, weekStart(lejos));

  assert.throws(() => SEMANA_FORMS['ir-a-fecha']({}, new Map([['fecha', '']]), ctx), /día/);
});

/* ── Mirar no escribe ──────────────────────────────────────────────────── */

test('mirar una semana no pone ni una comida', () => {
  const { state } = casa();
  const ctx = contexto(state);
  renderSemana(ctx);
  for (let i = 0; i < 5; i += 1) SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '1' } }, ctx);
  renderSemana(ctx);
  SEMANA_ACTIONS['semana-vista']({ dataset: { vista: 'dos' } }, ctx);
  renderSemana(ctx);

  assert.equal(state.plans.length, 0, 'mirar el calendario escribió comidas');
  assert.equal(state.mealRoutines.length, 0, 'mirar el calendario escribió una regla');
  assert.deepEqual(state.monthPlans, {}, 'mirar el calendario abrió un mes');
});

test('las semanas que vienen están vacías, y lo dicen sin reprochar nada', () => {
  const { state } = casa();
  const ctx = contexto(state);
  SEMANA_ACTIONS['semana-mover']({ dataset: { delta: '2' } }, ctx);
  const html = renderSemana(ctx);
  assert.ok(/est[áa]n en blanco/i.test(html), 'una semana vacía debería decir que lo está');
  // Que esté vacía no es un reproche: ni se le pone nota, ni se le llama
  // incompleta, ni se le cuelga un porcentaje en la cara.
  for (const reproche of ['incompleto', 'incompleta', 'te falta', 'te faltan', '0%']) {
    assert.ok(!html.includes(reproche), `una semana vacía dice «${reproche}»`);
  }
  assert.ok(html.includes('data-action="open-meal"'), 'una semana vacía tiene que ofrecer poner una comida');
});

/* ── Las cuatro maneras de anotar una comida ───────────────────────────── */

test('una preparación guardada se pone en cualquiera de los cinco momentos', () => {
  const { state, mangu, locrio, sopa } = casa();
  const desayuno = makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  const almuerzo = makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  const cena = makeRecipePlan(state, sopa, LUNES, 'cena', null, null, 'manual');
  assert.deepEqual([desayuno.kind, almuerzo.kind, cena.kind], ['recipe', 'recipe', 'recipe']);

  const html = renderSemana(contexto(state));
  for (const nombre of ['Mangú', 'Locrio', 'Sopa']) assert.ok(html.includes(nombre), `falta «${nombre}»`);
  assert.ok(html.includes('Majar caliente'), 'la nota de quien cocina no se ve en la semana');
});

test('una comida escrita a mano se anota sin registrar ninguna preparación', () => {
  const { state } = casa();
  const antes = state.recipes.length;
  const puesta = anotarComidaSuelta(state, LUNES, 'cena', { titulo: 'Lo que quedó del sancocho', nota: 'Calentar despacio' });

  assert.equal(puesta.kind, 'suelta');
  assert.equal(puesta.title, 'Lo que quedó del sancocho');
  assert.equal(puesta.note, 'Calentar despacio');
  assert.equal(state.recipes.length, antes, 'una comida suelta NO entra en el catálogo de preparaciones');
  assert.equal(tituloDePlan(puesta), 'Lo que quedó del sancocho', 'una comida escrita a mano tiene que decir su nombre');

  const html = renderSemana(contexto(state));
  assert.ok(html.includes('Lo que quedó del sancocho'), 'la comida escrita no se ve en la semana');
  // Y se lee como una comida, no como un hueco: su fila lleva el nombre, no
  // la clase de las vacías.
  const fila = html.slice(html.indexOf(`data-date="${LUNES}" data-slot="cena"`) - 400, html.indexOf(`data-date="${LUNES}" data-slot="cena"`) + 400);
  assert.ok(!/semana-momento vacio/.test(fila.split('data-slot="cena"')[0].slice(-200)), 'la comida escrita se pinta como un hueco');

  assert.throws(() => anotarComidaSuelta(state, addDays(LUNES, 1), 'cena', { titulo: '  ' }), /Escribe/);
});

test('se puede decir que se come fuera, que se pide, o que todavía no se sabe', () => {
  const { state } = casa();
  for (const [slot, kind] of [['desayuno', 'outside'], ['almuerzo', 'order'], ['cena', 'unplanned']]) {
    setStatusPlan(state, LUNES, slot, kind, null, 'manual');
  }
  const html = renderSemana(contexto(state));
  assert.ok(html.includes('Fuera de casa'));
  assert.ok(html.includes('Pedimos comida'));
  assert.ok(html.includes('Todavía no sabemos'));

  const cuenta = comidasDecididas(state, dateRange(LUNES, LUNES));
  assert.equal(cuenta.fuera, 1);
  assert.equal(cuenta.pedido, 1);
  assert.equal(cuenta.pendientes, 1, '«todavía no sabemos» sigue contando como algo por decidir');
});

/* ── Usar lo que sobró ─────────────────────────────────────────────────── */

test('lo que sobró se come otro día sin que nadie pregunte cuánto', () => {
  const { state, locrio } = casa();
  const original = makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  const sobras = reutilizarComida(state, original.id, addDays(LUNES, 1), 'cena');

  assert.equal(sobras.kind, 'linked');
  assert.equal(sobras.sourceId, original.id);
  assert.deepEqual(sobras.reservedItems, [], 'no se apunta ninguna cantidad');
  assert.deepEqual(sobras.items, [], 'ni ningún alimento');
  assert.equal(sobras.title, original.title);

  // Y borrar la de origen avisa: si no, quedaría una comida colgando de nada.
  // Con una sola dependiente el mensaje dice «una comida que depende»; con
  // varias, «N comidas que dependen». Lo que importa es que no deje borrar.
  assert.throws(() => deletePlan(state, original.id), /depende/);
});

test('lo que sobró se come después, nunca antes', () => {
  const { state, locrio } = casa();
  const original = makeRecipePlan(state, locrio, addDays(LUNES, 3), 'almuerzo', null, null, 'manual');
  assert.throws(() => reutilizarComida(state, original.id, addDays(LUNES, 1), 'cena'), /después/);
  assert.throws(() => reutilizarComida(state, original.id, addDays(LUNES, 3), 'desayuno'), /después/);
  // La cena del mismo día sí: es más tarde.
  assert.ok(reutilizarComida(state, original.id, addDays(LUNES, 3), 'cena'));
});

test('también se puede reutilizar una comida escrita a mano', () => {
  const { state } = casa();
  const suelta = anotarComidaSuelta(state, LUNES, 'cena', { titulo: 'Sancocho' });
  const otra = reutilizarComida(state, suelta.id, addDays(LUNES, 2), 'almuerzo');
  assert.equal(otra.title, 'Sancocho');
  // Pero no una que ya es sobras de otra: encadenarlas no significa nada.
  assert.throws(() => reutilizarComida(state, otra.id, addDays(LUNES, 4), 'cena'), /Elige una comida/);
});

/* ── Cambiar un día no toca los demás ──────────────────────────────────── */

test('cambiar el almuerzo de mañana deja intactos los demás días', () => {
  const { state, locrio, sopa } = casa();
  const dias = dateRange(LUNES, addDays(LUNES, 6));
  for (const date of dias) makeRecipePlan(state, locrio, date, 'almuerzo', null, null, 'manual');

  const manana = dias[1];
  const antes = state.plans.map(plan => ({ id: plan.id, date: plan.date, slot: plan.slot, title: plan.title }));

  // Se quita el de ese día y se pone otro. Es lo que hace la pantalla.
  deletePlan(state, planFor(state, manana, 'almuerzo').id);
  makeRecipePlan(state, sopa, manana, 'almuerzo', null, null, 'manual');

  assert.equal(planFor(state, manana, 'almuerzo').title, 'Sopa');
  for (const otro of dias.filter(date => date !== manana)) {
    assert.equal(planFor(state, otro, 'almuerzo').title, 'Locrio', `${otro} cambió y no debería`);
    const original = antes.find(plan => plan.date === otro && plan.slot === 'almuerzo');
    assert.equal(planFor(state, otro, 'almuerzo').id, original.id, `${otro} se volvió a crear`);
  }
  assert.equal(state.plans.length, 7, 'el número de comidas cambió');
});

test('editar el nombre y la nota de una comida vale solo para ese día', () => {
  const { state, locrio } = casa();
  makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  const otro = makeRecipePlan(state, locrio, addDays(LUNES, 1), 'almuerzo', null, null, 'manual');
  const plan = planFor(state, LUNES, 'almuerzo');

  updatePlan(state, plan.id, { title: 'Locrio de pollo', note: 'Con más achiote', participants: plan.participants, items: plan.items });
  assert.equal(planFor(state, LUNES, 'almuerzo').title, 'Locrio de pollo');
  assert.equal(planFor(state, addDays(LUNES, 1), 'almuerzo').title, 'Locrio', 'se cambió también el día siguiente');
  assert.equal(otro.note, '', 'se cambió la nota del día siguiente');

  // Y una comida escrita a mano también se puede editar.
  const suelta = anotarComidaSuelta(state, addDays(LUNES, 2), 'cena', { titulo: 'Sancocho' });
  updatePlan(state, suelta.id, { title: 'Sancocho de res', note: '', participants: [], items: [] });
  assert.equal(planFor(state, addDays(LUNES, 2), 'cena').title, 'Sancocho de res');
});

/* ── Poner una comida en varios días, marcándolos a mano ───────────────── */

test('la ventana de varios días ofrece los días que se están viendo, y ninguno más', () => {
  const { state } = casa();
  const ctx = contexto(state);

  const siete = modalPonerEnDias(ctx, {});
  revisar(siete, 'modalPonerEnDias (una semana)');
  assert.equal((siete.match(/name="fechas"/g) || []).length, 7, 'viendo una semana deberían ofrecerse siete días');
  assert.ok(!/weekdays|scope|permanent|semanalmente|todos los lunes/i.test(siete), 'la ventana volvió a preguntar por una costumbre');
  assert.ok(siete.includes('No se repetirá sola'));

  SEMANA_ACTIONS['semana-vista']({ dataset: { vista: 'dos' } }, ctx);
  const catorce = modalPonerEnDias(ctx, {});
  assert.equal((catorce.match(/name="fechas"/g) || []).length, 14, 'viendo dos semanas deberían ofrecerse catorce');
});

test('pone las comidas en los días marcados y en ninguno más', () => {
  const { state, locrio } = casa();
  const ctx = contexto(state);
  const marcados = [LUNES, addDays(LUNES, 2), addDays(LUNES, 4)];
  const form = { querySelectorAll: () => marcados.map(value => ({ value })) };

  SEMANA_FORMS['poner-en-dias'](form, new Map([['kind', 'recipe'], ['momento', 'almuerzo'], ['recipeId', locrio], ['modo', 'vacios']]), ctx);

  assert.equal(state.plans.length, 3);
  for (const date of marcados) assert.equal(planFor(state, date, 'almuerzo').title, 'Locrio');
  assert.equal(planFor(state, addDays(LUNES, 1), 'almuerzo'), undefined, 'se puso una comida en un día que nadie marcó');
  assert.equal(state.mealRoutines.length, 0, 'se guardó una costumbre');
  assert.ok(ctx.ui.semana.deshacer, 'debería poder deshacerse');
});

test('sin días marcados, o sin momento, no se pone nada', () => {
  const { state, locrio } = casa();
  const ctx = contexto(state);
  const vacio = { querySelectorAll: () => [] };
  assert.throws(() => SEMANA_FORMS['poner-en-dias'](vacio, new Map([['kind', 'recipe'], ['momento', 'almuerzo'], ['recipeId', locrio]]), ctx), /al menos un día/);
  assert.throws(() => SEMANA_FORMS['poner-en-dias'](vacio, new Map([['kind', 'recipe'], ['momento', '']]), ctx), /comida del día/);
  assert.throws(() => SEMANA_FORMS['poner-en-dias'](vacio, new Map([['kind', 'recipe'], ['momento', 'cena'], ['recipeId', '']]), ctx), /preparación/);
  assert.equal(state.plans.length, 0);
});

// Poner en varios días es la única ayuda que queda, y la que más daño puede
// hacer: pisar sin querer una semana entera que alguien ya había pensado.
test('lo que ya estaba puesto no se pisa sin permiso, y con permiso sí', () => {
  const { state, locrio, sopa } = casa();
  const ctx = contexto(state);
  makeRecipePlan(state, locrio, addDays(LUNES, 1), 'cena', null, null, 'manual');
  const marcar = fechas => ({ querySelectorAll: () => fechas.map(value => ({ value })) });

  SEMANA_FORMS['poner-en-dias'](marcar([LUNES, addDays(LUNES, 1)]),
    new Map([['kind', 'recipe'], ['momento', 'cena'], ['recipeId', sopa], ['modo', 'vacios']]), ctx);
  assert.equal(planFor(state, addDays(LUNES, 1), 'cena').title, 'Locrio', 'se pisó una comida que ya estaba');
  assert.equal(planFor(state, LUNES, 'cena').title, 'Sopa', 'el día que estaba libre se quedó vacío');
  assert.ok(ctx.ui.semana.aviso.detalle.includes('1 se dejaron como estaban'), `dijo «${ctx.ui.semana.aviso?.detalle}»`);

  SEMANA_FORMS['poner-en-dias'](marcar([addDays(LUNES, 1)]),
    new Map([['kind', 'recipe'], ['momento', 'cena'], ['recipeId', sopa], ['modo', 'reemplazar']]), ctx);
  assert.equal(planFor(state, addDays(LUNES, 1), 'cena').title, 'Sopa', 'con permiso tiene que reemplazarse');

  // Y lo último se deshace entero, no a medias.
  SEMANA_ACTIONS['semana-deshacer']({ dataset: {} }, ctx);
  assert.equal(planFor(state, addDays(LUNES, 1), 'cena').title, 'Locrio', 'deshacer no devolvió la comida que se pisó');
  assert.equal(ctx.ui.semana.deshacer, null, 'se puede deshacer dos veces lo mismo');
});

test('se puede marcar «fuera de casa» en varios días sin elegir ninguna preparación', () => {
  const { state } = casa();
  const ctx = contexto(state);
  const dias = [addDays(LUNES, 3), addDays(LUNES, 4)];
  SEMANA_FORMS['poner-en-dias']({ querySelectorAll: () => dias.map(value => ({ value })) },
    new Map([['kind', 'outside'], ['momento', 'almuerzo'], ['recipeId', '']]), ctx);

  for (const date of dias) assert.equal(planFor(state, date, 'almuerzo').kind, 'outside');
  assert.equal(planFor(state, addDays(LUNES, 5), 'almuerzo'), undefined, 'el día de en medio no se marcó');
});

test('lo puesto de varias en varias sigue siendo un cambio manual, no una costumbre', () => {
  // Poner la misma cena en cinco días es una decisión de una persona, para esos
  // días. Llamarla «rutina» prometería que se repite sola el mes que viene.
  const { state, locrio } = casa();
  const ctx = contexto(state);
  const dias = [LUNES, addDays(LUNES, 2)];
  SEMANA_FORMS['poner-en-dias']({ querySelectorAll: () => dias.map(value => ({ value })) },
    new Map([['kind', 'recipe'], ['momento', 'almuerzo'], ['recipeId', locrio], ['modo', 'vacios']]), ctx);

  for (const date of dias) {
    const puesta = planFor(state, date, 'almuerzo');
    assert.equal(origenDe(puesta), 'manual', `la comida del ${date} no dice de dónde vino`);
    assert.equal(puesta.routineId, null, 'quedó colgando de una regla que no existe');
  }
  assert.ok(ctx.ui.semana.aviso.titulo.includes('2 comidas puestas'), `dijo «${ctx.ui.semana.aviso?.titulo}»`);
  assert.ok(ctx.ui.semana.aviso.detalle.includes('no se repetirá solo'), 'no promete lo único que hace falta prometer');
  assert.equal(ctx.ui.modal, null, 'la ventana se queda abierta después de poner');
});

test('desde una preparación, la ventana abre con esa preparación puesta', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  SEMANA_ACTIONS['semana-poner-en-dias']({ dataset: { receta: mangu, slot: 'desayuno', kind: 'recipe' } }, ctx);
  assert.equal(ctx.ui.modal.type, 'poner-en-dias');
  assert.equal(ctx.ui.modal.receta, mangu, 'no se llevó la preparación que ya se había elegido');
  assert.equal(ctx.ui.modal.slot, 'desayuno', 'vuelve a preguntar un momento que ya estaba contestado');

  const html = modalPonerEnDias(ctx, ctx.ui.modal);
  assert.ok(html.includes(`value="${mangu}" selected`), 'la ventana abre sin la preparación marcada');
  assert.ok(html.includes('value="desayuno" checked'));
});

/* ── El día entero ─────────────────────────────────────────────────────── */

test('marcar un día entero fuera respeta las meriendas que alguien puso', () => {
  const { state, mangu, locrio, sopa } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  const merienda = anotarComidaSuelta(state, LUNES, 'merienda-tarde', { titulo: 'Galletas' });

  const ctx = contexto(state);
  SEMANA_ACTIONS['semana-dia-fuera']({ dataset: { date: LUNES } }, ctx);

  for (const slot of ['desayuno', 'almuerzo', 'cena']) {
    assert.equal(planFor(state, LUNES, slot).kind, 'outside', `${slot} debería quedar fuera`);
  }
  assert.equal(planFor(state, LUNES, 'merienda-tarde').id, merienda.id, 'la merienda a mano no se toca');
  assert.ok(ctx.ui.semana.deshacer, 'debería poder deshacerse');

  SEMANA_ACTIONS['semana-deshacer']({ dataset: {} }, ctx);
  assert.equal(planFor(state, LUNES, 'desayuno').title, 'Mangú', 'deshacer no devolvió el día');
  assert.equal(ctx.ui.semana.deshacer, null, 'no se puede deshacer dos veces');
});

test('la ventana de un día enseña sus cinco momentos y lo que se puede hacer con él', () => {
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  const html = modalDia(contexto(state), { date: LUNES });
  revisar(html, 'modalDia');
  assert.ok(html.includes('semana-dia-fuera'), 'falta marcar el día entero fuera');
  assert.ok(html.includes('semana-dia-vaciar'), 'falta vaciar el día');
});

test('vaciar el día se lo lleva todo, meriendas incluidas: eso sí se pidió', () => {
  const { state, mangu, locrio } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  anotarComidaSuelta(state, LUNES, 'merienda-tarde', { titulo: 'Galletas' });
  const ctx = contexto(state);

  SEMANA_ACTIONS['semana-dia-vaciar']({ dataset: { date: LUNES } }, ctx);
  for (const slot of ['desayuno', 'merienda-manana', 'almuerzo', 'merienda-tarde', 'cena']) {
    assert.equal(planFor(state, LUNES, slot), undefined, `${slot} sigue puesto después de vaciar el día`);
  }
  assert.ok(ctx.ui.semana.deshacer, 'vaciar un día entero tiene que poder deshacerse');
  SEMANA_ACTIONS['semana-deshacer']({ dataset: {} }, ctx);
  assert.equal(planFor(state, LUNES, 'merienda-tarde').title, 'Galletas', 'deshacer no devolvió la merienda');
});

test('un día sin nada que vaciar no ofrece vaciarlo, y la ventana no se cae', () => {
  const { state } = casa();
  const ctx = contexto(state);
  const html = modalDia(ctx, { date: addDays(LUNES, 5) });
  revisar(html, 'modalDia (día vacío)');
  assert.ok(!html.includes('semana-dia-vaciar'), 'ofrece vaciar un día que ya está vacío');
  SEMANA_ACTIONS['semana-dia-vaciar']({ dataset: { date: addDays(LUNES, 5) } }, ctx);
  assert.equal(ctx.ui.semana.deshacer, null, 'vaciar la nada dejó algo que deshacer');
});

/* ── De dónde salió cada comida ────────────────────────────────────────────

   Delante de un jueves con locrio nadie se atreve a tocar nada si no sabe si lo
   puso él o si vino de un respaldo de cuando la app decidía sola. */

test('la semana marca de dónde vino cada comida, con su nombre escrito', () => {
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  setStatusPlan(state, LUNES, 'almuerzo', 'outside');
  const html = renderSemana(contexto(state));

  assert.ok(html.includes('origen-punto origen-manual'), 'la semana no marca el origen de lo que puso una persona');
  assert.ok(html.includes('origen-punto origen-excepcion'), 'ni el de lo que se sale de lo normal');
  // Un color sin nombre no dice nada: el punto lleva su etiqueta escrita.
  assert.ok(html.includes('title="Cambio manual"'), 'el punto de color no dice qué significa');
  assert.ok(html.includes('title="Excepción"'));
  // Y un hueco no lleva punto ninguno: lo que nadie puso no vino de ninguna parte.
  assert.ok(!/origen-punto origen-null/.test(html));
});

test('las ausencias se explican en el día, sin prometer que encogen la olla', () => {
  const { state, locrio } = casa();
  makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  const ana = state.people[0];
  setAbsence(state, LUNES, 'almuerzo', ana.id, true);

  const html = modalDia(contexto(state), { date: LUNES });
  revisar(html, 'modalDia con una ausencia');
  assert.ok(html.includes(ana.name), 'la ventana del día no dice quién no come en casa');
  assert.ok(html.includes('no cambia lo que se cocina'), 'no dice que marcar a alguien fuera no encoge la olla');
});

/* ── Las meriendas no son un reproche ──────────────────────────────────── */

test('una merienda vacía no cuenta como hueco ni ocupa una fila', () => {
  const { state, mangu, locrio, sopa } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  makeRecipePlan(state, locrio, LUNES, 'almuerzo', null, null, 'manual');
  makeRecipePlan(state, sopa, LUNES, 'cena', null, null, 'manual');

  const cuenta = comidasDecididas(state, dateRange(LUNES, LUNES));
  assert.equal(cuenta.pendientes, 0, 'un día sin merienda está completo');
  assert.equal(cuenta.huecos, 3, 'los huecos son tres al día, no cinco');

  const ctx = contexto(state);
  const html = renderSemana(ctx);
  assert.ok(html.includes('Anotar una merienda'), 'debería poder anotarse una merienda');
  assert.ok(!/Merienda de mañana<\/span>\s*<span class="semana-momento-texto">Sin decidir/.test(html),
    'una merienda vacía no puede ocupar una fila diciendo «sin decidir»');
});

test('una merienda puesta se ve, y sigue sin contar como obligatoria', () => {
  const { state } = casa();
  anotarComidaSuelta(state, LUNES, 'merienda-manana', { titulo: 'Fruta' });
  const cuenta = comidasDecididas(state, dateRange(LUNES, LUNES));
  assert.equal(cuenta.meriendas, 1);
  assert.equal(cuenta.huecos, 3, 'la merienda no añade un hueco');
  assert.equal(cuenta.pendientes, 3, 'las tres de siempre siguen por decidir');
  assert.ok(renderSemana(contexto(state)).includes('Fruta'));
});

/* ── Lo que la app no hace ─────────────────────────────────────────────── */

test('la pantalla no ofrece copiar una semana ni repetir nada', () => {
  const { state, locrio } = casa();
  for (const date of dateRange(LUNES, addDays(LUNES, 6))) makeRecipePlan(state, locrio, date, 'almuerzo', null, null, 'manual');
  const html = renderSemana(contexto(state));
  for (const prohibido of ['Copiar la semana', 'Repetir', 'semana pasada', 'rutina', 'Rutina', 'se llena solo', 'Sugerida']) {
    assert.ok(!html.includes(prohibido), `la semana ofrece «${prohibido}»`);
  }
  assert.ok(!Object.keys(SEMANA_ACTIONS).some(accion => /copiar|repetir|rutina|sugerir/i.test(accion)),
    'hay una acción de copiar o repetir en el plan semanal');
});

test('el modelo no exporta nada que llene el calendario solo', async () => {
  const modelo = await import('../src/model.js');
  for (const nombre of ['generateMonth', 'repeatWeek', 'applyRoutine', 'applyRoutines', 'openMonth', 'copyPatternFromMonth', 'monthProgress', 'linkPlan']) {
    assert.equal(modelo[nombre], undefined, `«${nombre}» volvió al modelo`);
  }
});

/* ── Lo que el plan dejó de preguntar ──────────────────────────────────────

   Esta venía de las pruebas del mes, y vigila lo que no puede volver: planificar
   es decidir qué se come. Las cifras de la canasta, las existencias y la lista
   de lo que faltaría comprar convertían «ya está mi semana» en «ahora repasa el
   inventario», que es donde se abandonaba. */

test('el plan semanal no pregunta por cantidades, existencias ni compra', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-semana.js'), 'utf8');
  for (const muerta of ['function bloqueCanasta(', 'function bloqueCompra(', 'function cambiosEnLaCompra(', 'function seccionCanasta(']) {
    assert.ok(!codigo.includes(muerta), `volvió al plan: ${muerta}`);
  }
  assert.ok(!/monthBasketSummary\(/.test(codigo), 'el plan vuelve a contar la canasta');
  assert.ok(!/inventoryNow\(/.test(codigo), 'el plan vuelve a mirar las existencias');
  assert.ok(!/balances\(/.test(codigo), 'el plan vuelve a mirar los saldos de la despensa');
  assert.ok(!/effectiveBasket\(|habitualLines\(/.test(codigo), 'el plan vuelve a leer la canasta de la casa');

  // Y tampoco en la pantalla: ni una cifra de libras ni una lista de faltantes.
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, LUNES, 'desayuno', null, null, 'manual');
  const ctx = contexto(state);
  const pantallas = [['una semana', renderSemana(ctx)]];
  SEMANA_ACTIONS['semana-vista']({ dataset: { vista: 'dos' } }, ctx);
  pantallas.push(['dos semanas', renderSemana(ctx)]);
  pantallas.push(['el día', modalDia(ctx, { date: LUNES })]);
  pantallas.push(['poner en varios días', modalPonerEnDias(ctx, {})]);

  for (const [donde, html] of pantallas) {
    const limpio = html.replace(/<[^>]*>/g, ' ');
    for (const palabra of ['existencias', 'inventario', 'te queda', 'lista de compra']) {
      assert.ok(!new RegExp(palabra, 'i').test(limpio), `«${donde}» vuelve a hablar de «${palabra}»`);
    }
  }
});
