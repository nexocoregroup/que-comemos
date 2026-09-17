import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// El plan mensual, ya sin máquina: se pone lo que se quiere comer, el día que se
// quiere comerlo.
//
// Dos ideas gobiernan este archivo.
//
// 1. Nada se llena solo. La única ayuda que queda —«poner una comida en varios
//    días»— pone lo que se le marca y no vuelve a ejecutarse nunca. Un mes se
//    cierra con huecos, porque un hueco es una comida sin decidir, no un error,
//    y una merienda vacía no es ni eso.
//
// 2. Un calendario lleno tiene que decir quién lo llenó. Delante de un martes
//    con mangú nadie se atreve a tocar nada si no sabe si lo puso él o si vino
//    de un respaldo de cuando la app decidía sola.

import {
  ORIGENES, ORIGENES_IDS, addProduct, createEmptyState, deletePlan, etiquetaDeOrigen,
  makeRecipePlan, monthProgress, origenDe, planFor, setHabitualBasket, setMonthChange, setStatusPlan,
  updatePlan, upsertRecipe, habitualLines, monthChanges
} from '../src/model.js';
import { migrate, SCHEMA_VERSION } from '../src/migrate.js';
import { MES_ACTIONS, MES_FORMS, emptyMes, modalDia, modalPonerEnDias, renderMes } from '../src/page-mes.js';
import { ENTRADAS_MAS, GRUPOS_MAS, PAGINAS_MAS, emptyMas, renderMas } from '../src/page-mas.js';

const MES = '2026-10';

// Vaciar un día pregunta antes de tirar nada, y en Node no hay quien conteste.
globalThis.window = { ...(globalThis.window || {}), confirm: () => true };

function contexto(state, extra = {}) {
  const ui = { page: 'mes', modal: null, mes: emptyMes(MES), mas: emptyMas(), ...extra };
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

// Una casa con dos preparaciones y su canasta escrita.
function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 10, unit: 'lb' }, { productId: platano, quantity: 30, unit: 'unidad' }]);
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }], note: '' });
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo', 'cena'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  const sopa = upsertRecipe(state, { name: 'Sopa', uses: ['almuerzo', 'cena'], items: [{ productId: arroz, quantity: 1, unit: 'lb' }], note: '' });
  return { state, arroz, platano, mangu: mangu.id, locrio: locrio.id, sopa: sopa.id };
}

// El formulario de «poner en varios días», con las piezas que le llegan desde la
// pantalla: las casillas marcadas y lo contestado en cada pregunta.
function ponerEnDias(ctx, { fechas, momento, kind = 'recipe', recipeId = '', modo = 'vacios', month = MES }) {
  const form = {
    dataset: { month },
    querySelectorAll: selector => (selector === '[name="fechas"]:checked' ? fechas.map(value => ({ value })) : [])
  };
  const datos = new Map([['kind', kind], ['recipeId', recipeId], ['momento', momento], ['modo', modo]]);
  return MES_FORMS['poner-en-dias'](form, datos, ctx);
}

/* ── Dos caras, no siete pantallas ─────────────────────────────────────── */

test('el resumen y el calendario se dibujan con datos y también con un estado vacío', () => {
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  for (const conDatos of [state, createEmptyState()]) {
    const ctx = contexto(conDatos);
    for (const vista of ['resumen', 'calendario']) {
      ctx.ui.mes.vista = vista;
      revisar(renderMes(ctx), `la vista «${vista}»`);
    }
    revisar(modalDia(ctx, { date: `${MES}-05` }), 'la ventana del día');
    revisar(modalPonerEnDias(ctx, { month: MES }), 'la ventana de poner en varios días');
  }
});

test('un mes en blanco lo dice y ofrece por dónde empezar, sin llenarse solo', () => {
  const { state } = casa();
  const ctx = contexto(state);
  const html = renderMes(ctx);
  assert.ok(html.includes('está en blanco'), 'un mes vacío no dice que lo está');
  assert.ok(html.includes('Empezar a planificar'));
  assert.equal(state.plans.length, 0, 'mirar el mes puso comidas que nadie pidió');
  assert.deepEqual(state.mealRoutines, [], 'mirar el mes escribió una costumbre');
});

