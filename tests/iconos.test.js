// Los iconos.
//
// `icono('nombre')` devuelve cadena vacía si el nombre no existe. Eso es a
// propósito —ninguna pantalla puede quedarse en blanco por un dibujo— pero
// tiene un precio: un nombre mal escrito no rompe nada, no avisa de nada, y
// simplemente deja un hueco donde tenía que haber un icono. Nadie se entera
// hasta que alguien mira esa pantalla en un teléfono.
//
// Esta prueba es quien se entera. Lee el código fuente, saca todos los nombres
// que se piden de verdad y comprueba que cada uno existe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// `fileURLToPath` y no `.pathname`: esta carpeta se llama «Proyectos NexoCore»,
// con un espacio, y en una URL el espacio viaja como %20. Sin convertir la ruta
// de vuelta, Node busca una carpeta llamada «Jose%20Manuel%20Diaz».
import { fileURLToPath } from 'node:url';

import { ICONO_DE_CATEGORIA, icono, iconoDeCategoria, nombresDeIconos } from '../src/icons.js';
import { CATEGORIES, RUBROS } from '../src/catalog-seed.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// Los nombres que el código pide: icono('algo') y icono(`algo`).
function nombresPedidos() {
  const pedidos = new Map();
  for (const archivo of readdirSync(SRC)) {
    if (!archivo.endsWith('.js') || archivo === 'icons.js') continue;
    const texto = readFileSync(join(SRC, archivo), 'utf8');
    for (const hit of texto.matchAll(/\bicono\(\s*['"`]([a-zA-Z-]+)['"`]/g)) {
      if (!pedidos.has(hit[1])) pedidos.set(hit[1], archivo);
    }
  }
  return pedidos;
}

test('todos los iconos que el código pide existen de verdad', () => {
  const hay = new Set(nombresDeIconos());
  const rotos = [...nombresPedidos()].filter(([nombre]) => !hay.has(nombre));
  assert.deepEqual(rotos, [], `estos nombres no dibujan nada: ${rotos.map(([n, d]) => `${n} (${d})`).join(', ')}`);
});

test('un nombre que no existe devuelve vacío en vez de reventar', () => {
  assert.equal(icono('esto-no-existe'), '');
  assert.equal(icono(''), '');
  assert.equal(icono(undefined), '');
  assert.equal(icono(null), '');
});

test('todos se dibujan en la misma retícula y con el mismo trazo', () => {
  for (const nombre of nombresDeIconos()) {
    const svg = icono(nombre);
    assert.match(svg, /viewBox="0 0 24 24"/, `${nombre} no usa la retícula de 24`);
    assert.match(svg, /stroke="currentColor"/, `${nombre} no hereda el color del texto`);
    assert.match(svg, /stroke-width="1\.7"/, `${nombre} no lleva el trazo del sistema`);
    assert.match(svg, /stroke-linecap="round"/, `${nombre} no redondea las puntas`);
  }
});

test('ninguno trae color propio: el color lo pone quien lo usa', () => {
  // `currentColor` sí vale —es heredar—. Un color escrito es lo que rompe la
  // coherencia, que es justo de lo que se venía: los emoji traían el suyo.
  for (const nombre of nombresDeIconos()) {
    const svg = icono(nombre);
    const colores = svg.match(/(?:fill|stroke)="(?!none|currentColor)([^"]+)"/g) || [];
    assert.deepEqual(colores, [], `${nombre} trae color propio: ${colores.join(', ')}`);
  }
});

test('el SVG se esconde de los lectores de pantalla', () => {
  // Al lado de cada icono hay siempre una palabra. Si el lector anunciara las
  // dos, diría lo mismo dos veces.
  for (const nombre of nombresDeIconos()) {
    assert.match(icono(nombre), /aria-hidden="true"/, `${nombre} se anunciaría dos veces`);
  }
});

test('el tamaño que se pide es el tamaño que sale', () => {
  assert.match(icono('sol', { tamano: 34 }), /width="34" height="34"/);
  assert.match(icono('sol'), /width="20" height="20"/, 'sin pedir nada son 20');
});

test('toda categoría de alimentos tiene su dibujo, y todo rubro también', () => {
  const hay = new Set(nombresDeIconos());
  for (const { id, label } of CATEGORIES) {
    assert.ok(ICONO_DE_CATEGORIA[id], `la categoría «${label}» no tiene icono asignado`);
    assert.ok(hay.has(ICONO_DE_CATEGORIA[id]), `«${label}» apunta a un dibujo que no existe`);
    assert.notEqual(iconoDeCategoria(id), '', `«${label}» no dibuja nada`);
  }
  for (const { id, titulo } of RUBROS) {
    assert.notEqual(iconoDeCategoria(id), '', `el rubro «${titulo}» no dibuja nada`);
  }
});

test('una categoría desconocida cae en «otros» y no en un hueco', () => {
  // Alguien puede tener guardada una categoría de una versión anterior.
  assert.equal(iconoDeCategoria('categoria-de-otra-epoca'), icono('otros'));
  assert.equal(iconoDeCategoria(undefined), icono('otros'));
});

test('no quedan emoji de sistema haciendo de icono en la interfaz', () => {
  // No queda ninguno. La excepción sigue escrita porque el caso que describe
  // puede volver: una frase que señala una tecla del teclado del teléfono
  // —«toca el 🎤 de tu teclado»— necesita ese emoji, porque es justo lo que la
  // persona tiene que buscar con la vista, y sustituirlo por un dibujo nuestro
  // sería enseñarle algo que en su pantalla no está.
  const PERMITIDO = /de tu teclado|del teclado/;
  const PICTOGRAMA = /\p{Extended_Pictographic}/u;
  const sueltos = [];
  for (const archivo of readdirSync(SRC)) {
    if (!archivo.endsWith('.js') || archivo === 'catalog-seed.js') continue;
    const texto = readFileSync(join(SRC, archivo), 'utf8');
    for (const [i, linea] of texto.split(/\r?\n/).entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) continue;       // comentarios, no
      if (!PICTOGRAMA.test(linea)) continue;
      if (PERMITIDO.test(linea)) continue;
      sueltos.push(`${archivo}:${i + 1}`);
    }
  }
  assert.deepEqual(sueltos, [], `quedan emoji dibujando en: ${sueltos.join(', ')}`);
});
