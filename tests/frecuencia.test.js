import test from 'node:test';
import assert from 'node:assert/strict';

// Cada cuánto se hace la compra.
//
// La mitad de este archivo comprueba una sola cosa: que cambiar hoy la
// frecuencia no reescriba lo que pasó en marzo. Si en marzo se compró una vez
// al mes, marzo se compró una vez al mes, y el historial tiene que seguir
// diciendo eso dentro de dos años. La otra mitad comprueba que las dos
// quincenas sumen siempre el mes entero: un alimento contado dos veces es una
// compra de más todos los meses.

import {
  addProduct, addPurchase, createEmptyState, createReview, frecuenciaDe, habitualLines,
  historialDeFrecuencia, inventoryNow, periodosDelMes, ponerFrecuencia,
  saveReview, setHabitualBasket, agregarALista, cerrarLista, listasCerradas
} from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';
import { PASO, PASOS, SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup, pasosDe, renderSetup } from '../src/setup.js';
import { PAGINAS_MAS, TITULOS_MAS, emptyMas, renderMas } from '../src/page-mas.js';
import { COMPRA_ACTIONS, emptyCompra, listaEnCurso, renderCompra } from '../src/page-compra.js';

const nodoTonto = () => ({ value: '', focus() {}, classList: { toggle() {} }, closest: () => null, querySelector: () => null });
globalThis.document = { querySelectorAll: () => [], querySelector: () => nodoTonto() };

function contexto(state = createEmptyState(), page = 'setup') {
  const ctx = {
    state,
    ui: { page, modal: null, setup: emptySetup(), mas: emptyMas(), compra: emptyCompra(), voz: { destino: '', estado: 'quieto', sesion: 0 } },
    avisos: [],
    commit: mensaje => { if (mensaje) ctx.avisos.push(mensaje); },
    guardar: () => {},
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {}, closeModal: () => {}, openModal: () => {}, startTour: () => {},
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

// Una casa con arroz y huevos escritos en la canasta base.
function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  // Una casa que lleva años comprando lo mismo. La fecha de vigencia va escrita
  // a propósito: sin ella la canasta empezaría hoy, y las pruebas de aquí
  // preguntan por meses que ya pasaron —febrero, marzo— para comprobar cómo se
  // reparten los días, no desde cuándo se come arroz en esta casa.
  setHabitualBasket(state, [
    { productId: arroz, quantity: 20, unit: 'lb', priority: 'obligatorio', desde: '2025-01' },
    { productId: huevo, quantity: 60, unit: 'unidad', priority: 'frecuente', desde: '2025-01' }
  ]);
  return { state, arroz, huevo };
}

/* ── Los períodos ──────────────────────────────────────────────────────── */

test('sin decir nada, la compra es mensual y genera un solo período', () => {
  const { state } = casa();
  assert.equal(frecuenciaDe(state, '2026-09'), 'mensual');
  const periodos = periodosDelMes(state, '2026-09');
  assert.equal(periodos.length, 1);
  assert.deepEqual([periodos[0].start, periodos[0].end], ['2026-09-01', '2026-09-30']);
  assert.equal(periodos[0].dias, 30);
});

test('la quincenal genera dos períodos: del 1 al 15 y del 16 al último día real', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  const periodos = periodosDelMes(state, '2026-10');
  assert.equal(periodos.length, 2);
  assert.deepEqual([periodos[0].start, periodos[0].end], ['2026-10-01', '2026-10-15']);
  assert.deepEqual([periodos[1].start, periodos[1].end], ['2026-10-16', '2026-10-31']);
});