test('ninguna pantalla del mes habla en técnico', () => {
  // «Instancia», «override» y «sincronización» son palabras de quien escribió el
  // programa, no de quien cocina. Aquí no pintan nada.
  const { state, mangu, locrio } = casa();
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  makeRecipePlan(state, locrio, `${MES}-05`, 'almuerzo');
  setStatusPlan(state, `${MES}-11`, 'almuerzo', 'outside');
  const ctx = contexto(state);
  const pantallas = [['resumen', renderMes(ctx)]];
  ctx.ui.mes.vista = 'calendario';
  pantallas.push(['calendario', renderMes(ctx)]);
  pantallas.push(['día', modalDia(ctx, { date: `${MES}-05` })]);
  pantallas.push(['poner en varios días', modalPonerEnDias(ctx, { month: MES })]);

  for (const [donde, html] of pantallas) {
    const limpio = html.replace(/<[^>]*>/g, ' ');
    for (const palabra of ['instancia', 'override', 'sincroniza', 'slot', 'schema', 'payload', 'commit']) {
      assert.ok(!new RegExp(`\\b${palabra}`, 'i').test(limpio), `«${donde}» dice «${palabra}» en pantalla`);
    }
  }
});

/* ── Se mira el mes con huecos ─────────────────────────────────────────── */

test('un mes sin ninguna merienda está al cien por cien y lo dice', () => {
  const { state, mangu, locrio } = casa();
  for (let dia = 1; dia <= 31; dia++) {
    const fecha = `${MES}-${String(dia).padStart(2, '0')}`;
    makeRecipePlan(state, mangu, fecha, 'desayuno');
    makeRecipePlan(state, locrio, fecha, 'almuerzo');
    makeRecipePlan(state, locrio, fecha, 'cena');
  }
  const progreso = monthProgress(state, MES);
  assert.equal(progreso.pendientes, 0);
  assert.equal(progreso.meriendas, 0);
  assert.equal(progreso.porcentaje, 100, 'sin meriendas el mes no está incompleto');

  const html = renderMes(contexto(state));
  assert.ok(html.includes('No queda ningún hueco'), 'no dice que el mes está completo');
  assert.ok(!/sin decidir<\/div>/.test(html), 'sigue avisando de huecos que no existen');
});

test('las comidas que faltan se listan de doce en doce, y las meriendas no cuentan', () => {
  const { state } = casa();
  setStatusPlan(state, `${MES}-01`, 'desayuno', 'outside');
  const ctx = contexto(state);
  const html = renderMes(ctx);
  assert.ok(html.includes('Sin decidir'), 'no se listan las comidas que faltan');
  assert.equal((html.match(/plan-pendiente/g) || []).length, 12, 'se enseñan todas de golpe');
  assert.ok(html.includes('Ver 12 más'));
  MES_ACTIONS['mes-ver-mas-pendientes'](null, ctx);
  assert.equal((renderMes(ctx).match(/plan-pendiente/g) || []).length, 24);
  // Y ninguna de las que se enseñan es una merienda: son opcionales.
  assert.ok(!renderMes(ctx).includes('Merienda de la mañana'), 'una merienda vacía se cuenta como hueco');
});

/* ── Poner una comida en varios días ───────────────────────────────────── */

test('se ponen los días que se marcan, y ni uno más', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  const dias = [`${MES}-06`, `${MES}-07`, `${MES}-08`];
  ponerEnDias(ctx, { fechas: dias, momento: 'desayuno', recipeId: mangu });

  assert.deepEqual(state.plans.map(plan => plan.date).sort(), dias);
  for (const fecha of dias) assert.equal(planFor(state, fecha, 'desayuno').title, 'Mangú', `falta el desayuno del ${fecha}`);
  assert.equal(planFor(state, `${MES}-13`, 'desayuno'), undefined, 'se puso un día que nadie marcó');
  // Y no queda ninguna regla escrita: esto no se repetirá solo el mes que viene.
  assert.deepEqual(state.mealRoutines, [], 'poner unos días dejó escrita una costumbre');
  assert.equal(ctx.ui.modal, null, 'la ventana se queda abierta después de poner');
  assert.ok(ctx.ui.mes.deshacer, 'poner catorce comidas de golpe tiene que poder deshacerse');
  assert.ok(ctx.ui.mes.aviso.titulo.includes('3 comida(s)'), `dijo «${ctx.ui.mes.aviso?.titulo}»`);
});

