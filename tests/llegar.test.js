// Llegar a lo que vienes a hacer.
//
// La app no tenía una regla de dónde va la acción principal de una pantalla, y
// eso se pagaba en cinco sitios: en Mis productos habituales «+ Añadir
// producto» estaba a 1.929 px de la entrada, detrás de los setenta productos;
// en Ajustes había que leer ocho párrafos describiendo sitios donde todavía no
// habías entrado; en Plan semanal, un viernes, había que pasar cuatro días ya
// vividos para llegar a la cena de hoy.
//
// Y plegar un bloque estaba hecho de tres maneras distintas, con tres flechas
// distintas, y una de ellas repintaba la aplicación entera.
//
// Estas pruebas no abren un navegador —ninguna de este proyecto lo hace—, así
// que vigilan lo que sí se puede leer: la forma del HTML que sale y la forma
// del código que lo escribe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDemoState } from '../src/demo.js';
import { addDays, agregarHabitual, createEmptyState, todayISO, weekStart } from '../src/model.js';
import { emptySemana, renderSemana } from '../src/page-semana.js';
import { emptyCompra } from '../src/page-compra.js';
import { MAS_ACTIONS, emptyMas, renderMas } from '../src/page-mas.js';

const fuente = nombre => readFileSync(resolve(import.meta.dirname, '..', 'src', nombre), 'utf8');

function contexto(state, extra = {}) {
  const ui = { page: 'hoy', modal: null, semana: emptySemana(), compra: emptyCompra(), mas: emptyMas(), ...extra };
  return { state, ui, commit: () => {}, toast: () => {}, anunciar: () => {}, guardar: () => {}, render: () => {}, closeModal: () => {}, openModal: () => {} };
}

// El navegador abre y cierra el `<details>` él solo; al entrar en la acción el
// atributo `open` todavía vale lo de antes del clic. Esto lo imita.
const tocar = (accion, ctx, datos, estabaAbierto) =>
  MAS_ACTIONS[accion]({ dataset: datos, closest: () => ({ open: estabaAbierto }) }, ctx);

// ¿Está abierto el `<details>` cuyo `<summary>` lleva este atributo?
function abierto(html, atributo) {
  const encaje = new RegExp(`<details[^>]*>\\s*<summary[^>]*${atributo}`, 's').exec(html);
  assert.ok(encaje, `no encuentro el bloque con ${atributo}`);
  return / open[ >]/.test(encaje[0]);
}

function casaConProductos() {
  const state = createEmptyState();
  agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb' });
  agregarHabitual(state, { name: 'Salami', category: 'embutidos', unit: 'paquete' });
  agregarHabitual(state, { name: 'Plátano maduro', category: 'viveres', unit: 'unidad' });
  return state;
}

/* ── Un solo motor de plegado ──────────────────────────────────────────── */

