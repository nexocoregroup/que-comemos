// El acabado.
//
// Diez detalles que no cambian lo que se puede hacer con la app, solo cuánto
// cuesta: los conteos que hablaban como una máquina, el título escrito dos veces
// seguidas, los rubros que no eran encabezados de nada, el desplegable de setenta
// alimentos en orden de alta, el «Y 14 más» que no llevaba a ninguna parte.
//
// Casi todos se vigilan leyendo el HTML que sale. Los de app.js se leen como
// texto, porque ese archivo toca `document` al cargarse y no se puede importar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDemoState } from '../src/demo.js';
import { agregarALista, cerrarLista, crearLista, createEmptyState, agregarHabitual } from '../src/model.js';
import { COMPRA_ACTIONS, emptyCompra, renderCompra } from '../src/page-compra.js';
import { emptyMas, renderMas } from '../src/page-mas.js';
import { emptySemana } from '../src/page-semana.js';
import { conteo } from '../src/ui-kit.js';

const fuente = nombre => readFileSync(resolve(import.meta.dirname, '..', 'src', nombre), 'utf8');

function contexto(state, extra = {}) {
  const ctx = {
    state,
    ui: { page: 'hoy', modal: null, semana: emptySemana(), compra: emptyCompra(), mas: emptyMas(), ...extra },
    commit: () => {}, toast: () => {}, anunciar: () => {}, guardar: () => {},
    render: () => {}, closeModal: () => {}, openModal: () => {}
  };
  return ctx;
}

/* ── Hablar como una persona ───────────────────────────────────────────── */

test('no queda ni un «(s)» en lo que ve una persona', () => {
  /* Treinta y cinco sitios escribían «1 comida(s)». El paréntesis aparece
     porque el plural se decide al escribir la plantilla y el número no se sabe
     hasta que se pinta; `conteo()` lo decide al pintar.

     Se leen los comentarios aparte: uno de ellos explica justamente por qué se
     quitó, y nombrar lo retirado es la convención de este proyecto. */
  const archivos = readdirSync(resolve(import.meta.dirname, '..', 'src')).filter(nombre => nombre.endsWith('.js'));
  const culpables = [];
  for (const nombre of archivos) {
    const codigo = fuente(nombre)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/).filter(linea => !/^\s*\/\//.test(linea)).join('\n');
    for (const encaje of codigo.matchAll(/[a-záéíóúñ]+\((s|es)\)/gi)) culpables.push(`${nombre}: ${encaje[0]}`);
  }
  assert.deepEqual(culpables, [], 'volvió a hablar como una máquina que no quiso elegir');
});

test('conteo elige el plural al pintar, y el cero va en plural', () => {
  assert.equal(conteo(1, 'compra guardada', 'compras guardadas'), '1 compra guardada');
  assert.equal(conteo(3, 'compra guardada', 'compras guardadas'), '3 compras guardadas');
  assert.equal(conteo(0, 'compra guardada', 'compras guardadas'), '0 compras guardadas');
});

test('la misma cosa se llama igual en el botón y en la sección', () => {
  // «Añadir un alimento» en el «+» y «+ Añadir producto» en la sección abrían
  // exactamente el mismo formulario. Tres nombres para lo mismo siembran la duda
  // de si son tres sitios distintos.
  const codigo = fuente('app.js');
  const atajo = /\['open-product',[^\]]*\]/.exec(codigo)?.[0] || '';
  assert.ok(atajo, 'no encuentro el atajo del «+»');
  assert.ok(/Añadir un producto/.test(atajo), 'el «+» vuelve a llamarlo de otra manera que la sección');
});

/* ── Encabezados ───────────────────────────────────────────────────────── */

test('los rubros y los momentos del día son encabezados de nivel 2', () => {
  const state = createEmptyState();
  agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb' });

  const productos = renderMas(contexto(state, { page: 'canasta' }));
  assert.ok(/<h2 class="sr-only">Arroz, granos y pastas<\/h2>/.test(productos),
    'los rubros vuelven a no ser encabezados de nada: no hay forma de saltar de uno a otro');

  const preparaciones = renderMas(contexto(createDemoState(), { page: 'preparaciones' }));
  assert.ok(/<h2 class="sr-only">Desayunos<\/h2>/.test(preparaciones),
    'los bloques por momento del día vuelven a no aparecer en la lista de encabezados');
  // Y el encabezado va FUERA del control, no dentro: meter un encabezado dentro
  // de un `<summary>` hace que algunos lectores anuncien «encabezado nivel 2,
  // botón contraído», en un orden que confunde.
  assert.ok(!/<summary[^>]*>\s*<h\d/.test(productos + preparaciones), 'el encabezado se metió dentro del control');
});