test('lo que ya estaba puesto no se pisa sin permiso, y con permiso sí', () => {
  const { state, sopa, locrio } = casa();
  const ctx = contexto(state);
  makeRecipePlan(state, locrio, `${MES}-07`, 'cena');

  ponerEnDias(ctx, { fechas: [`${MES}-06`, `${MES}-07`], momento: 'cena', recipeId: sopa, modo: 'vacios' });
  assert.equal(planFor(state, `${MES}-07`, 'cena').title, 'Locrio', 'se pisó una comida que ya estaba');
  assert.equal(planFor(state, `${MES}-06`, 'cena').title, 'Sopa', 'el día que estaba libre se quedó vacío');
  assert.ok(ctx.ui.mes.aviso.detalle.includes('1 se dejaron como estaban'), `dijo «${ctx.ui.mes.aviso?.detalle}»`);

  ponerEnDias(ctx, { fechas: [`${MES}-07`], momento: 'cena', recipeId: sopa, modo: 'reemplazar' });
  assert.equal(planFor(state, `${MES}-07`, 'cena').title, 'Sopa', 'con permiso tiene que reemplazarse');
});

test('sin momento o sin preparación no se guarda, y se dice cuál falta', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  assert.throws(() => ponerEnDias(ctx, { fechas: [`${MES}-06`], momento: '', recipeId: mangu }), /comida del día/);
  assert.throws(() => ponerEnDias(ctx, { fechas: [`${MES}-06`], momento: 'desayuno', recipeId: '' }), /preparación/);
  assert.throws(() => ponerEnDias(ctx, { fechas: [], momento: 'desayuno', recipeId: mangu }), /al menos un día/);
  assert.equal(state.plans.length, 0, 'un formulario a medias dejó comidas puestas');
});

test('se puede marcar «fuera de casa» en varios días sin elegir preparación', () => {
  const { state } = casa();
  const ctx = contexto(state);
  ponerEnDias(ctx, { fechas: [`${MES}-04`, `${MES}-18`], momento: 'almuerzo', kind: 'outside' });
  assert.equal(planFor(state, `${MES}-04`, 'almuerzo').kind, 'outside');
  assert.equal(planFor(state, `${MES}-18`, 'almuerzo').kind, 'outside');
  assert.equal(planFor(state, `${MES}-11`, 'almuerzo'), undefined, 'el domingo de en medio no se marcó');
});

test('la ventana pregunta tres cosas y ofrece los días del mes uno por uno', () => {
  const { state, mangu } = casa();
  const html = modalPonerEnDias(contexto(state), { month: MES });
  assert.ok(html.includes('¿Qué comen?') && html.includes('¿En qué comida?') && html.includes('¿Qué días?'));
  // Los 31 días de octubre, marcables uno a uno, y los dos atajos de siempre.
  assert.equal((html.match(/name="fechas"/g) || []).length, 31);
  assert.ok(html.includes('data-cuantos="7"') && html.includes('data-cuantos="14"'));
  assert.ok(html.includes('No se repetirá sola'), 'no promete lo único que hace falta prometer');
  assert.ok(html.includes(mangu), 'no ofrece las preparaciones que hay');
});

test('desde una preparación, la ventana abre con esa preparación puesta', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  MES_ACTIONS['mes-poner-en-dias']({ dataset: { receta: mangu, slot: 'desayuno' } }, ctx);
  assert.equal(ctx.ui.modal.type, 'poner-en-dias');
  assert.equal(ctx.ui.modal.receta, mangu, 'no se llevó la preparación que ya se había elegido');
  assert.equal(ctx.ui.modal.slot, 'desayuno', 'vuelve a preguntar un momento que ya estaba contestado');
  const html = modalPonerEnDias(ctx, ctx.ui.modal);
  assert.ok(html.includes(`value="${mangu}" selected`), 'la ventana abre sin la preparación marcada');
  assert.ok(html.includes('value="desayuno" checked'));
});

test('sin ninguna preparación escrita, la ventana enseña el camino para escribir la primera', () => {
  const state = createEmptyState();
  const html = modalPonerEnDias(contexto(state), { month: MES });
  assert.ok(html.includes('Todavía no hay preparaciones'));
  assert.ok(html.includes('data-action="poner-primera-preparacion"'), 'no hay forma de salir de la ventana vacía');
});

