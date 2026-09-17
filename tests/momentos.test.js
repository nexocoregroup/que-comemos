import test from 'node:test';
import assert from 'node:assert/strict';

// Cinco momentos en toda la aplicación.
//
// Dos ideas gobiernan este archivo, y las dos son restas:
//
// 1. Las meriendas existen pero no se exigen. Un día sin merienda anotada está
//    completo, porque hay casas que no meriendan y decirles que les faltan dos
//    comidas es reprocharles una costumbre que no tienen.
//
// 2. La app avisa, no prohíbe. Antes una comida con un alimento que alguien
//    evitaba no se dejaba guardar, y en una casa real se cocina lo mismo y a
//    quien no puede se le hace otra cosa. Ahora se avisa con la gravedad que
//    toca y decide quien cocina.

import {
  MOMENTOS, SLOTS, SLOTS_PRINCIPALES, addProduct, choquesDeLaComida, createEmptyState,
  deletePlan, effectiveBasket, esOpcional, etiquetaDeMomento, gravedadDeLaComida, inventoryNow,
  makeRecipePlan, monthProgress, planFor, setAbsence, setHabitualBasket, setStatusPlan,
  upsertPerson, upsertRecipe
} from '../src/model.js';
import { emptyMes, renderMes } from '../src/page-mes.js';

function contexto(state, extra = {}) {
  return {
    state,
    ui: { page: 'mes', modal: null, mes: emptyMes('2026-10'), ...extra },
    commit: () => {}, toast: () => {}, render: () => {}, closeModal: () => {}, openModal: () => {}, startTour: () => {}
  };
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
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const leche = addProduct(state, { name: 'Leche', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const pan = addProduct(state, { name: 'Pan', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 20, unit: 'lb', priority: 'obligatorio' }]);
  return { state, arroz, leche, pan };
}

/* ── Los cinco momentos, en todas partes ───────────────────────────────── */

test('el día tiene cinco momentos y tres de ellos son los que se cuentan', () => {
  assert.deepEqual(SLOTS, ['desayuno', 'merienda-manana', 'almuerzo', 'merienda-tarde', 'cena']);
  assert.deepEqual(SLOTS_PRINCIPALES, ['desayuno', 'almuerzo', 'cena']);
  assert.deepEqual(SLOTS.filter(esOpcional), ['merienda-manana', 'merienda-tarde']);
});

test('cada momento tiene su nombre escrito, no un identificador con guion', () => {
  assert.equal(etiquetaDeMomento('merienda-manana'), 'Merienda de mañana');
  assert.equal(etiquetaDeMomento('merienda-tarde'), 'Merienda de tarde');
  for (const momento of MOMENTOS) {
    assert.ok(!/-/.test(momento.etiqueta), `«${momento.etiqueta}» parece un identificador y no un nombre`);
  }
});

test('se puede poner una comida en cualquiera de los cinco', () => {
  const { state, pan } = casa();
  const merienda = upsertRecipe(state, { name: 'Pan con queso', uses: [...SLOTS], items: [{ productId: pan, quantity: 2, unit: 'unidad' }] });
  for (const slot of SLOTS) {
    const plan = makeRecipePlan(state, merienda.id, '2026-10-05', slot);
    assert.equal(plan.slot, slot);
  }
  assert.equal(state.plans.length, 5, 'los cinco momentos del mismo día conviven');
});

test('las preparaciones se filtran por el momento', () => {
  const { state, pan } = casa();
  upsertRecipe(state, { name: 'Solo merienda', uses: ['merienda-tarde'], items: [{ productId: pan, quantity: 1, unit: 'unidad' }] });
  upsertRecipe(state, { name: 'Desayuno y cena', uses: ['desayuno', 'cena'], items: [] });

  const paraMomento = slot => state.recipes.filter(receta => receta.uses.includes(slot)).map(receta => receta.name);
  assert.deepEqual(paraMomento('merienda-tarde'), ['Solo merienda']);
  assert.deepEqual(paraMomento('desayuno'), ['Desayuno y cena']);
  assert.deepEqual(paraMomento('cena'), ['Desayuno y cena'], 'la misma vale para los dos, sin duplicarse');
  assert.deepEqual(paraMomento('merienda-manana'), []);
  assert.equal(state.recipes.length, 2);
});

/* ── Las meriendas son opcionales ──────────────────────────────────────── */

test('un día con las tres comidas puestas y sin meriendas está completo', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: [...SLOTS], items: [] });
  for (const slot of SLOTS_PRINCIPALES) makeRecipePlan(state, receta.id, '2026-10-05', slot);

  const hechas = SLOTS_PRINCIPALES.filter(slot => planFor(state, '2026-10-05', slot)).length;
  assert.equal(hechas, SLOTS_PRINCIPALES.length);
  assert.equal(SLOTS.filter(esOpcional).every(slot => !planFor(state, '2026-10-05', slot)), true, 'las meriendas están vacías');
});