test('todo lo que se pliega en la app se pliega con el mismo <details>', () => {
  // Había tres motores: `<details class="plegable">`, un `<details>` con flecha
  // de texto, y un `<button aria-expanded>` que al plegarse llamaba a
  // `render()` y repintaba la aplicación completa. Los tres significaban lo
  // mismo. Queda el primero, que es el que el propio proyecto documenta como el
  // bueno: el navegador resuelve teclado y lector de pantalla.
  const archivos = readdirSync(resolve(import.meta.dirname, '..', 'src')).filter(nombre => nombre.endsWith('.js'));
  const culpables = [];
  for (const nombre of archivos) {
    const codigo = fuente(nombre).split(/\r?\n/).filter(linea => !/^\s*(\/\/|\*|\/\*)/.test(linea)).join('\n');
    for (const encaje of codigo.matchAll(/<button[^>]*aria-expanded[^>]*>/g)) {
      /* Dos excepciones, y las dos son estructurales, no un atajo.

         El menú lateral no es un bloque plegable: abre un cajón que tapa la
         pantalla.

         Y el renglón de la compra no puede ser un `<details>`: sus controles
         tienen que ocupar la fila entera DEBAJO de un renglón cuya primera
         celda es otro botón —el de tachar—, y un `<details>` obliga a que su
         contenido cuelgue de él, así que arrastraría también la flecha. El
         gesto sí es el mismo: la misma «›» que gira, con `aria-expanded`. */
      if (/menu-toggle|compra-mas/.test(encaje[0])) continue;
      culpables.push(`${nombre}: ${encaje[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(culpables, [], 'volvió un segundo motor de plegado a la app');
});

test('plegar y desplegar no repinta la pantalla entera', () => {
  // Es la mitad del arreglo: `<details>` sin esto sigue costando un repintado,
  // y como la página se acorta al plegar, el dedo pierde el sitio.
  const codigo = fuente('page-mas.js');
  for (const nombre of ['receta-plegar', 'rubro-plegar']) {
    const trozo = new RegExp(`'${nombre}': \\(.*?\\n  \\},`, 's').exec(codigo)?.[0];
    assert.ok(trozo, `no encuentro la acción ${nombre}`);
    assert.ok(!/ctx\.render\(\)/.test(trozo), `${nombre} vuelve a repintar la aplicación entera al plegar`);
    assert.ok(/closest\('details'\)/.test(trozo), `${nombre} ya no lee en qué quedó el <details>`);
  }
});

/* ── Mis productos habituales ──────────────────────────────────────────── */

test('los ocho rubros empiezan plegados, y el buscador los abre', () => {
  const ctx = contexto(casaConProductos(), { page: 'canasta' });
  const cerrados = renderMas(ctx);
  assert.ok(!abierto(cerrados, 'data-rubro="granos"'), 'los rubros vuelven a abrirse todos de golpe');
  // Pero la cabecera y su cuenta sí se ven: el rubro plegado tiene que decir
  // cuántos hay dentro, o plegarlo sería esconderlo.
  assert.ok(cerrados.includes('Arroz, granos y pastas'), 'el rubro plegado no dice ni cómo se llama');
  assert.ok(cerrados.includes('badge-count'), 'el rubro plegado no dice cuántos hay dentro');

  tocar('rubro-plegar', ctx, { rubro: 'granos' }, false);
  assert.ok(abierto(renderMas(ctx), 'data-rubro="granos"'), 'abrir un rubro no se recuerda');

  // Buscando se abren todos: esconder detrás de un pliegue justo lo que se
  // acaba de pedir sería el peor de los dos mundos.
  const ctxBuscando = contexto(casaConProductos(), { page: 'canasta' });
  ctxBuscando.ui.mas.habitualFiltro = 'salami';
  const buscando = renderMas(ctxBuscando);
  assert.ok(abierto(buscando, 'data-rubro="proteinas"'), 'lo que coincide se quedó plegado');
  assert.ok(!buscando.includes('Arroz'), 'el buscador no filtra nada');
});

test('la acción principal de Productos está arriba, antes de la lista', () => {
  const html = renderMas(contexto(casaConProductos(), { page: 'canasta' }));
  const anadir = html.indexOf('data-action="open-product"');
  const primerRubro = html.indexOf('data-action="rubro-plegar"');
  assert.ok(anadir > -1 && primerRubro > -1, 'falta el botón de añadir o falta la lista');
  assert.ok(anadir < primerRubro, '«+ Añadir producto» volvió al fondo, detrás de los ocho rubros');
  // Y con el mismo peso que «+ Nueva preparación» en la pantalla de al lado.
  assert.ok(/data-action="open-product"[^>]*/.test(html));
  assert.ok(/class="btn btn-primary"[^>]*data-action="open-product"|data-action="open-product"[^>]*btn-primary|btn-primary[^>]*data-action="open-product"/.test(html)
    || /<button[^>]*btn-primary[^>]*data-action="open-product"/.test(html),
    'el botón de añadir sigue siendo secundario en una pantalla y primario en su gemela');
});

test('Productos habituales tiene buscador, como su pantalla gemela', () => {
  const html = renderMas(contexto(casaConProductos(), { page: 'canasta' }));
  assert.ok(html.includes('id="habitual-filtro"'), 'no hay forma de buscar entre setenta nombres');
  assert.ok(html.includes('type="search"'));
  // Y el despachador de teclas tiene que conocerlo por su id, o el campo se
  // pinta y no filtra nada.
  assert.ok(/'habitual-filtro':/.test(fuente('app.js')), 'el buscador se pinta pero nadie lee lo que se escribe');
  // El cadáver del buscador de la pantalla retirada ya no está.
  // Sin comentarios: el porqué de su retirada está escrito ahí y nombra lo que
  // se fue, que es justo lo que este proyecto pide que se escriba.
  const sinComentarios = codigo => codigo.split(/\r?\n/)
    .filter(linea => !/^\s*(\/\/|\*|\/\*)/.test(linea))
    .join('\n');
  assert.ok(!/alimento-filtro|filtroAlimento/.test(sinComentarios(fuente('app.js'))), 'volvió el buscador muerto');
});

/* ── Ajustes ───────────────────────────────────────────────────────────── */

test('Ajustes es un índice de filas, no ocho párrafos', () => {
  const html = renderMas(contexto(createDemoState(), { page: 'ajustes' }));
  const filas = [...html.matchAll(/class="ajustes-fila"/g)].length;
  assert.ok(filas >= 8, `Ajustes volvió a ser otra cosa: ${filas} fila(s)`);
  // Cada fila dice cuánto hay al otro lado. Eso es lo que ahorra entrar.
  assert.ok(/\d+ personas? en casa|Todavía no hay nadie/.test(html), 'la fila de Familia no dice cuánta gente hay');
  assert.ok(/\d+ compras? guardadas?|Todavía no hay ninguna compra/.test(html), 'la fila de Historial no dice cuántas compras hay');
});

/* ── Plan semanal ──────────────────────────────────────────────────────── */

test('los días ya vividos van plegados, y solo cuando hoy está a la vista', () => {
  const state = createDemoState();
  const lunes = weekStart(todayISO());
  const hoyEsLunes = todayISO() === lunes;

  const ctx = contexto(state, { page: 'semana' });
  const estaSemana = renderSemana(ctx);
  if (hoyEsLunes) {
    // Un lunes no hay nada que plegar, y el bloque no puede aparecer vacío.
    assert.ok(!estaSemana.includes('semana-pasados'), 'un lunes aparece un bloque de días pasados que está vacío');
  } else {
    assert.ok(estaSemana.includes('semana-pasados'), 'los días ya vividos vuelven a ocupar lo mismo que los que quedan');
    assert.ok(!abierto(estaSemana, 'data-action="semana-ver-pasados"'), 'los días pasados empiezan abiertos');
    assert.ok(/ya pas(ó|aron)/.test(estaSemana), 'el bloque plegado no dice qué es');
  }

  // Mirando otra semana no hay «ya pasó» que valga: plegarla entera dejaría una
  // pantalla con una sola línea.
  const otra = contexto(state, { page: 'semana' });
  otra.ui.semana.inicio = weekStart(addDays(lunes, -21));
  assert.ok(!renderSemana(otra).includes('semana-pasados'), 'una semana entera del pasado se pliega en una sola línea');

  const futura = contexto(state, { page: 'semana' });
  futura.ui.semana.inicio = weekStart(addDays(lunes, 21));
  assert.ok(!renderSemana(futura).includes('semana-pasados'), 'una semana que no ha llegado tiene días «ya pasados»');
});

/* ── El «+» flotante ───────────────────────────────────────────────────── */

test('el «+» no ofrece ir a donde ya estás', () => {
  // Estando en Compra, el atajo «Preparar la compra» cerraba la hoja y no
  // pasaba nada más. Un botón que no responde una vez enseña a no volver a
  // tocarlo, y con él se pierden los otros tres, que sí sirven.
  const codigo = fuente('app.js');
  const trozo = /function rapidasDeAqui\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0];
  assert.ok(trozo, 'el «+» volvió a ofrecer lo mismo en las cinco secciones');
  assert.ok(/data-page="\$\{ui\.page\}"/.test(trozo), 'el «+» ya no descarta el destino en el que estás');
  // Y el atajo que en el colmado guardaba el alimento en el sitio equivocado
  // solo se cambia cuando hay una lista donde meterlo.
  assert.ok(/listaEnCurso\(state\)/.test(trozo),
    'el atajo de apuntar en la lista aparece también sin lista abierta, donde no hace nada');
});
