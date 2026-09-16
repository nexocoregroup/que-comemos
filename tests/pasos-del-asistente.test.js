// Que el asistente prometa los pasos que luego enseña.
//
// Prometía ocho y enseñaba seis. No fue un descuido de una vez: fue verdad
// cuando se escribió —había ocho pasos, uno de ellos para dictar los alimentos
// de corrido—, y dejó de serlo cuando ese paso se quitó sin tocar la frase. Un
// número escrito a mano en una frase no sabe que alguien cambió una lista en
// otro archivo.
//
// Estas pruebas son lo que lo sabe.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PASO, PASOS, pasosDe, renderSetup } from '../src/setup.js';

// La pantalla de inicio es la que lleva la promesa. Se pide con `paso: 0`, que
// no es un paso sino la portada de antes de empezar.
const portada = setup => renderSetup({ ui: { setup: { paso: 0, elegidos: [], ...setup } } });

const NUMEROS = {
  Un: 1, Dos: 2, Tres: 3, Cuatro: 4, Cinco: 5, Seis: 6, Siete: 7, Ocho: 8, Nueve: 9
};

function prometidos(html) {
  const hit = html.match(/>(\w+) pasos cortos/);
  assert.ok(hit, 'la portada ya no dice cuántos pasos son');
  const n = NUMEROS[hit[1]];
  assert.ok(n, `«${hit[1]}» no es un número que sepamos leer`);
  return n;
}

test('la portada promete los pasos que de verdad se van a enseñar', () => {
  for (const frecuencia of [null, 'mensual', 'quincenal']) {
    const esperados = pasosDe({ frecuencia }).length;
    assert.equal(
      prometidos(portada({ frecuencia })),
      esperados,
      `comprando «${frecuencia}» se enseñan ${esperados} pasos y la portada promete otra cosa`
    );
  }
});

test('quien compra una vez al mes no ve el paso del reparto', () => {
  // No es un fallo que sean menos: es que repartir entre dos quincenas no
  // tiene nada que decidir si solo hay una compra. Lo que sería un fallo es
  // contárselo y luego no enseñárselo.
  const mensual = pasosDe({ frecuencia: 'mensual' });
  assert.ok(!mensual.some(paso => paso.id === PASO.reparto));
  assert.equal(mensual.length, PASOS.length - 1);
});

test('quien compra por quincenas los ve todos', () => {
  assert.equal(pasosDe({ frecuencia: 'quincenal' }).length, PASOS.length);
});

test('antes de contestar cómo compra, se le enseña el camino corto', () => {
  // Sin respuesta todavía no se puede saber, y prometer de menos y añadir uno
  // es mejor que prometer de más y quitarlo: el que aparece, aparece porque la
  // persona acaba de decir que compra por quincenas.
  assert.equal(pasosDe({}).length, pasosDe({ frecuencia: 'mensual' }).length);
});

test('ningún paso se queda sin nombre corto para el indicador', () => {
  for (const paso of PASOS) {
    assert.ok(paso.corto && paso.corto.trim(), `el paso ${paso.id} no tiene nombre corto`);
    assert.ok(paso.titulo && paso.titulo.trim(), `el paso ${paso.id} no tiene título`);
  }
});

test('los identificadores de los pasos no se repiten', () => {
  // Dos pasos con el mismo número hacen que el indicador marque el equivocado
  // y que «atrás» salte a otro sitio.
  const ids = PASOS.map(paso => paso.id);
  assert.equal(new Set(ids).size, ids.length);
});
