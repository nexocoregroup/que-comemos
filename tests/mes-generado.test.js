// El mes se genera solo, y lo que se cambia a mano no se convierte en costumbre.
//
// Las seis comprobaciones de esta etapa, y todas miran la misma frontera: qué
// pertenece al día y qué pertenece a la costumbre. Si esa frontera se borra, una
// casa pierde o el trabajo de un mes entero o la costumbre de un año:
//
//  · un mes nuevo tiene que abrirse ya puesto, con los días reales que tenga
//    —28, 29, 30 o 31—, sin que nadie copie nada;
//  · la misma preparación en dos momentos son dos reglas y no se cruzan;
//  · cambiar UNA fecha no puede tocar la regla;
//  · cambiar la regla no puede reescribir lo que ya pasó ni lo que alguien
//    decidió a mano;
//  · y un mes futuro que ya estaba abierto tiene que poder enterarse de una
//    regla nueva sin que le pisen lo que ya tenía.

import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

import {
  SLOTS_PRINCIPALES, addProduct, createEmptyState, dateRange, deletePlan, makeRecipePlan,
  monthBounds, origenDe, planFor, setStatusPlan, upsertRecipe
} from '../src/model.js';
import {
  addRoutine, applyRoutine, datesForRule, extenderAMesesAbiertos, monthProgress,
  ocupadasEnMesesAbiertos, openMonth, regla, routinePlans, updateRoutine, weekdayOf
} from '../src/routines.js';

const LUNES = 1, VIERNES = 5, DOMINGO = 7;

function cocina() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [{ productId: platano }] }).id;
  const locrio = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [] }).id;
  const revoltillo = upsertRecipe(state, { name: 'Revoltillo', uses: ['desayuno'], items: [] }).id;
  return { state, mangu, locrio, revoltillo };
}

// Los días que de verdad tiene un mes, contados sobre el calendario y sin pasar
// por el código que se está probando.
const diasDe = mes => {
  const { start, end } = monthBounds(mes);
  return dateRange(start, end);
};

/* ── 1. Distintos largos de mes ────────────────────────────────────────── */

test('un mes se abre con sus días reales: 28, 29, 30 o 31, sin que nadie los cuente', () => {
  const casos = [
    ['2026-02', 28, 'febrero corriente'],
    ['2028-02', 29, 'febrero bisiesto'],
    ['2026-04', 30, 'un mes de treinta'],
    ['2026-07', 31, 'un mes de treinta y uno']
  ];
  for (const [mes, largo, que] of casos) {
    const { state, mangu } = cocina();
    const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
    const abierto = openMonth(state, mes);

    assert.equal(diasDe(mes).length, largo, `${que}: el calendario no tiene ${largo} días`);
    const lunes = diasDe(mes).filter(fecha => weekdayOf(fecha) === LUNES);
    assert.equal(abierto.creados.length, lunes.length, `${que}: no se pusieron todos los lunes`);
    // Uno por uno, y ninguno inventado.
    for (const fecha of lunes) {
      assert.ok(planFor(state, fecha, 'desayuno'), `${que}: falta el desayuno del ${fecha}`);
    }
    assert.equal(routinePlans(state, desayunos.id).length, lunes.length);
    // Y el progreso cuenta sobre los días de verdad, no sobre treinta fijos.
    assert.equal(monthProgress(state, mes).dias, largo);
    assert.equal(monthProgress(state, mes).huecos, largo * SLOTS_PRINCIPALES.length);
  }
});

test('el último día del mes no se queda fuera, caiga donde caiga', () => {
  // Un lunes 30 de noviembre, un jueves 31 de diciembre, un martes 29 de
  // febrero. Si las fechas se calcularan sumando semanas, aquí faltarían.
  const casos = [['2026-11', LUNES, '2026-11-30'], ['2026-12', 4, '2026-12-31'], ['2028-02', 2, '2028-02-29']];
  for (const [mes, dia, ultimo] of casos) {
    const { state, mangu } = cocina();
    addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [dia], scope: 'permanent' });
    openMonth(state, mes);
    assert.ok(planFor(state, ultimo, 'desayuno'), `falta el desayuno del ${ultimo}`);
  }
});

test('abrir un mes dos veces no rehace nada', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  const primera = openMonth(state, '2026-10');
  const cuantas = state.plans.length;
  const segunda = openMonth(state, '2026-10');
  assert.equal(segunda.yaAbierto, true);
  assert.equal(state.plans.length, cuantas, 'volver a entrar duplicó comidas');
  assert.ok(primera.creados.length > 0);
});

