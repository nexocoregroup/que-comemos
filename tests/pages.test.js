import test from 'node:test';
import assert from 'node:assert/strict';

// Las pantallas se pueden probar, y hasta ahora no se probaban.
//
// Dos veces la aplicación se quedó en blanco porque una pantalla llamaba a algo
// que ya no existía. Ninguna prueba lo vio: todas probaban el modelo, y las
// pantallas «tocan el DOM, no se pueden cargar en Node».
//
// Eso era verdad de `app.js`, que lee `document` al arrancar. No lo es de los
// módulos de pantalla: `renderMes`, `renderCompra` y `renderMas` reciben un
// contexto y devuelven una cadena de HTML. Se pueden llamar aquí mismo, con un
// estado de verdad, y comprobar qué sale. Eso caza el «no es una función», el
// campo que cambió de forma y el `undefined` que se cuela en la pantalla.

import { createDemoState } from '../src/demo.js';
import { createEmptyState, setHabitualLine, addProduct, setMonthChange, todayISO } from '../src/model.js';
import { addRoutine } from '../src/routines.js';
import { PASOS, emptyMes, modalRutina, renderMes } from '../src/page-mes.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';
import { PAGINAS_MAS, emptyMas, renderMas } from '../src/page-mas.js';

const MES = todayISO().slice(0, 7);

// Lo mínimo que un módulo de pantalla necesita. Las funciones no hacen nada
// porque aquí solo se pinta: si una pantalla intentara guardar algo al
// dibujarse, eso sería el fallo, no la prueba.
function contexto(state, extra = {}) {
  return {
    state,
    ui: {
      page: 'hoy', modal: null, reviewId: null, correctingReview: false,
      mes: emptyMes(MES), compra: emptyCompra(MES), mas: emptyMas(),
      ...extra
    },
    commit: () => {}, toast: () => {}, render: () => {},
    closeModal: () => {}, openModal: () => {}, startTour: () => {},
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
}

// Un `undefined` dentro de una plantilla no lanza: se imprime tal cual y el
// usuario ve la palabra en pantalla. Es el fallo más silencioso de todos.
function revisar(html, donde) {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  assert.ok(html.length > 40, `${donde} devolvió una pantalla prácticamente vacía`);
  for (const basura of ['undefined', 'NaN', '[object Object]', 'null null']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  // Un `${...}` sin resolver significa que alguien anidó mal una plantilla.
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
}

/* ── Con datos ─────────────────────────────────────────────────────────── */

test('plan mensual se dibuja con datos', () => {
  const ctx = contexto(createDemoState());
  revisar(renderMes(ctx), 'renderMes (resumen)');
  ctx.ui.mes.vista = 'calendario';
  revisar(renderMes(ctx), 'renderMes (calendario)');
});

test('los cinco pasos de preparar el mes se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const paso of PASOS) {
    ctx.ui.mes.paso = paso.id;
    revisar(renderMes(ctx), `paso «${paso.id}»`);
  }
});

test('el formulario de una rutina se dibuja, con atajo y sin él', () => {
  const ctx = contexto(createDemoState());
  revisar(modalRutina(ctx, { month: MES }), 'modalRutina');
  revisar(modalRutina(ctx, { month: MES, atajo: 'primer-tercer', kind: 'outside' }), 'modalRutina (primer y tercer domingo)');
});

test('la compra se dibuja con las dos bases y los tres tramos', () => {
  const ctx = contexto(createDemoState());
  for (const base of ['casa', 'menu']) {
    ctx.ui.compra.base = base;
    for (const tramo of ['mes', 'primera', 'segunda']) {
      ctx.ui.compra.tramo = tramo;
      revisar(renderCompra(ctx), `renderCompra (${base} · ${tramo})`);
    }
  }
});

test('todas las pantallas de Más se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas («${pagina}»)`);
  }
});

test('la canasta se dibuja en sus dos vistas', () => {
  const ctx = contexto(createDemoState(), { page: 'canasta' });
  revisar(renderMas(ctx), 'canasta (lo de siempre)');
  ctx.ui.mas.canastaVista = 'cambios';
  revisar(renderMas(ctx), 'canasta (cambios del mes)');
});

/* ── Sin datos: los estados vacíos son los que más se ven ──────────────── */

test('todas las pantallas se dibujan con el estado vacío', () => {
  const vacio = createEmptyState();
  const ctx = contexto(vacio);
  revisar(renderMes(ctx), 'renderMes vacío');
  revisar(renderCompra(ctx), 'renderCompra vacía');
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas vacío («${pagina}»)`);
  }
  for (const paso of PASOS) {
    ctx.ui.mes.paso = paso.id;
    revisar(renderMes(ctx), `paso vacío «${paso.id}»`);
  }
});

test('un estado vacío ofrece qué hacer, no una pantalla en blanco', () => {
  const ctx = contexto(createEmptyState());
  const html = renderMes(ctx);
  assert.ok(html.includes('rutina'), 'el plan mensual vacío no explica qué es una rutina');
  assert.ok(html.includes('data-action='), 'el plan mensual vacío no ofrece ninguna acción');
});

/* ── Que no se filtre el vocabulario que se quitó ──────────────────────── */

// «Canasta base», «canasta mensual» y «base de cálculo» eran los tres términos
// que obligaban a entender la estructura interna para usar la app. Que no
// vuelvan por una plantilla olvidada.
test('ninguna pantalla enseña el vocabulario técnico que se retiró', () => {
  const PROHIBIDAS = ['canasta base', 'canasta del mes', 'canasta mensual', 'base de cálculo', 'unidad de control', 'promover a base', 'instancia mensual'];
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['mes', () => renderMes(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of ['mas', ...PAGINAS_MAS]) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

  const encontradas = [];
  for (const [nombre, dibujar] of pantallas) {
    const html = dibujar().toLocaleLowerCase('es');
    for (const termino of PROHIBIDAS) if (html.includes(termino)) encontradas.push(`${nombre}: «${termino}»`);
  }
  assert.deepEqual(encontradas, [], 'términos técnicos que volvieron a la interfaz');
});

/* ── Que un extra del mes se vea como tal ──────────────────────────────── */

test('un extra de un mes se enseña marcado, y no como parte de lo habitual', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' });
  setHabitualLine(state, arroz.id, 20, 'lb');
  setMonthChange(state, MES, cangrejo.id, { quantity: 4, unit: 'lb' });

  const ctx = contexto(state, { page: 'canasta' });
  ctx.ui.mas.canastaVista = 'habitual';
  const habitual = renderMas(ctx);
  assert.ok(habitual.includes('Arroz'), 'el arroz debería estar en lo de siempre');
  assert.ok(!habitual.includes('Cangrejo'), 'el cangrejo de este mes NO puede aparecer como habitual');

  ctx.ui.mas.canastaVista = 'cambios';
  const cambios = renderMas(ctx);
  assert.ok(cambios.includes('Cangrejo'), 'el cangrejo debería estar en los cambios del mes');
  revisar(cambios, 'canasta (cambios con un extra)');
});

/* ── Que una rutina se lea en palabras ─────────────────────────────────── */

test('el plan mensual describe una rutina en palabras, no en números', () => {
  const state = createEmptyState();
  addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3], scope: 'permanent', label: 'Almuerzo fuera' });
  const ctx = contexto(state);
  const html = renderMes(ctx);
  assert.ok(/domingo/i.test(html), 'la regla debería decir «domingo», no un número de día');
  assert.ok(!html.includes('weekdays') && !html.includes('[7]'), 'se está enseñando la estructura interna');
  revisar(html, 'renderMes con una rutina de domingos');
});