test('un mes entero sin ninguna merienda llega al cien por cien', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: [...SLOTS], items: [] });
  for (let dia = 1; dia <= 31; dia++) {
    const fecha = `2026-10-${String(dia).padStart(2, '0')}`;
    for (const slot of SLOTS_PRINCIPALES) makeRecipePlan(state, receta.id, fecha, slot);
  }
  const progreso = monthProgress(state, '2026-10');
  assert.equal(progreso.pendientes, 0, 'no queda ningún hueco');
  assert.equal(progreso.porcentaje, 100);
  assert.equal(progreso.huecos, 31 * 3, 'los huecos que se cuentan son tres al día, no cinco');
  assert.equal(progreso.meriendas, 0);
});

test('las meriendas puestas se cuentan aparte y no cambian el porcentaje', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: [...SLOTS], items: [] });
  makeRecipePlan(state, receta.id, '2026-10-05', 'merienda-tarde');
  const progreso = monthProgress(state, '2026-10');
  assert.equal(progreso.meriendas, 1);
  assert.equal(progreso.huecos, 31 * 3, 'una merienda puesta no añade un hueco nuevo');
  assert.equal(progreso.encasa, 0, 'ni se cuenta como una de las tres');
});

test('el calendario del mes se dibuja con los cinco momentos', () => {
  const { state, pan } = casa();
  const receta = upsertRecipe(state, { name: 'Pan con queso', uses: [...SLOTS], items: [{ productId: pan, quantity: 1, unit: 'unidad' }] });
  makeRecipePlan(state, receta.id, '2026-10-05', 'merienda-tarde');
  makeRecipePlan(state, receta.id, '2026-10-05', 'desayuno');
  const ctx = contexto(state);
  ctx.ui.mes.vista = 'calendario';
  const html = renderMes(ctx);
  revisar(html, 'calendario');
  assert.ok(html.includes('data-slot="merienda-tarde"'), 'la merienda puesta está en el calendario');
  assert.ok(html.includes('Merienda de tarde del'), 'y se llama por su nombre');
  assert.ok(html.includes('+ merienda'), 'y se puede añadir la que falta');
});

test('el resumen del mes enseña los cinco momentos, con las meriendas marcadas como opcionales', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: [...SLOTS], items: [] });
  makeRecipePlan(state, receta.id, '2026-10-05', 'almuerzo');
  const html = renderMes(contexto(state));
  revisar(html, 'resumen del mes');
  for (const momento of MOMENTOS) assert.ok(html.includes(momento.etiqueta), `falta «${momento.etiqueta}»`);
  assert.ok(html.includes('Opcional: puede quedar vacía'));
});

/* ── Avisar, no prohibir ───────────────────────────────────────────────── */

function conAlergia() {
  const { state, arroz, leche } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', restricciones: [
    { productId: leche, texto: '', motivo: 'alergia' },
    { productId: arroz, texto: '', motivo: 'preferencia' }
  ], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', restricciones: [{ productId: arroz, texto: '', motivo: 'intolerancia' }], habitual: [] });
  return { state, arroz, leche, sofia, luis };
}

test('una alergia, una intolerancia y una preferencia tienen tres gravedades distintas', () => {
  const { state, arroz, leche, sofia, luis } = conAlergia();
  const conLeche = choquesDeLaComida(state, [{ productId: leche, quantity: 1, unit: 'unidad' }], [sofia.id, luis.id]);
  assert.equal(conLeche.length, 1);
  assert.equal(conLeche[0].gravedad, 3);
  assert.equal(conLeche[0].motivo, 'alergia');

  const conArroz = choquesDeLaComida(state, [{ productId: arroz, quantity: 2, unit: 'lb' }], [sofia.id, luis.id]);
  assert.equal(conArroz.length, 2);
  assert.equal(conArroz[0].gravedad, 2, 'la intolerancia se lee antes que la preferencia');
  assert.equal(conArroz[0].persona, 'Luis');
  assert.equal(conArroz[1].gravedad, 1);
  assert.equal(conArroz[1].persona, 'Sofía');
});

test('la gravedad de una comida es la de su peor choque', () => {
  const { state, arroz, leche, sofia, luis } = conAlergia();
  const items = [{ productId: leche, quantity: 1, unit: 'unidad' }, { productId: arroz, quantity: 2, unit: 'lb' }];
  assert.equal(gravedadDeLaComida(choquesDeLaComida(state, items, [sofia.id, luis.id])), 3);
  assert.equal(gravedadDeLaComida(choquesDeLaComida(state, [{ productId: arroz, quantity: 2, unit: 'lb' }], [luis.id])), 2);
  assert.equal(gravedadDeLaComida(choquesDeLaComida(state, [{ productId: arroz, quantity: 2, unit: 'lb' }], [sofia.id])), 1);
  assert.equal(gravedadDeLaComida(choquesDeLaComida(state, items, [])), 0, 'sin nadie no hay choque');
});