test('febrero, los meses de 30 y los de 31 salen bien, y el bisiesto también', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2020-01');
  const esperado = {
    '2026-02': [['2026-02-01', '2026-02-15', 15], ['2026-02-16', '2026-02-28', 13]],
    '2028-02': [['2028-02-01', '2028-02-15', 15], ['2028-02-16', '2028-02-29', 14]],
    '2026-04': [['2026-04-01', '2026-04-15', 15], ['2026-04-16', '2026-04-30', 15]],
    '2026-05': [['2026-05-01', '2026-05-15', 15], ['2026-05-16', '2026-05-31', 16]]
  };
  for (const [mes, filas] of Object.entries(esperado)) {
    const periodos = periodosDelMes(state, mes);
    assert.equal(periodos.length, 2, `${mes} debería tener dos quincenas`);
    for (const [indice, [start, end, dias]] of filas.entries()) {
      assert.equal(periodos[indice].start, start, `${mes}: inicio de la quincena ${indice + 1}`);
      assert.equal(periodos[indice].end, end, `${mes}: fin de la quincena ${indice + 1}`);
      assert.equal(periodos[indice].dias, dias, `${mes}: días de la quincena ${indice + 1}`);
    }
    // La primera quincena son siempre 15 días, nunca 14: no son ventanas
    // móviles, son los días del calendario en que la casa come.
    assert.equal(periodos[0].dias, 15, `${mes}: la primera quincena siempre son 15 días`);
    assert.equal(periodos[0].dias + periodos[1].dias, periodosDelMes(createEmptyState(), mes)[0].dias, `${mes}: las dos quincenas tienen que cubrir el mes entero`);
  }
});

test('las dos quincenas cubren el mes entero, sin huecos ni solapes, doce meses seguidos', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  for (let mes = 1; mes <= 12; mes++) {
    const clave = `2026-${String(mes).padStart(2, '0')}`;
    const [primera, segunda] = periodosDelMes(state, clave);
    assert.equal(primera.end, `${clave}-15`);
    assert.equal(segunda.start, `${clave}-16`, `${clave}: la segunda empieza el 16, no catorce días después`);
    assert.ok(primera.end < segunda.start, `${clave}: no se solapan`);
  }
});

/* ── Versionada, no global ─────────────────────────────────────────────── */

test('mensual hasta septiembre, quincenal desde octubre: cada mes con lo suyo', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'mensual', '2026-01');
  ponerFrecuencia(state, 'quincenal', '2026-10');

  assert.equal(frecuenciaDe(state, '2026-08'), 'mensual');
  assert.equal(frecuenciaDe(state, '2026-09'), 'mensual');
  assert.equal(frecuenciaDe(state, '2026-10'), 'quincenal');
  assert.equal(frecuenciaDe(state, '2027-03'), 'quincenal', 'sigue vigente hasta que alguien diga otra cosa');

  assert.equal(periodosDelMes(state, '2026-09').length, 1);
  assert.equal(periodosDelMes(state, '2026-10').length, 2);
});

test('los meses anteriores al primer tramo son mensuales, como siempre fue la app', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-10');
  assert.equal(frecuenciaDe(state, '2025-01'), 'mensual');
  assert.equal(frecuenciaDe(state, '2026-09'), 'mensual');
});

test('cambiar la frecuencia no toca ni una compra ni una revisión anterior', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'mensual', '2026-01');

  // Marzo: se compra y se revisa, con la frecuencia mensual vigente.
  addPurchase(state, { date: '2026-03-02', period: { start: '2026-03-01', end: '2026-03-31' }, basis: 'casa', lines: [{ productId: arroz, quantity: 20, unit: 'lb' }] });
  const revision = createReview(state, '2026-03-28');
  saveReview(state, revision.id, { [arroz]: 6 }, true);

  const comprasAntes = JSON.stringify(state.purchases);
  const revisionesAntes = JSON.stringify(state.reviews);
  const inventarioAntes = inventoryNow(state)[arroz];

  ponerFrecuencia(state, 'quincenal', '2026-10');

  assert.equal(JSON.stringify(state.purchases), comprasAntes, 'la compra de marzo no se tocó');
  assert.equal(JSON.stringify(state.reviews), revisionesAntes, 'la revisión de marzo no se tocó');
  assert.equal(inventoryNow(state)[arroz], inventarioAntes, 'el inventario da lo mismo');
  assert.equal(frecuenciaDe(state, '2026-03'), 'mensual', 'marzo se siguió comprando una vez al mes');
});