/* ── De dónde salió cada comida ────────────────────────────────────────── */

test('los cuatro orígenes que el usuario tiene que distinguir están todos', () => {
  const etiquetas = ORIGENES.map(origen => origen.etiqueta);
  for (const esperada of ['Rutina', 'Mes anterior', 'Excepción', 'Cambio manual']) {
    assert.ok(etiquetas.includes(esperada), `falta el origen «${esperada}»`);
  }
});

test('cada forma de poner una comida deja escrito de dónde vino', () => {
  const { state, mangu, locrio } = casa();
  const ctx = contexto(state);

  // A mano, desde la comida de un día.
  const aMano = makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  assert.equal(origenDe(aMano), 'manual');

  // Marcada fuera de casa: eso es una excepción por definición.
  const fuera = setStatusPlan(state, `${MES}-08`, 'cena', 'outside');
  assert.equal(origenDe(fuera), 'excepcion');

  // Y puesta en varios días de una vez. Sigue siendo una decisión de una
  // persona, para esos días: «cambio manual» es exactamente lo que fue, y
  // llamarla «rutina» prometería que se repite sola.
  ponerEnDias(ctx, { fechas: [`${MES}-14`, `${MES}-15`], momento: 'almuerzo', recipeId: locrio });
  for (const fecha of [`${MES}-14`, `${MES}-15`]) {
    const puesta = planFor(state, fecha, 'almuerzo');
    assert.equal(origenDe(puesta), 'manual', `la comida del ${fecha} no dice de dónde vino`);
    assert.equal(puesta.routineId, null, 'quedó colgando de una regla que no existe');
  }
});

test('rehacer a mano una comida vieja de una rutina la convierte en un cambio manual', () => {
  // «Rutina» ya no lo produce nadie, pero sigue guardado en los respaldos de
  // cuando la app llenaba el calendario sola. Una comida que se reescribe deja
  // de venir de aquella regla, y tiene que dejar de decirlo.
  const { state, locrio, arroz } = casa();
  const plan = makeRecipePlan(state, locrio, `${MES}-05`, 'almuerzo', null, 'regla-vieja-1', 'rutina');
  assert.equal(origenDe(plan), 'rutina');

  updatePlan(state, plan.id, {
    title: 'Locrio con más arroz', note: '', participants: plan.participants,
    items: [{ ...plan.items[0], productId: arroz, quantity: 4 }]
  });
  assert.equal(origenDe(plan), 'manual', 'la comida sigue diciendo que la puso una rutina que ya no reconocería');
});

test('el calendario y el día enseñan el origen de cada comida', () => {
  const { state, mangu, locrio } = casa();
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  setStatusPlan(state, `${MES}-05`, 'almuerzo', 'outside');
  const ctx = contexto(state, { mes: { ...emptyMes(MES), vista: 'calendario' } });

  const calendario = renderMes(ctx);
  assert.ok(calendario.includes('data-origen="manual"'), 'el calendario no marca el origen');
  assert.ok(calendario.includes('data-origen="excepcion"'));
  // Y con una leyenda, porque un color sin leyenda no dice nada. La leyenda
  // nombra los orígenes que este mes tiene, y solo esos: enseñar «Rutina» en un
  // mes que no la tiene sería prometer algo que la app ya no hace.
  const leyenda = calendario.slice(calendario.indexOf('origen-leyenda'));
  assert.ok(leyenda.includes('Cambio manual'), 'la leyenda no nombra lo que sí hay en el mes');
  assert.ok(leyenda.includes('Excepción'));
  for (const etiqueta of ['Rutina', 'Mes anterior']) {
    assert.ok(!leyenda.includes(etiqueta), `la leyenda nombra «${etiqueta}» en un mes que no lo tiene`);
  }

  const dia = modalDia(ctx, { date: `${MES}-05` });
  revisar(dia, 'la ventana del día');
  assert.ok(dia.includes('Cambio manual'), 'la ventana del día no dice de dónde vino la comida');
  assert.ok(dia.includes('Excepción'));
  // Las cinco comidas del día, incluidas las meriendas vacías, que se pueden
  // poner desde aquí sin que se cuenten como un hueco.
  assert.ok(dia.includes('es opcional'), 'la ventana del día no dice que la merienda es opcional');
  assert.equal((dia.match(/data-action="open-meal"/g) || []).length, 5);
  assert.ok(etiquetaDeOrigen('rutina'), 'la etiqueta de un origen no puede quedar vacía');
  assert.ok(locrio);
});

