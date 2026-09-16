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
  historialDeFrecuencia, inventoryNow, periodosDelMes, ponerFrecuencia, ponerReparto,
  quincenaDe, repartoDe, saveReview, setHabitualBasket, shoppingList
} from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';
import { PASO, PASOS, SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup, pasosDe, renderSetup } from '../src/setup.js';
import { PAGINAS_MAS, TITULOS_MAS, emptyMas, renderMas } from '../src/page-mas.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';

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

/* ── El reparto entre las dos quincenas ────────────────────────────────── */

test('sin tocar nada se reparte a la mitad, y las dos partes suman el mes', () => {
  const { state, arroz, huevo } = casa();
  const delArroz = repartoDe(state, arroz, 20);
  assert.deepEqual([delArroz.primera, delArroz.segunda], [10, 10]);
  assert.equal(delArroz.sugerido, true, 'es una sugerencia, no un dato escrito');
  const delHuevo = repartoDe(state, huevo, 60);
  assert.equal(delHuevo.primera + delHuevo.segunda, 60);
});

test('la mitad sugerida no se escribe en el disco: sigue viva si cambia el mes', () => {
  const { state, arroz } = casa();
  repartoDe(state, arroz, 20);
  assert.equal(state.settings.compra?.reparto?.[arroz], undefined, 'no se guardó nada');
  // Si mañana el mes son 30 libras, la sugerencia se rehace sola.
  assert.deepEqual([repartoDe(state, arroz, 30).primera, repartoDe(state, arroz, 30).segunda], [15, 15]);
});

test('un alimento se puede comprar entero en la primera quincena', () => {
  const { state, arroz } = casa();
  ponerReparto(state, arroz, 'todo');
  const reparto = repartoDe(state, arroz, 20);
  assert.deepEqual([reparto.primera, reparto.segunda], [20, 0]);
  assert.equal(reparto.sugerido, false);
  // Y sigue siendo «todo» aunque cambie la cantidad del mes.
  assert.deepEqual([repartoDe(state, arroz, 35).primera, repartoDe(state, arroz, 35).segunda], [35, 0]);
});

test('o entero en la segunda', () => {
  const { state, huevo } = casa();
  ponerReparto(state, huevo, 'nada');
  assert.deepEqual([repartoDe(state, huevo, 60).primera, repartoDe(state, huevo, 60).segunda], [0, 60]);
});

test('el reparto se edita por producto y cada uno va por su lado', () => {
  const { state, arroz, huevo } = casa();
  ponerReparto(state, arroz, 'todo');
  ponerReparto(state, huevo, 'cantidad', 25);
  assert.deepEqual([repartoDe(state, arroz, 20).primera, repartoDe(state, arroz, 20).segunda], [20, 0]);
  assert.deepEqual([repartoDe(state, huevo, 60).primera, repartoDe(state, huevo, 60).segunda], [25, 35]);
});

test('las dos partes suman siempre el mes, se escriba lo que se escriba', () => {
  // Es el criterio que no puede fallar: un alimento contado dos veces es una
  // compra de más todos los meses, y nadie lo descubre mirando la lista.
  const { state, arroz } = casa();
  for (const [modo, cantidad] of [['mitad', null], ['todo', null], ['nada', null], ['cantidad', 0], ['cantidad', 7], ['cantidad', 19.5], ['cantidad', 20], ['cantidad', 999], ['cantidad', -5]]) {
    ponerReparto(state, arroz, modo, cantidad);
    for (const total of [20, 7, 0.5, 33.333]) {
      const reparto = repartoDe(state, arroz, total);
      assert.equal(Math.round((reparto.primera + reparto.segunda) * 1000) / 1000, Math.round(total * 1000) / 1000,
        `con modo ${modo}${cantidad === null ? '' : ` (${cantidad})`} y ${total} al mes, las partes no suman el mes`);
      assert.ok(reparto.primera >= 0 && reparto.segunda >= 0, 'ninguna parte puede ser negativa');
    }
  }
});

test('«a la mitad» borra la decisión anterior en vez de guardar un número', () => {
  const { state, arroz } = casa();
  ponerReparto(state, arroz, 'todo');
  assert.ok(state.settings.compra.reparto[arroz]);
  ponerReparto(state, arroz, 'mitad');
  assert.equal(state.settings.compra.reparto[arroz], undefined);
  assert.equal(repartoDe(state, arroz, 20).sugerido, true);
});