test('dos tramos seguidos que dicen lo mismo no se guardan dos veces', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  ponerFrecuencia(state, 'quincenal', '2026-05');
  assert.equal(historialDeFrecuencia(state).length, 1, 'el segundo tramo no cambia nada');
  assert.equal(historialDeFrecuencia(state)[0].desde, '2026-01');
});

test('cambiar de idea sobre el mismo mes lo sustituye en vez de acumular', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'mensual', '2026-01');
  ponerFrecuencia(state, 'quincenal', '2026-10');
  ponerFrecuencia(state, 'mensual', '2026-10');
  assert.deepEqual(historialDeFrecuencia(state).map(fila => fila.tipo), ['mensual']);
  assert.equal(frecuenciaDe(state, '2026-10'), 'mensual');
});

test('una frecuencia inventada o un mes inválido se rechazan con un mensaje claro', () => {
  const { state } = casa();
  assert.throws(() => ponerFrecuencia(state, 'semanal', '2026-01'), /mensual o quincenal/i);
  assert.throws(() => ponerFrecuencia(state, 'mensual', 'el mes que viene'), /desde qué mes/i);
  assert.throws(() => ponerFrecuencia(state, 'mensual', '2026-13'), /desde qué mes/i);
});

test('un historial con basura escrita a mano no rompe nada', () => {
  const { state } = casa();
  state.settings.compra = { frecuencia: [{ desde: '2026-13', tipo: 'mensual' }, { desde: '2026-10', tipo: 'anual' }, null, 'qué', { desde: '2026-10', tipo: 'quincenal' }] };
  assert.deepEqual(historialDeFrecuencia(state), [{ desde: '2026-10', tipo: 'quincenal' }]);
  assert.equal(frecuenciaDe(state, '2026-11'), 'quincenal');
});

test('la frecuencia sobrevive a guardar y volver a leer', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-10');
  const datos = new Map();
  const storage = {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave),
    key: indice => [...datos.keys()][indice] ?? null,
    get length() { return datos.size; }
  };
  saveState(state, storage);
  assert.equal(frecuenciaDe(loadState(storage), '2026-10'), 'quincenal');
});

/* ── Las pantallas ─────────────────────────────────────────────────────── */

test('el asistente pregunta la frecuencia, y dice para qué sirve y para qué no', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.compra;
  const html = renderSetup(ctx);
  revisar(html, 'paso de frecuencia');
  assert.ok(html.includes('Cómo compramos'), 'el paso no se llama como se pidió');
  assert.ok(html.includes('>Quincenal<'));
  assert.ok(html.includes('>Mensual<'));
  // Lo que este dato NO hace, dicho en la propia pantalla: es la promesa que
  // sostiene que no haya que escribir cantidades en ninguna parte.
  assert.ok(/No divide cantidades, no calcula nada y no te impide salir otro día/.test(html));
  // Y que se puede cambiar sin reescribir lo que ya pasó.
  assert.ok(/Lo que ya pasó no se reescribe/.test(html));
});

test('el recorrido ya no tiene ningún paso de cantidades ni de reparto', () => {
  // Eran dos pasos y se fueron. Quien marcaba ciento cincuenta alimentos se
  // encontraba después con ciento cincuenta casillas de cantidad antes de poder
  // terminar, y ese número no hace falta para nada de lo que la app hace ahora.
  assert.equal(PASO.cantidades, undefined);
  assert.equal(PASO.reparto, undefined);
  assert.equal(PASOS.length, 5);
  assert.deepEqual(PASOS.map(paso => paso.corto), ['Hogar', 'Productos', 'Compra', 'Preparaciones', 'Mi plan']);
});