/* ── 2. Lunes de desayuno y viernes de cena, de la misma preparación ───── */

test('la misma preparación en dos momentos: dos reglas, y ni un cruce', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['cena'], weekdays: [VIERNES], scope: 'permanent' });
  openMonth(state, '2026-10');

  const suyas = state.plans.filter(plan => plan.recipeId === mangu);
  for (const plan of suyas) {
    const dia = weekdayOf(plan.date);
    if (plan.slot === 'desayuno') assert.equal(dia, LUNES, `desayuno de mangú en el día ${dia}`);
    else if (plan.slot === 'cena') assert.equal(dia, VIERNES, `cena de mangú en el día ${dia}`);
    else assert.fail(`el mangú apareció en «${plan.slot}»`);
  }
  assert.equal(suyas.filter(plan => plan.slot === 'desayuno').length, 4, 'octubre de 2026 tiene cuatro lunes');
  assert.equal(suyas.filter(plan => plan.slot === 'cena').length, 5, 'y cinco viernes');
  // Ni una cena el lunes, ni un desayuno el viernes.
  assert.equal(state.plans.filter(plan => weekdayOf(plan.date) === LUNES && plan.slot === 'cena').length, 0);
  assert.equal(state.plans.filter(plan => weekdayOf(plan.date) === VIERNES && plan.slot === 'desayuno').length, 0);
});

/* ── 3. Domingos alternos fuera ────────────────────────────────────────── */

test('primer y tercer domingo fuera: esos dos, y los otros domingos en casa', () => {
  const { state, locrio } = cocina();
  addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [DOMINGO], weeks: [1, 3], scope: 'permanent' });
  addRoutine(state, { kind: 'recipe', recipeId: locrio, slots: ['almuerzo'], weekdays: [DOMINGO], weeks: [2, 4], scope: 'permanent' });
  openMonth(state, '2026-10');

  // Octubre de 2026 empieza en jueves: sus domingos son 4, 11, 18 y 25.
  assert.equal(planFor(state, '2026-10-04', 'almuerzo').kind, 'outside');
  assert.equal(planFor(state, '2026-10-18', 'almuerzo').kind, 'outside');
  assert.equal(planFor(state, '2026-10-11', 'almuerzo').kind, 'recipe');
  assert.equal(planFor(state, '2026-10-25', 'almuerzo').kind, 'recipe');

  // Y en un mes que empieza en domingo, el primero es el día 1.
  const otro = cocina();
  addRoutine(otro.state, { kind: 'outside', slots: ['almuerzo'], weekdays: [DOMINGO], weeks: [1, 3], scope: 'permanent' });
  openMonth(otro.state, '2026-03');
  assert.deepEqual(datesForRule('2026-03', [DOMINGO], [1, 3]), ['2026-03-01', '2026-03-15']);
  assert.equal(planFor(otro.state, '2026-03-01', 'almuerzo').kind, 'outside');
  assert.equal(planFor(otro.state, '2026-03-08', 'almuerzo'), undefined, 'el segundo domingo no es de esta regla');
});

/* ── 4. Un mes futuro abierto antes de que existiera la regla ──────────── */

test('un mes ya preparado se entera de una regla nueva, y sin pisar lo que tenía', () => {
  const { state, mangu, locrio } = cocina();
  // Se prepara noviembre en octubre, con una sola costumbre.
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  openMonth(state, '2026-10');
  openMonth(state, '2026-11');
  // Y una decisión a mano en noviembre, de las que no se pueden perder.
  const aMano = makeRecipePlan(state, locrio, '2026-11-04', 'almuerzo', null);
  assert.equal(origenDe(aMano), 'manual');

  // Ahora se escribe una costumbre nueva, estando en octubre.
  const almuerzos = addRoutine(state, { kind: 'recipe', recipeId: locrio, slots: ['almuerzo'], weekdays: [3], scope: 'permanent' });
  applyRoutine(state, almuerzos.id, '2026-10', { modo: 'vacios' });

  // Noviembre ya estaba abierto: su único momento de escuchar había pasado.
  const pisaria = ocupadasEnMesesAbiertos(state, almuerzos.id, '2026-10');
  assert.equal(pisaria.length, 1, 'no se avisa de la comida que se pisaría');
  assert.equal(pisaria[0].date, '2026-11-04');

  const llevado = extenderAMesesAbiertos(state, almuerzos.id, '2026-10', { modo: 'vacios' });
  assert.deepEqual(llevado.meses, ['2026-11']);
  assert.ok(llevado.creados.length > 0, 'noviembre no se enteró de la regla nueva');

  // Lo que estaba a mano sigue estando, y sigue siendo suyo.
  const sigue = planFor(state, '2026-11-04', 'almuerzo');
  assert.equal(sigue.id, aMano.id, 'se pisó una decisión manual');
  assert.equal(sigue.routineId, null);
  assert.equal(origenDe(sigue), 'manual');
  // Y los demás miércoles de noviembre sí los puso la regla.
  const miercoles = diasDe('2026-11').filter(fecha => weekdayOf(fecha) === 3 && fecha !== '2026-11-04');
  for (const fecha of miercoles) {
    assert.equal(planFor(state, fecha, 'almuerzo')?.routineId, almuerzos.id, `falta el almuerzo del ${fecha}`);
  }
});

