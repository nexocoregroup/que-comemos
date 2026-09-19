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

import { createEmptyState } from '../src/model.js';
import { PASO, PASOS, emptySetup, pasosDe, renderSetup } from '../src/setup.js';

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

test('ya no hay ningún paso que dependa de una respuesta anterior', () => {
  // Lo que provocó el «ocho pasos y veo seis» fue justo eso: un paso —el del
  // reparto entre quincenas— que solo se le enseñaba a una parte de la gente.
  // Ese paso salió del recorrido, así que la cuenta no puede volver a moverse
  // por lo que alguien conteste a mitad de camino.
  for (const frecuencia of [null, 'mensual', 'quincenal']) {
    assert.deepEqual(
      pasosDe({ frecuencia }).map(paso => paso.id), PASOS.map(paso => paso.id),
      `comprando «${frecuencia}» se ven otros pasos`
    );
  }
});

test('el recorrido es el que se pidió: hogar, productos, preparaciones y el primer plan', () => {
  assert.deepEqual(PASOS.map(paso => paso.id), [PASO.personas, PASO.alimentos, PASO.preparaciones, PASO.plan]);
  assert.deepEqual(PASOS.map(paso => paso.titulo),
    ['Mi hogar', 'Mis productos habituales', 'Mis preparaciones', 'Crear mi primer plan']);
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

/* ── El título de cada paso ────────────────────────────────────────────── */

// Un paso se pinta con muy poco: el estado y su propio molde.
const pantallaDelPaso = paso => renderSetup({
  state: createEmptyState(),
  ui: { setup: { ...emptySetup(), paso } }
});

// El `<h2>` de la cabecera del paso, con sus atributos. Se acota a
// `.setup-head` porque los pasos 4 y 5 traen sus propios `<h2>` en el cuerpo.
function encabezadoDelPaso(html) {
  const cabecera = /<div class="setup-head">([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[1] || html;
  const hit = /<h2([^>]*)>([^<]*)<\/h2>/.exec(cabecera);
  return hit && { atributos: hit[1], texto: hit[2], oculto: /class="[^"]*\bsr-only\b/.test(hit[1]) };
}

test('ningún paso se queda sin encabezado, se vea o no', () => {
  /* En el paso de los rubros había tres títulos seguidos: «Organizar mi casa»
     en la cabecera de la app, «Mis productos habituales» aquí, y «Otros
     productos habituales» dos renglones más abajo. Los dos últimos dicen casi
     lo mismo, y el de abajo es el que informa porque cambia con cada una de
     las ocho categorías.

     El de en medio se esconde, no se borra: es el único encabezado de la
     pantalla —la línea de la categoría es un `<p role="status">`, y un
     elemento no puede ser a la vez encabezado de la página y región que
     anuncia cambios—. Quien navega por encabezados tiene que seguir sabiendo
     en qué paso está. */
  for (const paso of PASOS) {
    const encabezado = encabezadoDelPaso(pantallaDelPaso(paso.id));
    assert.ok(encabezado, `el paso «${paso.titulo}» se quedó sin <h2>`);
    assert.equal(encabezado.texto, paso.titulo,
      `el paso «${paso.titulo}» dice otra cosa en su encabezado`);
  }
});

test('un paso solo esconde su título si la pantalla de debajo ya lo dice', () => {
  /* La regla, y no la lista: esconder un título porque «estorba» deja una
     pantalla sin nombre visible. Solo vale cuando lo que viene debajo trae su
     propio título, y aquí el único que lo trae es el de los rubros. Si mañana
     alguien esconde otro, esta prueba pide que enseñe cuál es el que se queda. */
  for (const paso of PASOS) {
    const html = pantallaDelPaso(paso.id);
    const encabezado = encabezadoDelPaso(html);
    if (!encabezado.oculto) continue;

    const deLaCategoria = /<p class="setup-rubro"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/.exec(html)?.[1];
    assert.ok(deLaCategoria,
      `el paso «${paso.titulo}» esconde su título y debajo no hay ningún otro que lo sustituya`);
    assert.notEqual(deLaCategoria, paso.titulo,
      `el paso «${paso.titulo}» esconde su título para enseñar el mismo texto debajo`);
  }

  // Y que siga habiendo exactamente uno escondido: si se ponen a cero, este
  // arreglo se deshizo sin que nadie se enterara.
  const escondidos = PASOS.filter(paso => encabezadoDelPaso(pantallaDelPaso(paso.id)).oculto);
  assert.deepEqual(escondidos.map(paso => paso.id), [PASO.alimentos],
    'cambió qué pasos esconden su título; si es a propósito, dilo aquí');
});