test('repartir un alimento que ya no existe se rechaza', () => {
  const { state } = casa();
  assert.throws(() => ponerReparto(state, 'producto-inventado', 'todo'), /ya no existe/i);
});

/* ── De qué sirve: la lista de la compra ───────────────────────────────── */

test('la lista de una quincena usa el reparto, no los días del calendario', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  ponerReparto(state, arroz, 'todo');

  const primera = shoppingList(state, '2026-10-01', '2026-10-15', 'casa');
  const segunda = shoppingList(state, '2026-10-16', '2026-10-31', 'casa');
  const delArroz = lista => lista.lines.find(linea => linea.productId === arroz)?.need ?? 0;

  assert.equal(delArroz(primera), 20, 'el arroz entero entra en la primera compra');
  assert.equal(delArroz(segunda), 0, 'y no se vuelve a pedir en la segunda');
});

test('las dos quincenas juntas piden exactamente el mes, ni una libra de más', () => {
  const { state, arroz, huevo } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  ponerReparto(state, arroz, 'todo');
  ponerReparto(state, huevo, 'cantidad', 25);

  const primera = shoppingList(state, '2026-10-01', '2026-10-15', 'casa');
  const segunda = shoppingList(state, '2026-10-16', '2026-10-31', 'casa');
  const suma = id => (primera.lines.find(l => l.productId === id)?.need ?? 0) + (segunda.lines.find(l => l.productId === id)?.need ?? 0);

  assert.equal(suma(arroz), 20, 'el arroz del mes no se duplica');
  assert.equal(suma(huevo), 60, 'los huevos del mes no se duplican');
});

test('en febrero también suman el mes entero', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  const primera = shoppingList(state, '2026-02-01', '2026-02-15', 'casa');
  const segunda = shoppingList(state, '2026-02-16', '2026-02-28', 'casa');
  const suma = (primera.lines[0]?.need ?? 0) + (segunda.lines[0]?.need ?? 0);
  assert.equal(Math.round(suma * 1000) / 1000, 20);
});

test('a una casa mensual no le cambia la cuenta: sigue prorrateando por días', () => {
  const { state, arroz } = casa();
  // Sin frecuencia escrita, una quincena se calcula como antes: por días.
  const lista = shoppingList(state, '2026-10-01', '2026-10-15', 'casa');
  const esperado = Math.round(20 * (15 / 31) * 1000) / 1000;
  assert.equal(lista.lines.find(linea => linea.productId === arroz).need, esperado);
  assert.equal(quincenaDe(state, '2026-10-01', '2026-10-15'), null, 'sin frecuencia quincenal no hay quincena que valga');
});

test('un rango de fechas cualquiera sigue prorrateándose por días aunque la casa sea quincenal', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  ponerReparto(state, arroz, 'todo');
  // «Del 3 al 9» no es ninguna de las dos quincenas: no manda el reparto.
  assert.equal(quincenaDe(state, '2026-10-03', '2026-10-09'), null);
  const lista = shoppingList(state, '2026-10-03', '2026-10-09', 'casa');
  assert.equal(lista.lines.find(linea => linea.productId === arroz).need, Math.round(20 * (7 / 31) * 1000) / 1000);
});

test('el mes de antes del cambio se calcula con la frecuencia que tenía', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'mensual', '2026-01');
  ponerFrecuencia(state, 'quincenal', '2026-10');
  ponerReparto(state, arroz, 'todo');

  // Septiembre era mensual: la «primera quincena» de septiembre no existe como
  // período de compra, así que se prorratea por días y el reparto no manda.
  const septiembre = shoppingList(state, '2026-09-01', '2026-09-15', 'casa');
  assert.equal(septiembre.lines.find(linea => linea.productId === arroz).need, Math.round(20 * (15 / 30) * 1000) / 1000);
  // Octubre sí.
  const octubre = shoppingList(state, '2026-10-01', '2026-10-15', 'casa');
  assert.equal(octubre.lines.find(linea => linea.productId === arroz).need, 20);
});

/* ── Las pantallas ─────────────────────────────────────────────────────── */