/* ── 5. Editar una sola fecha ──────────────────────────────────────────── */

test('cambiar una comida de un día no toca la regla ni los demás días', () => {
  const { state, mangu, revoltillo } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  openMonth(state, '2026-10');
  const antes = JSON.stringify(regla(state, desayunos.id));
  const lunes = diasDe('2026-10').filter(fecha => weekdayOf(fecha) === LUNES);

  // Lo que hace «cambiar solo este día»: se quita esa comida y se pone otra,
  // suelta de la regla y marcada como cambio manual.
  const uno = lunes[1];
  deletePlan(state, planFor(state, uno, 'desayuno').id);
  const puesta = makeRecipePlan(state, revoltillo, uno, 'desayuno', null, null, 'manual');

  assert.equal(JSON.stringify(regla(state, desayunos.id)), antes, 'cambiar un día tocó la regla');
  assert.equal(puesta.routineId, null, 'la comida nueva sigue colgando de la regla');
  assert.equal(origenDe(puesta), 'manual');
  // Los otros lunes siguen como estaban.
  for (const fecha of lunes.filter(item => item !== uno)) {
    assert.equal(planFor(state, fecha, 'desayuno').recipeId, mangu, `se cambió también el ${fecha}`);
    assert.equal(planFor(state, fecha, 'desayuno').routineId, desayunos.id);
  }
});

test('marcar un día fuera de casa no convierte esa salida en costumbre', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  openMonth(state, '2026-10');
  const cuantasReglas = state.mealRoutines.length;

  deletePlan(state, planFor(state, '2026-10-05', 'desayuno').id);
  const fuera = setStatusPlan(state, '2026-10-05', 'desayuno', 'outside');
  assert.equal(origenDe(fuera), 'excepcion', 'una salida suelta tiene que decir que es una excepción');
  assert.equal(state.mealRoutines.length, cuantasReglas, 'marcar un día escribió una regla que nadie pidió');

  // Y noviembre, que se abre después, no hereda esa salida.
  openMonth(state, '2026-11');
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11' && plan.kind === 'outside').length, 0);
});

/* ── 6. Cambiar la regla sin reescribir el historial ───────────────────── */

test('cambiar una costumbre vale de aquí en adelante y no reescribe lo que pasó', () => {
  const { state, mangu } = cocina();
  const desayunos = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  openMonth(state, '2026-09');
  openMonth(state, '2026-10');
  const septiembre = state.plans.filter(plan => plan.date.slice(0, 7) === '2026-09').map(plan => `${plan.date}|${plan.slot}|${plan.recipeId}`).sort();

  // Ahora la casa desayuna mangú los martes.
  updateRoutine(state, desayunos.id, { momento: 'desayuno', weekdays: [2] });
  applyRoutine(state, desayunos.id, '2026-10', { modo: 'vacios' });

  // Septiembre, que ya pasó, sigue diciendo lo que se comió.
  const despues = state.plans.filter(plan => plan.date.slice(0, 7) === '2026-09').map(plan => `${plan.date}|${plan.slot}|${plan.recipeId}`).sort();
  assert.deepEqual(despues, septiembre, 'cambiar la regla reescribió un mes que ya pasó');

  // Y noviembre, que se abre después, nace con la regla nueva.
  openMonth(state, '2026-11');
  const martes = diasDe('2026-11').filter(fecha => weekdayOf(fecha) === 2);
  for (const fecha of martes) assert.ok(planFor(state, fecha, 'desayuno'), `falta el desayuno del martes ${fecha}`);
  const lunesDeNoviembre = diasDe('2026-11').filter(fecha => weekdayOf(fecha) === LUNES);
  for (const fecha of lunesDeNoviembre) assert.equal(planFor(state, fecha, 'desayuno'), undefined, `noviembre puso un lunes: ${fecha}`);
});