test('ninguna pantalla del recorrido pide una cantidad', () => {
  // La comprobación de fondo de toda la etapa: se recorren los cinco pasos, con
  // la casa vacía y con la casa llena, y en ninguno puede aparecer un campo
  // donde escribir cuánto se compra de algo.
  const llena = casa().state;
  for (const state of [createEmptyState(), llena]) {
    const ctx = contexto(state);
    ctx.ui.setup.elegidos = ['Arroz', 'Huevo'];
    for (const paso of PASOS) {
      ctx.ui.setup.paso = paso.id;
      const html = renderSetup(ctx);
      revisar(html, `paso «${paso.corto}»`);
      assert.ok(!/name="cantidad"/.test(html), `el paso «${paso.corto}» pide una cantidad`);
      assert.ok(!/data-setup-cantidad/.test(html), `el paso «${paso.corto}» dibuja filas de cantidad`);
      assert.ok(!/data-reparto-primera/.test(html), `el paso «${paso.corto}» pide el reparto de la quincena`);
    }
  }
});

test('los cinco pasos son los mismos se compre como se compre', () => {
  // Antes el del reparto solo se le enseñaba a quien compraba por quincenas, y
  // por eso la portada prometía un número de pasos y se veía otro. Ya no hay
  // ningún paso condicional.
  for (const frecuencia of [null, 'mensual', 'quincenal']) {
    assert.equal(pasosDe({ ...emptySetup(), frecuencia }).length, 5, `comprando «${frecuencia}» se ven otros`);
  }
});

test('desde la frecuencia se sigue a las comidas, se compre como se compre', () => {
  for (const frecuencia of ['mensual', 'quincenal']) {
    const ctx = contexto(casa().state);
    ctx.ui.setup.paso = PASO.compra;
    ctx.ui.setup.frecuencia = frecuencia;
    SETUP_ACTIONS['setup-siguiente'](null, ctx);
    assert.equal(ctx.ui.setup.paso, PASO.preparaciones, `comprando «${frecuencia}» se va a otro sitio`);
  }
});

test('elegir la frecuencia en el asistente la deja escrita desde este mes', () => {
  const ctx = contexto(casa().state);
  ctx.ui.setup.paso = PASO.compra;
  SETUP_ACTIONS['setup-frecuencia']({ dataset: { frecuencia: 'quincenal' } }, ctx);
  assert.equal(ctx.ui.setup.frecuencia, 'quincenal');
  assert.equal(historialDeFrecuencia(ctx.state).length, 1);
  assert.equal(frecuenciaDe(ctx.state, historialDeFrecuencia(ctx.state)[0].desde), 'quincenal');
  // Y sobrevive a cerrar la app.
  assert.equal(avanceGuardado(ctx.state).frecuencia, 'quincenal');
});

test('la página de Organización de compra se dibuja, con y sin historial', () => {
  const { state } = casa();
  const ctx = contexto(state, 'organizacion');
  revisar(renderMas(ctx), 'organización sin historial');
  assert.ok(renderMas(ctx).includes('Frecuencia de compra'));

  ponerFrecuencia(state, 'mensual', '2026-01');
  ponerFrecuencia(state, 'quincenal', '2026-10');
  const html = renderMas(ctx);
  revisar(html, 'organización con historial');
  assert.ok(html.includes('Cómo se reparte el mes') || frecuenciaDe(state, new Date().toISOString().slice(0, 7)) !== 'quincenal');

  ctx.ui.mas.cambiandoFrecuencia = true;
  const conFormulario = renderMas(ctx);
  revisar(conFormulario, 'organización con el formulario abierto');
  assert.ok(conFormulario.includes('¿Desde qué mes entra en vigencia?'));
  assert.ok(conFormulario.includes('(recomendado)'), 'se recomienda un mes');
});

test('la página está enrutada y tiene título', () => {
  assert.ok(PAGINAS_MAS.includes('organizacion'));
  assert.equal(TITULOS_MAS.organizacion, 'Organización de compra');
});

test('el formulario de cambio nunca ofrece un mes ya pasado', () => {
  const { state } = casa();
  const ctx = contexto(state, 'organizacion');
  ctx.ui.mas.cambiandoFrecuencia = true;
  const html = renderMas(ctx);
  const mesActual = new Date().toISOString().slice(0, 7);
  const anterior = new Date(`${mesActual}-01T12:00:00`);
  anterior.setMonth(anterior.getMonth() - 1);
  const clave = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
  assert.ok(!html.includes(`value="${clave}"`), 'no se puede cambiar hacia atrás');
  assert.ok(html.includes(`value="${mesActual}"`), 'el mes en curso sí se ofrece');
});

