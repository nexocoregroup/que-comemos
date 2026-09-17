// «Escribir o dictar varios» tenía un destino llamado «Compra confirmada: ya
// está en casa» que subía el inventario. La app dejó de llevar inventario, así
// que ese destino prometía una consecuencia que no ocurría y pedía una casilla
// de confirmación para ella.
//
// Ahora una compra ya hecha se guarda como lista cerrada, igual que la que se
// termina en la pantalla de la compra y la que se le dicta al asistente. Tres
// caminos que anotan la misma cosa tienen que acabar en el mismo sitio, o el
// historial cuenta la compra de la casa en dos formatos distintos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BULK_FORMS, emptyBulk } from '../src/bulk-entry.js';
import { createEmptyState, listasAbiertas, listasCerradas, productByName, resumenDeLista } from '../src/model.js';

// El formulario recibe un `FormData`; aquí basta con algo que sepa `get`.
const datos = pares => ({ get: clave => (clave in pares ? String(pares[clave]) : null) });

function contexto(state, destino) {
  const avisos = [];
  return {
    state,
    bulk: emptyBulk(destino),
    avisos,
    render: () => {},
    commit: mensaje => avisos.push(['ok', mensaje]),
    toast: (mensaje, error) => avisos.push([error ? 'error' : 'ok', mensaje]),
    closeModal: () => {}
  };
}

// Paso 1: el texto se lee y quedan las filas listas para revisar.
function escribir(ctx, texto, destino) {
  BULK_FORMS['bulk-texto'](null, datos({ texto, destino }), ctx);
  assert.ok(ctx.bulk.filas.length, `no se entendió ninguna fila de «${texto}»`);
}

// Paso 2: guardar. El formulario de revisión relee la tabla; sin navegador se
// le da una que no tiene ninguna fila, y entonces `leerFilas` conserva las que
// dejó el paso 1 —que es justo lo que se quiere guardar—.
const tablaVacia = { querySelectorAll: () => [] };
const guardar = (ctx, pares = {}) => BULK_FORMS['bulk-revision'](tablaVacia, datos(pares), ctx);

const errorDe = ctx => ctx.avisos.filter(([tipo]) => tipo === 'error').at(-1)?.[1];

test('una compra escrita queda en el historial como lista cerrada', () => {
  const state = createEmptyState();
  const ctx = contexto(state, 'compra');
  escribir(ctx, 'Compramos 6 latas de atún y 10 libras de arroz.', 'compra');
  guardar(ctx, { confirmo: 'si' });

  assert.equal(errorDe(ctx), undefined, 'guardar dio error');

  const cerradas = listasCerradas(state);
  assert.equal(cerradas.length, 1, 'no quedó una lista cerrada en el historial');
  assert.equal(listasAbiertas(state).length, 0, 'quedó una lista abierta a medias');
  assert.equal(cerradas[0].lineas.length, 2);

  // Todo queda anotado como traído: quien escribe «compramos» está contando lo
  // que ya metió en casa, no lo que piensa buscar.
  assert.equal(resumenDeLista(state, cerradas[0].id).pendientes, 0, 'la compra ya hecha dejó líneas pendientes');
  for (const linea of cerradas[0].lineas) {
    assert.equal(linea.comprado, true, `«${linea.texto}» no quedó marcada como traída`);
  }
});

test('anotar una compra no toca las existencias de nadie', () => {
  const state = createEmptyState();
  const ctx = contexto(state, 'compra');
  escribir(ctx, 'Compramos 6 latas de atún.', 'compra');
  guardar(ctx, { confirmo: 'si' });

  // `purchases` y `opening` eran de donde salía el inventario.
  assert.deepEqual(state.purchases, [], 'volvió a escribir en el historial de existencias');
  // Registrar un alimento nuevo le pone su apertura en cero, y eso sigue igual;
  // lo que no puede pasar es que la compra suba ninguna.
  assert.deepEqual(Object.values(state.opening).filter(Boolean), [], 'la compra subió alguna existencia');

  // El alimento sí se registra: eso es lo que sigue teniendo sentido.
  assert.ok(productByName(state, 'Atún'), 'el atún no quedó en el catálogo');
});

test('sin marcar la casilla no se guarda nada, y el error no habla de existencias', () => {
  const state = createEmptyState();
  const ctx = contexto(state, 'compra');
  escribir(ctx, 'Compramos 6 latas de atún.', 'compra');
  guardar(ctx);

  assert.equal(listasCerradas(state).length, 0, 'guardó sin confirmar');
  const mensaje = errorDe(ctx);
  assert.match(mensaje, /historial/i);
  assert.ok(!/existencias/i.test(mensaje), 'el error sigue hablando de existencias');
});

test('ningún destino de esta pantalla promete subir existencias', () => {
  // Se leen los textos que se pintan, no los comentarios que cuentan por qué
  // esto se quitó.
  const fuente = readFileSync(new URL('../src/bulk-entry.js', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(linea => !/^\s*(\/\/|\*|\/\*)/.test(linea)).join('\n');
  for (const prohibido of [/sube las existencias/i, /existencias subieron/i, /existencias deben subir/i, /ya están en casa/i]) {
    assert.ok(!prohibido.test(fuente), `bulk-entry.js todavía promete «${prohibido}»`);
  }
});