test('las excepciones de un mes no se vuelven la costumbre del siguiente', () => {
  const { state, mangu, locrio } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [LUNES], scope: 'permanent' });
  openMonth(state, '2026-09');

  // Septiembre se sale de lo normal en tres cosas.
  setStatusPlan(state, '2026-09-12', 'almuerzo', 'outside');
  setStatusPlan(state, '2026-09-19', 'cena', 'order');
  makeRecipePlan(state, locrio, '2026-09-23', 'almuerzo', null, null, 'manual');

  openMonth(state, '2026-10');
  const octubre = state.plans.filter(plan => plan.date.slice(0, 7) === '2026-10');
  assert.equal(octubre.filter(plan => plan.kind === 'outside').length, 0, 'se copió una salida de septiembre');
  assert.equal(octubre.filter(plan => plan.kind === 'order').length, 0, 'se copió un pedido de septiembre');
  assert.equal(octubre.filter(plan => plan.recipeId === locrio).length, 0, 'se copió un cambio manual de septiembre');
  // Lo que sí se repite es la estructura habitual.
  assert.ok(octubre.filter(plan => plan.recipeId === mangu).length > 0, 'la costumbre no llegó a octubre');
  assert.ok(octubre.every(plan => plan.recipeId !== mangu || plan.routineId), 'las comidas de la costumbre tienen que decir de dónde vienen');
});

/* ── Dos fallos que salieron al recorrer esto en pantalla ──────────────────

   Los dos estaban en el camino principal de esta etapa —decidir qué se come— y
   ninguno se veía desde el modelo: vivían en cómo la pantalla lee y escribe. Se
   comprueban leyendo el código de `app.js`, que es lo que hace este proyecto
   con lo que necesita un navegador para ejecutarse. */

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

test('el recorrido mensual ya no pregunta por cantidades, existencias ni compra', () => {
  // Preparar el mes es decidir qué se come. Las cuatro cifras de la canasta y la
  // lista de lo que faltaría comprar convertían «ya está mi mes» en «ahora
  // repasa el inventario», que es donde se abandonaba.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-mes.js'), 'utf8');
  for (const muerta of ['function bloqueCanasta(', 'function bloqueCompra(', 'function cambiosEnLaCompra(', 'function seccionCanasta(']) {
    assert.ok(!codigo.includes(muerta), `sigue en el recorrido: ${muerta}`);
  }
  assert.ok(!/shoppingList\(/.test(codigo), 'el plan del mes vuelve a calcular la compra');
  assert.ok(!/monthBasketSummary\(/.test(codigo), 'el plan del mes vuelve a contar la canasta');
  assert.ok(!/inventoryNow\(/.test(codigo), 'el plan del mes vuelve a mirar las existencias');
  // Pero la compra no desapareció de la app: se dice dónde está.
  assert.ok(/se escribe en <strong>Compra<\/strong>/.test(codigo));
});

test('«cambiar solo este día» existe, y deja la comida nueva suelta de la regla', () => {
  // Antes había que quitar la comida y volver a ponerla, y quien lo intentaba
  // sobre una comida de una costumbre se topaba con la pregunta del alcance
  // —solo esta, las siguientes, toda la rutina— cuando lo único que quería era
  // cenar otra cosa ese jueves.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/data-form="sustituir"/.test(codigo), 'no hay forma de cambiar el plato de un solo día');
  assert.ok(/Cambiar solo este día/.test(codigo));
  // Solo se ofrecen las preparaciones que valen para ese momento.
  assert.ok(/recipe\.uses\.includes\(plan\.slot\) && recipe\.id !== plan\.recipeId/.test(codigo));
  // Y la que se pone nace sin regla y como cambio manual: eso es lo que impide
  // que la costumbre se la lleve por delante la próxima vez que se aplique.
  assert.ok(/makeRecipePlan\(state, receta\.id, date, slot, participants, null, 'manual'\)/.test(codigo),
    'la comida sustituida no queda marcada como cambio de ese día');
  // Una comida de la que cuelga una parte apartada no se sustituye a ciegas.
  assert.ok(/if \(dependents\(state, plan\.id\)\.length\) throw new Error/.test(codigo));
});