test('las subpantallas de Ajustes no escriben su título dos veces', () => {
  // La cabecera de la app ya pinta el `<h1>`. Debajo iba un `<h2>` con el mismo
  // texto: dos renglones seguidos diciendo lo mismo en un teléfono de 375 px, y
  // para un lector un `h1` y un `h2` idénticos, que suena a error.
  const codigo = fuente('page-mas.js');
  assert.ok(!/\$\{volver\(/.test(codigo), 'volvió el título repetido de las subpantallas');
  assert.ok(!/function volver|const volver =/.test(codigo), 'quedó una función muerta devolviendo vacío');
  // El botón de volver no desapareció: subió a la cabecera de la app.
  assert.ok(/volver-a-ajustes/.test(fuente('app.js')), 'no hay forma de volver a Ajustes desde una subpantalla');
  assert.ok(/enSubpantallaDeAjustes/.test(fuente('app.js')));
});

/* ── Saber dónde estás ─────────────────────────────────────────────────── */

test('la sección en la que estás suena distinta de las otras cuatro', () => {
  const codigo = fuente('app.js');
  const barras = [...codigo.matchAll(/NAV\.map\([\s\S]{0,400}?\)\.join\(''\)/g)].map(encaje => encaje[0]);
  assert.equal(barras.length, 2, 'ya no son dos barras: revisar esta prueba antes que el código');
  for (const barra of barras) {
    assert.ok(/aria-current="page"/.test(barra),
      'recorriendo la barra, la pestaña actual vuelve a sonar igual que las otras cuatro');
  }
  // Y el toque en sí se anuncia. El foco cayendo al cuerpo hacía que el
  // siguiente deslizamiento leyera el título por accidente, no por diseño.
  assert.ok(/anunciar\(pageTitle\(\)\)/.test(codigo), 'cambiar de sección vuelve a ser mudo');
});

/* ── Listas largas ─────────────────────────────────────────────────────── */

test('los alimentos de una preparación salen agrupados y por orden', () => {
  // Setenta en un desplegable plano y en orden de alta. En Android eso es una
  // lista a pantalla completa, y se repite por cada alimento. Quien se cansa
  // guarda la preparación sin alimentos, y entonces la app no puede avisar de
  // ninguna alergia.
  const codigo = fuente('preparacion.js');
  const fn = /export function opcionesDeAlimento\([\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(fn, 'el desplegable de alimentos volvió a ser una línea');
  assert.ok(/<optgroup/.test(fn), 'el desplegable de alimentos vuelve a ser plano');
  assert.ok(/localeCompare/.test(fn), 'el desplegable de alimentos vuelve al orden de alta');
});

test('el historial de compras se puede terminar de ver', () => {
  const state = createEmptyState();
  for (let i = 0; i < 15; i += 1) {
    const lista = crearLista(state, { fecha: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}` });
    cerrarLista(state, lista.id);
  }
  const ctx = contexto(state, { page: 'compra' });
  const primero = renderCompra(ctx);
  assert.ok(!/Y \d+ más\./.test(primero), 'volvió el «Y 14 más.» que no lleva a ninguna parte');
  assert.ok(/data-action="compra-mas-historial"/.test(primero), 'no hay forma de ver las compras que faltan');

  COMPRA_ACTIONS['compra-mas-historial']({ dataset: {} }, ctx);
  assert.equal(ctx.ui.compra.cuantasCerradas, 24, 'el tope no sube');
  const segundo = renderCompra(ctx);
  assert.ok(!/data-action="compra-mas-historial"/.test(segundo), 'sigue ofreciendo ver más cuando ya no queda ninguna');
});

/* ── Errores donde se escribe ──────────────────────────────────────────── */

test('el error de «Escribirla» sale junto al campo, no en un aviso que se va', () => {
  const codigo = fuente('app.js');
  // No puede llevar `required`: los otros dos paneles solo están `hidden`, no
  // deshabilitados, y un campo obligatorio escondido bloquea el envío entero sin
  // que el navegador pueda enseñar dónde está.
  assert.ok(/errorTitulo/.test(codigo), 'el error del título vuelve al aviso flotante de 4,2 segundos');
  assert.ok(/id="mal-titulo"/.test(codigo) && /aria-describedby="mal-titulo"/.test(codigo),
    'el error se pinta pero el campo no lo señala');
  // Y la pestaña se queda donde estaba: repintar la devolvía a su sitio de
  // salida y lo escrito quedaba detrás de una pestaña cerrada.
  assert.ok(/m\.modo \|\| \(opciones\.length/.test(codigo), 'el repintado vuelve a cerrar la pestaña de «Escribirla»');
});

/* ── Un anillo de foco que se vea ──────────────────────────────────────── */

test('el anillo de foco existe, y solo con teclado', () => {
  const css = readFileSync(resolve(import.meta.dirname, '..', 'src', 'sistema.css'), 'utf8');
  const bloque = /\.field input:focus-visible[\s\S]*?\n\}/.exec(css)?.[0] || '';
  assert.ok(bloque, 'los campos vuelven a quedarse con un borde de 1 px como única señal de foco');
  assert.ok(/outline: 2px solid var\(--clay\)/.test(bloque));
  assert.ok(/outline-offset/.test(bloque), 'el anillo se pega al borde y se leen como uno solo');
  // `:focus` y no `:focus-visible` haría saltar el anillo en cada toque de dedo
  // sobre cada casilla de la tabla de entrada de corrido, que es ruido puro.
  assert.ok(!/\.field input:focus[^-]/.test(bloque), 'el anillo salta también al tocar con el dedo');
});

/* ── Los conteos de la compra, ya en la pantalla ───────────────────────── */

test('la compra cuenta cosas, y en singular cuando es una', () => {
  const state = createEmptyState();
  const arroz = agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb' }).productId;
  const ctx = contexto(state, { page: 'compra' });
  const lista = crearLista(state);
  agregarALista(state, lista.id, { productId: arroz, cantidad: 1, unidad: 'lb' });
  const html = renderCompra(ctx);
  assert.ok(/1 cosa apuntada/.test(html), `dijo «${/\d+ cosas? apuntadas?/.exec(html)?.[0]}»`);
  // «Cosa» y no «producto», y es a propósito: un renglón puede ser texto libre
  // —«papel de aluminio»— y no tener ficha de producto detrás.
  assert.ok(/cosa/.test(html));
});