test('se puede marcar y vaciar un día entero desde el calendario', () => {
  const { state, mangu, platano } = casa();
  const fecha = `${MES}-05`;
  const galleta = upsertRecipe(state, { name: 'Galletas con jugo', uses: ['merienda-tarde'], items: [{ productId: platano, quantity: 1, unit: 'unidad' }], note: '' });
  makeRecipePlan(state, mangu, fecha, 'desayuno');
  makeRecipePlan(state, galleta.id, fecha, 'merienda-tarde');
  const ctx = contexto(state);

  MES_ACTIONS['mes-dia-fuera']({ dataset: { date: fecha } }, ctx);

  for (const slot of ['desayuno', 'almuerzo', 'cena']) {
    assert.equal(planFor(state, fecha, slot).kind, 'outside', `${slot} no quedó fuera de casa`);
    assert.equal(origenDe(planFor(state, fecha, slot)), 'excepcion');
  }
  // La merienda que alguien puso a mano no se toca: es opcional, y pisarla sería
  // borrar una decisión por una que no se tomó.
  assert.equal(planFor(state, fecha, 'merienda-tarde').kind, 'recipe');

  // Y vaciar el día se los lleva todos, meriendas incluidas: eso sí se pidió.
  MES_ACTIONS['mes-dia-vaciar']({ dataset: { date: fecha } }, ctx);
  for (const slot of ['desayuno', 'merienda-manana', 'almuerzo', 'merienda-tarde', 'cena']) {
    assert.equal(planFor(state, fecha, slot), undefined, `${slot} sigue puesto después de vaciar el día`);
  }
  assert.ok(ctx.ui.mes.deshacer, 'vaciar un día entero tiene que poder deshacerse');
});

test('deshacer devuelve el mes a como estaba', () => {
  const { state, mangu } = casa();
  const ctx = contexto(state);
  ponerEnDias(ctx, { fechas: [`${MES}-06`, `${MES}-07`], momento: 'desayuno', recipeId: mangu });
  assert.equal(state.plans.length, 2);
  MES_ACTIONS['mes-deshacer'](null, ctx);
  assert.equal(state.plans.length, 0, 'deshacer no quitó lo que se acababa de poner');
  assert.equal(ctx.ui.mes.deshacer, null, 'se puede deshacer dos veces lo mismo');
});

test('«ver calendario» sale de verdad al calendario', () => {
  const { state } = casa();
  const ctx = contexto(state);
  MES_ACTIONS['mes-vista']({ dataset: { vista: 'calendario' } }, ctx);
  assert.equal(ctx.ui.mes.vista, 'calendario');
  assert.ok(renderMes(ctx).includes('calendar-month'), 'no se llegó al calendario');
  MES_ACTIONS['mes-vista']({ dataset: { vista: 'resumen' } }, ctx);
  assert.ok(!renderMes(ctx).includes('calendar-month'), 'no se vuelve del calendario al resumen');
});

test('las ausencias se explican sin prometer que encogen la olla', () => {
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  const html = renderMes(contexto(state, { mes: { ...emptyMes(MES), vista: 'resumen' } }));
  assert.ok(html.includes('no cambia lo que se cocina'), 'no dice que marcar a alguien fuera no encoge la olla');
});

/* ── La migración ──────────────────────────────────────────────────────── */

