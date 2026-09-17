import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// El plan mensual, simplificado: tres bloques y cada comida dice de dónde vino.
//
// Dos ideas gobiernan este archivo.
//
// 1. Preparar un mes son tres preguntas —con qué empieza, en qué se sale de lo
//    normal, y si se da por bueno— y ninguna de las tres bloquea. Se cierra el
//    mes con huecos, porque un hueco es una comida sin decidir, no un error, y
//    una merienda vacía no es ni eso.
//
// 2. Un calendario lleno tiene que decir quién lo llenó. Delante de un martes
//    con mangú nadie se atreve a tocar nada si no sabe si lo puso él, si vino
//    de una rutina o si se arrastró del mes pasado.

import {
  ORIGENES, ORIGENES_IDS, addProduct, createEmptyState, deletePlan, etiquetaDeOrigen, generateMonth,
  makeRecipePlan, origenDe, planFor, setHabitualBasket, setMonthChange, setStatusPlan, updatePlan,
  upsertRecipe, habitualLines, monthChanges
} from '../src/model.js';
import { addRoutine, applyRoutine, copyPatternFromMonth, datesForRule, monthProgress, openMonth } from '../src/routines.js';
import { migrate, SCHEMA_VERSION } from '../src/migrate.js';
import { BLOQUES, MES_ACTIONS, emptyMes, modalDia, renderMes } from '../src/page-mes.js';
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
    startTour: () => {},
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}»`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

// Una casa con una rutina de desayunos y una preparación para el almuerzo.
function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 10, unit: 'lb' }, { productId: platano, quantity: 30, unit: 'unidad' }]);
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }], note: '' });
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo', 'cena'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  return { state, arroz, platano, mangu: mangu.id, locrio: locrio.id };
}

/* ── Tres bloques, no siete pantallas ──────────────────────────────────── */

test('preparar un mes son tres bloques con nombre', () => {
  assert.equal(BLOQUES.length, 3);
  assert.deepEqual(BLOQUES.map(bloque => bloque.id), ['base', 'excepciones', 'confirmar']);
  for (const bloque of BLOQUES) {
    assert.ok(bloque.titulo && bloque.pregunta, `el bloque «${bloque.id}» no tiene título ni pregunta`);
    // La pregunta es lo que se lee arriba del todo: tiene que ser una pregunta.
    assert.ok(bloque.pregunta.includes('¿'), `«${bloque.pregunta}» no está escrita como pregunta`);
  }
});

test('los tres bloques se dibujan con datos y también con un estado vacío', () => {
  const { state, mangu } = casa();
  openMonth(state, MES);
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  for (const conDatos of [state, createEmptyState()]) {
    const ctx = contexto(conDatos);
    for (const bloque of BLOQUES) {
      ctx.ui.mes.bloque = bloque.id;
      revisar(renderMes(ctx), `bloque «${bloque.id}»`);
    }
  }
});

test('ningún bloque habla en técnico', () => {
  // «Instancia», «override» y «sincronización» son palabras de quien escribió el
  // programa, no de quien cocina. Aquí no pintan nada.
  const { state, mangu, locrio } = casa();
  openMonth(state, MES);
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  makeRecipePlan(state, locrio, `${MES}-05`, 'almuerzo');
  setStatusPlan(state, `${MES}-11`, 'almuerzo', 'outside');
  const ctx = contexto(state);
  const pantallas = [];
  for (const bloque of BLOQUES) { ctx.ui.mes.bloque = bloque.id; pantallas.push([bloque.id, renderMes(ctx)]); }
  ctx.ui.mes.bloque = null;
  pantallas.push(['resumen', renderMes(ctx)]);
  ctx.ui.mes.vista = 'calendario';
  pantallas.push(['calendario', renderMes(ctx)]);
  pantallas.push(['día', modalDia(ctx, { date: `${MES}-05` })]);

  for (const [donde, html] of pantallas) {
    const limpio = html.replace(/<[^>]*>/g, ' ');
    for (const palabra of ['instancia', 'override', 'sincroniza', 'slot', 'schema', 'payload', 'commit']) {
      assert.ok(!new RegExp(`\\b${palabra}`, 'i').test(limpio), `«${donde}» dice «${palabra}» en pantalla`);
    }
  }
});

/* ── Se cierra el mes con huecos ───────────────────────────────────────── */

test('finalizar no exige que el mes esté lleno, y deja escrito el día', () => {
  const { state, mangu } = casa();
  openMonth(state, MES);
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  const ctx = contexto(state, { mes: { ...emptyMes(MES), bloque: 'confirmar' } });

  const antes = monthProgress(state, MES);
  assert.ok(antes.pendientes > 80, 'el mes tenía que estar casi entero sin decidir');

  MES_ACTIONS['mes-finalizar'](null, ctx);

  assert.ok(state.monthPlans[MES].preparedAt, 'no quedó escrito el día en que se dio por bueno');
  assert.equal(ctx.ui.mes.bloque, null, 'no se salió del recorrido');
  // Y sobre todo: los huecos siguen ahí. Cerrar el mes no es rellenarlo.
  assert.equal(monthProgress(state, MES).pendientes, antes.pendientes);
});

test('un mes sin ninguna merienda se puede cerrar y está al cien por cien', () => {
  const { state, mangu, locrio } = casa();
  openMonth(state, MES);
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

  const ctx = contexto(state, { mes: { ...emptyMes(MES), bloque: 'confirmar' } });
  const html = renderMes(ctx);
  assert.ok(html.includes('No queda ningún hueco'), 'no dice que el mes está completo');
  assert.ok(!/sin decidir<\/strong>/.test(html), 'sigue avisando de huecos que no existen');
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
  openMonth(state, MES);

  // A mano.
  const aMano = makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  assert.equal(origenDe(aMano), 'manual');

  // Desde una rutina.
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: locrio, slots: ['almuerzo'], weekdays: [1], weeks: null, scope: 'permanent' });
  applyRoutine(state, rutina.id, MES, { modo: 'vacios' });
  const deRutina = state.plans.find(plan => plan.routineId === rutina.id);
  assert.equal(origenDe(deRutina), 'rutina');

  // Marcada fuera de casa: eso es una excepción por definición.
  const fuera = setStatusPlan(state, `${MES}-08`, 'cena', 'outside');
  assert.equal(origenDe(fuera), 'excepcion');

  // Traída del mes pasado.
  const siguiente = '2026-11';
  openMonth(state, siguiente);
  const copiadas = copyPatternFromMonth(state, MES, siguiente);
  assert.ok(copiadas.creados.length, 'no se copió nada del mes anterior');
  for (const id of copiadas.creados) {
    assert.equal(origenDe(state.plans.find(plan => plan.id === id)), 'mes-anterior');
  }

  // Y la que elige la app al rellenar: ni es rutina, ni la puso nadie a mano.
  // Llamarla «cambio manual» sería mentir en el único sitio donde la app promete
  // decir la verdad sobre de dónde salió cada cosa.
  const otro = '2026-12';
  openMonth(state, otro);
  generateMonth(state, otro);
  const sugerida = state.plans.find(plan => plan.date.startsWith(otro) && !plan.routineId);
  assert.equal(origenDe(sugerida), 'sugerida');
});

test('rehacer una comida a mano la convierte en un cambio manual', () => {
  const { state, locrio, arroz } = casa();
  openMonth(state, MES);
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: locrio, slots: ['almuerzo'], weekdays: [1], weeks: null, scope: 'permanent' });
  applyRoutine(state, rutina.id, MES, { modo: 'vacios' });
  const plan = state.plans.find(item => item.routineId === rutina.id);
  assert.equal(origenDe(plan), 'rutina');

  updatePlan(state, plan.id, {
    title: 'Locrio con más arroz', note: '', participants: plan.participants,
    items: [{ ...plan.items[0], productId: arroz, quantity: 4 }]
  });
  assert.equal(origenDe(plan), 'manual', 'la comida sigue diciendo que la puso una rutina que ya no reconocería');
});

test('el calendario y el día enseñan el origen de cada comida', () => {
  const { state, mangu, locrio } = casa();
  openMonth(state, MES);
  makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  setStatusPlan(state, `${MES}-05`, 'almuerzo', 'outside');
  const ctx = contexto(state, { mes: { ...emptyMes(MES), vista: 'calendario' } });

  const calendario = renderMes(ctx);
  assert.ok(calendario.includes('data-origen="manual"'), 'el calendario no marca el origen');
  assert.ok(calendario.includes('data-origen="excepcion"'));
  // Y con una leyenda, porque un color sin leyenda no dice nada.
  for (const origen of ORIGENES) assert.ok(calendario.includes(origen.etiqueta), `la leyenda no nombra «${origen.etiqueta}»`);

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
  openMonth(state, MES);
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

test('«ajustarlo día por día» sale de verdad al calendario', () => {
  // Estuvo a punto de ser un botón muerto: cambiaba la vista, pero el bloque
  // seguía puesto y se volvía a pintar él. Desde fuera, no pasaba nada.
  const { state } = casa();
  openMonth(state, MES);
  const ctx = contexto(state, { mes: { ...emptyMes(MES), bloque: 'base' } });
  MES_ACTIONS['mes-vista']({ dataset: { vista: 'calendario' } }, ctx);
  assert.equal(ctx.ui.mes.bloque, null, 'el recorrido tapa el calendario al que se acaba de ir');
  assert.ok(renderMes(ctx).includes('calendar-month'), 'no se llegó al calendario');
});

/* ── Reutilizar el mes pasado sin copiar día por día ───────────────────── */

test('el mes anterior se trae entero con un solo gesto', () => {
  const { state, mangu, locrio } = casa();
  openMonth(state, '2026-09');
  let puestas = 0;
  for (let dia = 1; dia <= 30; dia++) {
    const fecha = `2026-09-${String(dia).padStart(2, '0')}`;
    makeRecipePlan(state, mangu, fecha, 'desayuno');
    makeRecipePlan(state, locrio, fecha, 'almuerzo');
    puestas += 2;
  }
  openMonth(state, MES);
  const ctx = contexto(state);
  MES_ACTIONS['mes-copiar-patron'](null, ctx);

  const copiadas = state.plans.filter(plan => plan.date.startsWith(MES) && origenDe(plan) === 'mes-anterior');
  assert.ok(copiadas.length > 50, `solo se copiaron ${copiadas.length} de ${puestas}`);
  assert.ok(ctx.ui.mes.deshacer, 'no se puede deshacer lo que se acaba de traer');
  assert.equal(ctx.ui.mes.base, 'copiar', 'no quedó marcado cuál de las tres salidas se eligió');
});

test('traer el mes pasado cuando no cabe nada lo dice sin mentir', () => {
  // Todos los días de destino ocupados no es «no hay nada que copiar»: es que no
  // hay dónde ponerlo. Decir lo primero hace pensar que el botón está roto.
  const { state, mangu } = casa();
  for (const mes of ['2026-09', MES]) {
    openMonth(state, mes);
    const dias = mes === '2026-09' ? 30 : 31;
    for (let dia = 1; dia <= dias; dia++) makeRecipePlan(state, mangu, `${mes}-${String(dia).padStart(2, '0')}`, 'desayuno');
  }
  let dicho = '';
  const ctx = contexto(state);
  ctx.toast = mensaje => { dicho = mensaje; };
  MES_ACTIONS['mes-copiar-patron'](null, ctx);
  assert.ok(dicho.includes('ya tenían algo puesto'), `dijo «${dicho}»`);
  assert.ok(!dicho.includes('No hay ninguna preparación'), 'sí había preparaciones que copiar');
});

/* ── Las excepciones de los domingos, en grupo ─────────────────────────── */

test('los domingos alternos se configuran de una vez, sin marcar fechas', () => {
  const { state } = casa();
  openMonth(state, MES);
  const rutina = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3], scope: 'permanent' });
  const resultado = applyRoutine(state, rutina.id, MES, { modo: 'vacios' });

  // Octubre de 2026: los domingos caen 4, 11, 18 y 25. Primero y tercero: 4 y 18.
  assert.deepEqual(datesForRule(MES, [7], [1, 3]), [`${MES}-04`, `${MES}-18`]);
  assert.equal(resultado.creados.length, 2);
  for (const fecha of [`${MES}-04`, `${MES}-18`]) {
    assert.equal(planFor(state, fecha, 'almuerzo').kind, 'outside');
  }
  assert.equal(planFor(state, `${MES}-11`, 'almuerzo'), undefined, 'el segundo domingo no debía tocarse');
});

test('el bloque de excepciones ofrece los domingos, los alternos y las fechas sueltas', () => {
  const { state } = casa();
  openMonth(state, MES);
  const ctx = contexto(state, { mes: { ...emptyMes(MES), bloque: 'excepciones' } });
  const html = renderMes(ctx);
  for (const texto of ['Todos los domingos', 'Primer y tercer domingo', 'Segundo y cuarto domingo', 'Fechas concretas']) {
    assert.ok(html.includes(texto), `el bloque de excepciones no ofrece «${texto}»`);
  }
  // Y las ausencias viven aquí, con su promesa escrita.
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
  assert.equal(bloque.indexOf("['mes'"), bloque.indexOf("['mes'"), 'el destino mensual tiene que existir');
  assert.ok(bloque.indexOf("['mes'") < bloque.indexOf("['siempre'"), 'el destino de siempre no puede ser el primero, que es el que viene marcado');
  assert.ok(/indice === 0 \? 'checked' : ''/.test(bloque), 'se marca de fábrica algo que no es el primero');
  // Y al guardar, cada destino escribe donde dice.
  assert.ok(/destino === 'siempre'[\s\S]{0,160}setHabitualLine/.test(codigo), 'el destino permanente no escribe en la canasta base');
  assert.ok(/destino === 'mes'[\s\S]{0,200}setMonthChange/.test(codigo), 'el destino mensual no escribe en los cambios del mes');
});

/* ── Y nada de esto rompe lo de antes ──────────────────────────────────── */

test('borrar una comida del día no deja rastros ni orígenes huérfanos', () => {
  const { state, mangu } = casa();
  openMonth(state, MES);
  const plan = makeRecipePlan(state, mangu, `${MES}-05`, 'desayuno');
  deletePlan(state, plan.id, true);
  assert.equal(state.plans.length, 0);
  assert.equal(planFor(state, `${MES}-05`, 'desayuno'), undefined);
});

// Salió probando a mano, no compilando: al editar una rutina, las comidas que
// la regla nueva ya no cubre se sueltan —bien— pero seguían diciendo que venían
// de una rutina. El calendario promete decir de dónde salió cada comida, y una
// que dijera «Rutina» sin ninguna regla detrás es justo la mentira que esa
// promesa existe para evitar.
test('una comida que deja de seguir la rutina deja de decir que viene de una', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-mes.js'), 'utf8');
  const bloque = codigo.slice(codigo.indexOf('if (vigentes.has('), codigo.indexOf('liberadas++'));
  assert.ok(/plan\.routineId = null;/.test(bloque), 'soltar la comida de la regla');
  assert.ok(/plan\.origen = 'manual';/.test(bloque), 'soltarla sin corregir su origen la deja mintiendo');
});

// Y el otro que salió del mismo recorrido: editar una rutina para ponerla en
// unos días que ya estaban ocupados dejaba la rutina sin una sola comida, y
// solo se descubría leyendo el aviso de después.
test('editar sobre días ocupados pregunta antes, no después', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-mes.js'), 'utf8');
  assert.ok(/else if \(editandoId && ocupadas\)/.test(codigo), 'no se pregunta al editar sobre días ocupados');
  assert.ok(/modoEfectivo = window\.confirm\(/.test(codigo), 'la respuesta no decide el modo');
  assert.ok(/applyRoutine\(state, rutina\.id, month, \{ modo: modoEfectivo/.test(codigo), 'se pregunta y luego se aplica otro modo');
});

// El navegador esconde `[hidden]` con un `display:none` de su propia hoja, que
// pierde contra cualquier regla nuestra que declare `display`. Un `.field`
// (grid) o una `.radio-fila` (flex) con el atributo puesto se quedaba a la
// vista, y con sus campos vivos: alguien podía marcar una opción que la
// pantalla creía escondida y que sí llegaba al formulario.
//
// Pasó dos veces —el grosor de las ruedas y el alcance de una rutina de días
// sueltos, que medía 96 píxeles con `hidden` puesto— y la segunda es la que
// convierte un parche en una regla.
test('«hidden» esconde de verdad, y no solo en las clases que se acordaron', () => {
  const css = readFileSync(resolve(import.meta.dirname, '..', 'src', 'theme.css'), 'utf8');
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
    'sin la regla general, cualquier clase con display propio vuelve a enseñar lo escondido');
});

// Y la pregunta del alcance ya no desaparece al elegir días sueltos: se queda
// contestada y explicada. Una pregunta que se esfuma deja pensando si se
// contestó sola o si se perdió.
test('con días sueltos el alcance se enseña contestado, no se esconde entero', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-mes.js'), 'utf8');
  assert.ok(/data-alcance-sueltos/.test(codigo), 'falta el bloque que explica el alcance de unas fechas sueltas');
  assert.ok(/form\.querySelector\('\[data-alcance-sueltos\]'\)\.hidden = !sueltos;/.test(codigo),
    'el interruptor no enseña la explicación al cambiar de modo');
  // Y las dos fechas de vigencia tienen suelo, para que nadie guarde una regla
  // que no hace nada por haber escrito 2019.
  assert.ok(/name="desde"[^>]*min="\$\{esc\(sueloDeVigencia\)\}"/.test(codigo), 'la fecha de inicio no tiene suelo');
  assert.ok(/name="hasta"[^>]*min="\$\{esc\(sueloDeVigencia\)\}"/.test(codigo), 'la fecha final no tiene suelo');
});