test('la compra no espera a ningún período: se abre una lista cuando haga falta', () => {
  // La frecuencia dice cuándo TOCA la próxima compra, y eso sigue valiendo. Lo
  // que ya no hace es cerrarle la puerta a nadie: una casa que compra por
  // quincenas también baja al colmado un martes porque se acabó el café.
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  const ctx = contexto(state, 'compra');

  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const primera = listaEnCurso(state);
  assert.ok(primera, 'no se pudo abrir una lista');
  agregarALista(state, primera.id, { productId: state.products[0].id, cantidad: 2, unidad: 'lb' });
  cerrarLista(state, primera.id);

  // Y otra el mismo día, sin esperar nada.
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const segunda = listaEnCurso(state);
  assert.ok(segunda && segunda.id !== primera.id, 'no se puede hacer una salida extra');
  assert.equal(listasCerradas(state).length, 1);

  const html = renderCompra(ctx);
  revisar(html, 'la compra');
  // Y la pantalla ya no obliga a elegir un tramo antes de ver nada.
  assert.ok(!html.includes('data-tramo='), 'sigue pidiendo elegir un período de cálculo');
});

test('los siete pasos del asistente se dibujan sin huecos', () => {
  const { state } = casa();
  const ctx = contexto(state);
  ctx.ui.setup.frecuencia = 'quincenal';
  ctx.ui.setup.elegidos = ['Arroz', 'Huevo'];
  for (const paso of PASOS) {
    ctx.ui.setup.paso = paso.id;
    revisar(renderSetup(ctx), `paso ${paso.id} («${paso.corto}»)`);
  }
});

test('la pregunta no viene contestada de antemano', () => {
  // Pintar «Mensual» ya marcada sería contestar por el usuario la pregunta que
  // acabamos de hacerle, y dejarle pulsar Continuar sin haber decidido nada.
  const ctx = contexto(casa().state);
  ctx.ui.setup.paso = PASO.compra;
  const virgen = renderSetup(ctx);
  assert.ok(!virgen.includes('setup-opcion activa'), 'ninguna opción viene marcada');
  assert.ok(/data-action="setup-siguiente"[^>]*disabled/.test(virgen), 'no se puede continuar sin contestar');

  SETUP_ACTIONS['setup-frecuencia']({ dataset: { frecuencia: 'quincenal' } }, ctx);
  const contestada = renderSetup(ctx);
  assert.ok(contestada.includes('setup-opcion activa'), 'ya marcada la que se eligió');
  assert.ok(!/data-action="setup-siguiente"[^>]*disabled/.test(contestada));
});

test('quien vuelve a pasar por el asistente encuentra marcada la que ya tenía', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.compra;
  const html = renderSetup(ctx);
  assert.ok(html.includes('data-frecuencia="quincenal" aria-pressed="true"'));
  assert.ok(html.includes('data-frecuencia="mensual" aria-pressed="false"'));
});

test('el repaso no dice «sin decidir» a quien ya lo decidió hace meses', () => {
  // La frecuencia vive en los ajustes de la casa, no en el borrador de este
  // recorrido. Quien la contestó en agosto y vuelve a pasar por aquí en octubre
  // llega con el borrador en blanco, y leer «sin decidir» sobre algo decidido
  // es la clase de mentira pequeña que hace desconfiar del resto de la pantalla.
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', '2025-01');
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.casa;
  ctx.ui.setup.frecuencia = null;
  const html = renderSetup(ctx);
  revisar(html, 'repaso con la frecuencia ya escrita');
  assert.ok(html.includes('Dos compras al mes'));
  assert.ok(!html.includes('Sin decidir'));

  // Y a quien no la ha contestado sí se lo dice.
  const nueva = contexto(createEmptyState());
  nueva.ui.setup.paso = PASO.casa;
  assert.ok(renderSetup(nueva).includes('Sin decidir'));
});