test('un respaldo sin orígenes se convierte deduciendo lo que se puede', () => {
  const viejo = {
    version: 5, seq: 20, products: [], people: [], recipes: [], absences: [],
    opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
    habitualBasket: { lines: [], updatedAt: null, history: [] },
    monthOverrides: {}, mealRoutines: [], monthPlans: {}, activity: [],
    settings: { reviewWeekday: 5, onboarded: true },
    plans: [
      { id: 'comida-1', date: `${MES}-05`, slot: 'desayuno', kind: 'recipe', routineId: 'rutina-1', title: 'Mangú', participants: [], items: [] },
      { id: 'comida-2', date: `${MES}-06`, slot: 'almuerzo', kind: 'outside', routineId: null, participants: [], items: [] },
      { id: 'comida-3', date: `${MES}-07`, slot: 'cena', kind: 'recipe', routineId: null, title: 'Locrio', participants: [], items: [] }
    ]
  };
  const { ok, state, to } = migrate(structuredClone(viejo));
  assert.equal(ok, true);
  assert.equal(to, SCHEMA_VERSION);
  assert.deepEqual(state.plans.map(plan => plan.origen), ['rutina', 'excepcion', 'manual']);
  // Y ninguna comida se movió de sitio, de plato ni de nada.
  assert.deepEqual(state.plans.map(plan => [plan.id, plan.date, plan.slot, plan.kind]),
    viejo.plans.map(plan => [plan.id, plan.date, plan.slot, plan.kind]));

  // Repetirla sobre lo ya convertido no cambia nada.
  const segunda = migrate(structuredClone(state));
  assert.equal(segunda.ok, true);
  assert.deepEqual(segunda.state.plans, state.plans);

  // Y un origen escrito a mano se respeta: la deducción solo rellena huecos.
  const conOrigen = structuredClone(viejo);
  conOrigen.plans[2].origen = 'mes-anterior';
  assert.equal(migrate(conOrigen).state.plans[2].origen, 'mes-anterior');
});

test('todos los orígenes del modelo tienen etiqueta y explicación', () => {
  for (const id of ORIGENES_IDS) {
    const origen = ORIGENES.find(item => item.id === id);
    assert.ok(origen.etiqueta && origen.detalle, `el origen «${id}» está a medias`);
  }
  // Y uno que no existe no deja la pantalla en blanco.
  assert.equal(etiquetaDeOrigen('lo-que-sea'), 'Cambio manual');
  assert.equal(origenDe(null), null);
});

/* ── «Más», con jerarquía ──────────────────────────────────────────────── */

test('el índice de Más está agrupado y lo frecuente va primero', () => {
  const grupos = GRUPOS_MAS.filter(([rotulo]) => rotulo);
  assert.ok(grupos.length >= 3, 'no hay grupos: sigue siendo una lista seguida');
  for (const [rotulo, filas] of GRUPOS_MAS) {
    assert.ok(filas.length && filas.length <= 4, `el grupo «${rotulo || 'sin rótulo'}» tiene ${filas.length} filas`);
  }
  // Lo de cada semana arriba del todo: la canasta y las preparaciones se tocan
  // cada pocos días; el respaldo, una vez cada muchos meses.
  const primeros = GRUPOS_MAS[0][1].map(([id]) => id);
  // «Revisar lo que queda» ya no está: era el formulario de «¿cuánto te queda
  // de cada cosa?», y servía para afinar una cuenta que la app ya no hace.
  assert.deepEqual(primeros, ['canasta', 'preparaciones']);
  assert.ok(!GRUPOS_MAS.flatMap(([, filas]) => filas).some(([id]) => id === 'revision'),
    'volvió a pedirse el repaso de la despensa cada semana');
  assert.ok(!GRUPOS_MAS.flatMap(([, filas]) => filas).some(([id]) => id === 'avanzado'),
    'las funciones avanzadas no deberían competir en el índice con la canasta');
});

test('nada desapareció al agrupar: lo avanzado sigue estando, dentro de Ajustes', () => {
  const state = createEmptyState();
  // Todas las páginas que había siguen teniendo ruta.
  for (const id of ['canasta', 'preparaciones', 'familia', 'alimentos', 'historial', 'respaldo', 'ajustes', 'avanzado']) {
    assert.ok(PAGINAS_MAS.includes(id) || id === 'cuenta', `la página «${id}» se quedó sin ruta`);
    assert.ok(ENTRADAS_MAS.some(([entrada]) => entrada === id), `«${id}» ya no está en la lista de entradas`);
  }
  // «Revisar lo que queda» salió del índice y de las entradas, pero su pantalla
  // sigue existiendo: el historial de las revisiones viejas se lee desde Más →
  // Historial, y lo que se quitó fue pedir el repaso cada semana, no borrarlo.
  assert.ok(PAGINAS_MAS.includes('revision'), 'la pantalla de las revisiones viejas se quedó sin ruta');
  const ajustes = renderMas(contexto(state, { page: 'ajustes' }));
  assert.ok(ajustes.includes('data-page="avanzado"'), 'desde Ajustes no se llega a las funciones avanzadas');
  const avanzado = renderMas(contexto(state, { page: 'avanzado' }));
  revisar(avanzado, 'funciones avanzadas');
});