test('una restricción sin motivo avisa, y avisa en medio', () => {
  const { state, leche } = casa();
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [{ productId: leche, texto: '', motivo: null }], habitual: [] });
  const choques = choquesDeLaComida(state, [{ productId: leche, quantity: 1, unit: 'unidad' }], [ana.id]);
  assert.equal(choques.length, 1);
  assert.equal(choques[0].motivo, null);
  assert.equal(choques[0].gravedad, 2, 'sin decir por qué, se trata como intolerancia: ni se rebaja ni se alarma');
});

test('la comida con una alergia dentro se guarda igual', () => {
  const { state, leche, sofia } = conAlergia();
  const receta = upsertRecipe(state, { name: 'Arroz con leche', uses: ['merienda-tarde'], items: [{ productId: leche, quantity: 2, unit: 'unidad' }] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'merienda-tarde');
  assert.ok(plan, 'se guarda');
  assert.ok(plan.participants.includes(sofia.id), 'con Sofía incluida');
  assert.equal(gravedadDeLaComida(choquesDeLaComida(state, plan.items, plan.participants)), 3, 'y avisando fuerte');
});

test('quitar a la persona del choque quita el aviso', () => {
  const { state, leche, sofia, luis } = conAlergia();
  const receta = upsertRecipe(state, { name: 'Arroz con leche', uses: ['cena'], items: [{ productId: leche, quantity: 2, unit: 'unidad' }] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'cena', [luis.id]);
  assert.deepEqual(plan.participants, [luis.id]);
  assert.equal(choquesDeLaComida(state, plan.items, plan.participants).length, 0);
  assert.ok(sofia);
});

/* ── Una ausencia no encoge la olla ────────────────────────────────────── */

test('marcar a alguien fuera no cambia la comida ni el inventario', () => {
  const { state, pan } = casa();
  state.opening[pan] = 20;
  const receta = upsertRecipe(state, { name: 'Pan', uses: ['cena'], items: [{ productId: pan, quantity: 6, unit: 'unidad' }] });
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'cena');

  const antes = { items: structuredClone(plan.items), participantes: [...plan.participants], inventario: inventoryNow(state)[pan] };
  setAbsence(state, '2026-10-05', 'cena', ana.id, true);

  assert.deepEqual(plan.items, antes.items, 'se cocina lo mismo');
  assert.deepEqual(plan.participants, antes.participantes, 'y para los mismos');
  assert.equal(inventoryNow(state)[pan], antes.inventario, 'el inventario no se mueve');
  assert.equal(state.plans.length, 1, 'la cena no se cancela');
});

test('una ausencia con todo el mundo fuera tampoco borra la comida', () => {
  const { state, pan } = casa();
  const receta = upsertRecipe(state, { name: 'Pan', uses: ['cena'], items: [{ productId: pan, quantity: 6, unit: 'unidad' }] });
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'cena');
  setAbsence(state, '2026-10-05', 'cena', ana.id, true);
  assert.equal(state.plans.length, 1);
  assert.equal(plan.kind, 'recipe', 'no se convierte en «fuera de casa»');
});

test('lo que se marca fuera de casa sigue resolviendo el momento', () => {
  const { state } = casa();
  const pendientesAntes = monthProgress(state, '2026-10').pendientes;

  setStatusPlan(state, '2026-10-05', 'merienda-tarde', 'outside');
  assert.equal(planFor(state, '2026-10-05', 'merienda-tarde').kind, 'outside');
  assert.equal(monthProgress(state, '2026-10').pendientes, pendientesAntes, 'una merienda nunca fue un hueco');

  setStatusPlan(state, '2026-10-05', 'almuerzo', 'outside');
  const progreso = monthProgress(state, '2026-10');
  assert.equal(progreso.pendientes, pendientesAntes - 1, 'un almuerzo fuera sigue contando como hueco');
  assert.equal(progreso.fuera, 1, 'y la merienda de fuera no se suma a las tres del día');
});

test('la canasta del mes no baja por una ausencia', () => {
  // La canasta de la casa no se recalcula porque un hijo coma fuera un martes.
  const { state, arroz } = casa();
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  const cuanto = () => effectiveBasket(state, '2026-10').find(linea => linea.productId === arroz).quantity;
  const antes = cuanto();
  setAbsence(state, '2026-10-05', 'cena', ana.id, true);
  assert.equal(cuanto(), antes);
});

test('deletePlan sigue funcionando con los momentos nuevos', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: ['merienda-manana'], items: [] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'merienda-manana');
  deletePlan(state, plan.id);
  assert.equal(planFor(state, '2026-10-05', 'merienda-manana'), undefined);
});