test('el asistente pregunta la frecuencia con las palabras que se pidieron', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.compra;
  const html = renderSetup(ctx);
  revisar(html, 'paso de frecuencia');
  assert.ok(html.includes('¿Cada cuánto hacen la compra principal en tu hogar?'));
  assert.ok(html.includes('>Quincenal<'));
  assert.ok(html.includes('>Mensual<'));
});

test('el paso de las cantidades dice lo que se pidió y no obliga a rellenarlas', () => {
  const { state } = casa();
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.cantidades;
  ctx.ui.setup.elegidos = ['Arroz', 'Huevo'];
  const html = renderSetup(ctx);
  revisar(html, 'paso de cantidades');
  assert.ok(html.includes('Indica cuánto compras normalmente. Puedes completarlo o corregirlo después.'));
  assert.ok(!/obligatori[ao]/i.test(html), 'no puede decir que sea obligatorio');
});

test('el paso del reparto solo existe para quien compra por quincenas', () => {
  const mensual = { ...emptySetup(), frecuencia: 'mensual' };
  const quincenal = { ...emptySetup(), frecuencia: 'quincenal' };
  assert.equal(pasosDe(quincenal).length, PASOS.length);
  assert.equal(pasosDe(mensual).length, PASOS.length - 1);
  assert.ok(!pasosDe(mensual).some(paso => paso.id === PASO.reparto), 'a la casa mensual no se le enseña el reparto');
  assert.ok(pasosDe(quincenal).some(paso => paso.id === PASO.reparto));
});

test('elegir mensual salta el reparto y elegir quincenal pasa por él', () => {
  const ctx = contexto(casa().state);
  ctx.ui.setup.paso = PASO.cantidades;

  ctx.ui.setup.frecuencia = 'mensual';
  SETUP_ACTIONS['setup-siguiente'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.preparaciones, 'la casa mensual se salta el reparto');

  ctx.ui.setup.paso = PASO.cantidades;
  ctx.ui.setup.frecuencia = 'quincenal';
  SETUP_ACTIONS['setup-siguiente'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.reparto, 'la quincenal pasa por el reparto');
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

test('la pantalla del reparto se dibuja con las dos partes de cada alimento', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'quincenal', '2026-01');
  ponerReparto(state, arroz, 'todo');
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.reparto;
  ctx.ui.setup.frecuencia = 'quincenal';
  const html = renderSetup(ctx);
  revisar(html, 'paso del reparto');
  assert.ok(html.includes('Todo en la 1.ª'));
  assert.ok(html.includes('1.ª quincena'));
  assert.ok(html.includes('Repartido a la mitad porque no lo has cambiado.'), 'se dice cuál es solo una sugerencia');
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

test('la pantalla de la compra ofrece un período si es mensual y dos si es quincenal', () => {
  const { state } = casa();
  const ctx = contexto(state, 'compra');
  const mes = new Date().toISOString().slice(0, 7);

  ponerFrecuencia(state, 'mensual', mes);
  const mensual = renderCompra(ctx);
  revisar(mensual, 'compra mensual');
  assert.ok(!mensual.includes('data-tramo="primera"'), 'una casa mensual no elige quincena');

  ponerFrecuencia(state, 'quincenal', mes);
  const quincenal = renderCompra(ctx);
  revisar(quincenal, 'compra quincenal');
  assert.ok(quincenal.includes('data-tramo="primera"'));
  assert.ok(quincenal.includes('data-tramo="segunda"'));
  assert.ok(!quincenal.includes('data-tramo="mes"'), 'una casa quincenal no compra «todo el mes» por defecto');
});

test('cambiar de mes no deja abierto un tramo que ese mes no tiene', () => {
  const { state } = casa();
  const ctx = contexto(state, 'compra');
  const mes = new Date().toISOString().slice(0, 7);
  ponerFrecuencia(state, 'quincenal', mes);
  ctx.ui.compra.month = mes;
  ctx.ui.compra.tramo = 'mes';
  renderCompra(ctx);
  assert.ok(['primera', 'segunda'].includes(ctx.ui.compra.tramo), 'se corrige solo al tramo que toca');

  ponerFrecuencia(state, 'mensual', mes);
  renderCompra(ctx);
  assert.equal(ctx.ui.compra.tramo, 'mes');
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