/* ── Añadir un alimento: de este mes, o de siempre ─────────────────────── */

test('añadir un alimento ocasional no toca la canasta base', () => {
  // Esto es lo que hace el formulario según a dónde diga que va. La pantalla se
  // comprueba aparte; lo que se guarda tiene que quedar separado sí o sí.
  const { state } = casa();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setMonthChange(state, MES, cangrejo, { quantity: 3, unit: 'lb' });

  assert.ok(!habitualLines(state).some(linea => linea.productId === cangrejo),
    'un alimento de un solo mes se coló en la canasta de todos los meses');
  assert.ok(monthChanges(state, MES).changes.some(cambio => cambio.productId === cangrejo),
    'el alimento de este mes no llegó a la compra de este mes');
});

test('la ventana de añadir alimento pregunta dónde entra, y lo permanente no viene marcado', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/name="destino"/.test(codigo), 'la ventana no pregunta dónde entra el alimento');
  assert.ok(/Añadir a mis habituales/.test(codigo), 'falta la opción de añadirlo para siempre');
  assert.ok(/Solo para \$\{monthName\(mesActual\)\}/.test(codigo), 'falta la opción de solo este mes');
  // El destino permanente nunca puede venir marcado de fábrica.
  const bloque = codigo.slice(codigo.indexOf('const DESTINOS'), codigo.indexOf('function modalProducto'));
  assert.ok(bloque.includes("['mes'"), 'el destino mensual tiene que existir');
  assert.ok(bloque.indexOf("['mes'") < bloque.indexOf("['siempre'"), 'el destino de siempre no puede ser el primero, que es el que viene marcado');
  assert.ok(/indice === 0 \? 'checked' : ''/.test(bloque), 'se marca de fábrica algo que no es el primero');
  // Y al guardar, cada destino escribe donde dice.
  assert.ok(/destino === 'siempre'[\s\S]{0,160}setHabitualLine/.test(codigo), 'el destino permanente no escribe en la canasta base');
  assert.ok(/destino === 'mes'[\s\S]{0,200}setMonthChange/.test(codigo), 'el destino mensual no escribe en los cambios del mes');
});

/* ── Y nada de esto rompe lo de antes ──────────────────────────────────── */

test('borrar una comida del día no deja rastros ni orígenes huérfanos', () => {
  const { state, mangu } = casa();
  const plan = makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  deletePlan(state, plan.id, true);
  assert.equal(state.plans.length, 0);
  assert.equal(planFor(state, `${MES}-05`, 'desayuno'), undefined);
});

// El navegador esconde `[hidden]` con un `display:none` de su propia hoja, que
// pierde contra cualquier regla nuestra que declare `display`. Un `.field`
// (grid) o una `.radio-fila` (flex) con el atributo puesto se quedaba a la
// vista, y con sus campos vivos: alguien podía marcar una opción que la
// pantalla creía escondida y que sí llegaba al formulario.
test('«hidden» esconde de verdad, y no solo en las clases que se acordaron', () => {
  const css = readFileSync(resolve(import.meta.dirname, '..', 'src', 'theme.css'), 'utf8');
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
    'sin la regla general, cualquier clase con display propio vuelve a enseñar lo escondido');
});

/* ── Lo que el recorrido del mes dejó de preguntar ─────────────────────────

   Estas tres venían de las pruebas del mes generado, que se fue con la máquina.
   Vigilan lo que no puede volver: preparar el mes es decidir qué se come, y las
   cifras de la canasta, las existencias y la lista de lo que faltaría comprar
   convertían «ya está mi mes» en «ahora repasa el inventario», que es donde se
   abandonaba. */

test('el recorrido mensual no pregunta por cantidades, existencias ni compra', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-mes.js'), 'utf8');
  for (const muerta of ['function bloqueCanasta(', 'function bloqueCompra(', 'function cambiosEnLaCompra(', 'function seccionCanasta(']) {
    assert.ok(!codigo.includes(muerta), `sigue en el recorrido: ${muerta}`);
  }
  assert.ok(!/monthBasketSummary\(/.test(codigo), 'el plan del mes vuelve a contar la canasta');
  assert.ok(!/inventoryNow\(/.test(codigo), 'el plan del mes vuelve a mirar las existencias');
  assert.ok(!/balances\(/.test(codigo), 'el plan del mes vuelve a mirar los saldos de la despensa');
  // Y tampoco en la pantalla: ni una cifra de libras ni una lista de faltantes.
  const { state, mangu } = casa();
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  const ctx = contexto(state);
  for (const vista of ['resumen', 'calendario']) {
    ctx.ui.mes.vista = vista;
    const limpio = renderMes(ctx).replace(/<[^>]*>/g, ' ');
    for (const palabra of ['existencias', 'inventario', 'te queda', 'lista de compra']) {
      assert.ok(!new RegExp(palabra, 'i').test(limpio), `la vista «${vista}» vuelve a hablar de «${palabra}»`);
    }
  }
});

test('«para toda la casa» es una respuesta escrita, no una casilla sin marcar', () => {
  /* El fallo: no se podía poner NI UNA comida en una casa con gente registrada.

     «¿Quiénes comen?» se contesta de dos formas. Abierta, con una casilla por
     persona. Cerrada —lo normal, porque una comida es de toda la casa—, con un
     campo oculto por persona y ninguna casilla. Leyendo solo lo marcado, la
     segunda forma devolvía una lista vacía y el modelo contestaba «Selecciona
     al menos una persona que comerá en casa» a quien no había desmarcado a
     nadie. */
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/type="hidden" name="\$\{esc\(name\)\}"/.test(codigo), 'el bloque cerrado ya no escribe la respuesta');
  assert.ok(/input\.type === 'hidden' \|\| input\.checked/.test(codigo), 'lo oculto vuelve a no contar como respuesta');
  assert.ok(!/const selected = \(form, name\) => \[\.\.\.form\.querySelectorAll\(`\[name="\$\{name\}"\]:checked`\)\]/.test(codigo),
    'vuelve a leerse solo lo marcado');
});

test('un alimento sin cantidad se escribe por su nombre, no como «0»', () => {
  /* El fallo: desde que una preparación puede llevar alimentos sin decir
     cuánto, la pantalla de quien cocina pintaba la medida a ciegas y salía
     «0 · Arroz». `measure(null, null)` devuelve «0 », que es peor que callar. */
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/const sinMedida = item => item\.quantity === null \|\| item\.quantity === undefined;/.test(codigo));
  assert.ok(/sinMedida\(item\) \? esc\(productName\(item\.productId\)\)/.test(codigo), 'sin cantidad vuelve a pintarse una medida');
  // Y la lista de la comida tampoco escribe «0 de Arroz».
  assert.ok(/\$\{sinMedida\(item\) \? `<strong>\$\{esc\(productName\(item\.productId\)\)\}<\/strong>`/.test(codigo));
});

test('«cambiar solo este día» existe, y deja la comida nueva suelta de cualquier regla', () => {
  // Antes había que quitar la comida y volver a ponerla, y quien lo intentaba
  // sobre una comida heredada de una costumbre se topaba con la pregunta del
  // alcance cuando lo único que quería era cenar otra cosa ese jueves.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/data-form="sustituir"/.test(codigo), 'no hay forma de cambiar el plato de un solo día');
  assert.ok(/Cambiar solo este día/.test(codigo));
  // Solo se ofrecen las preparaciones que valen para ese momento.
  assert.ok(/recipe\.uses\.includes\(plan\.slot\) && recipe\.id !== plan\.recipeId/.test(codigo));
  // Y la que se pone nace sin regla y como cambio manual: eso es lo que impide
  // que una comida heredada siga diciendo que la puso una costumbre.
  assert.ok(/makeRecipePlan\(state, receta\.id, date, slot, participants, null, 'manual'\)/.test(codigo),
    'la comida sustituida no queda marcada como cambio de ese día');
  // Una comida de la que cuelga una parte apartada no se sustituye a ciegas.
  assert.ok(/if \(dependents\(state, plan\.id\)\.length\) throw new Error/.test(codigo));
});
