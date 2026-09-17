// La compra es una lista que escribe una persona.
//
// Aquí había una cuenta: lo que la casa consume al mes, menos lo que decía
// quedar en la despensa, igual a lo que había que comprar. La cuenta estaba
// bien hecha y no servía, por una razón que no es de programación: nadie anota
// el arroz que se cayó ni el paquete que se abrió para probar, así que a los
// tres meses el número no se parecía a la despensa.
//
// Lo que estas pruebas vigilan es que no vuelva a aparecer sola:
//
//  · ningún producto entra en la lista porque sí, ni siquiera los habituales;
//  · dos latas pedidas y una traída son una anotada y una pendiente, no un
//    renglón hecho ni un renglón en blanco;
//  · cerrar una compra no descuenta nada de nada;
//  · y se puede bajar al colmado un martes sin esperar a ningún período.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addProduct, agregarALista, agregarHabitual, agregarOcasional, anotarComprado, cerrarLista,
  crearLista, createEmptyState, habitualLines, inventoryNow, listaDeCompra, listasAbiertas,
  listasCerradas, marcarComprado, pendienteDe, productByName, resumenDeLista
} from '../src/model.js';
import { COMPRA_ACTIONS, COMPRA_FORMS, emptyCompra, listaEnCurso, renderCompra } from '../src/page-compra.js';

const nodoTonto = () => ({ value: '', focus() {}, classList: { toggle() {} }, closest: () => ({ open: false }), querySelector: () => null });
globalThis.document = { querySelectorAll: () => [], querySelector: () => nodoTonto() };
globalThis.window = { ...(globalThis.window || {}), confirm: () => true };

function contexto(state = createEmptyState()) {
  const ctx = {
    state,
    ui: { page: 'compra', modal: null, compra: emptyCompra() },
    avisos: [],
    commit: mensaje => { if (mensaje) ctx.avisos.push(mensaje); },
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {}, guardar: () => {}, closeModal: () => {}, openModal: () => {}
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

function casa() {
  const state = createEmptyState();
  const arroz = agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb' }).productId;
  const salami = agregarHabitual(state, { name: 'Salami', category: 'embutidos', unit: 'paquete' }).productId;
  const maiz = agregarHabitual(state, { name: 'Maíz en lata', category: 'mar', unit: 'lata' }).productId;
  return { state, arroz, salami, maiz };
}

/* ── Los habituales son un catálogo, no una lista de pendientes ────────── */

test('abrir una compra no mete ni un producto: la lista nace vacía', () => {
  const { state } = casa();
  assert.equal(habitualLines(state).length, 3);
  const lista = crearLista(state, { fecha: '2026-10-03' });
  assert.deepEqual(lista.lineas, [], 'los habituales se colaron en la lista');
  assert.equal(lista.estado, 'abierta');
});

test('la pantalla enseña los habituales por rubros, y ninguno marcado', () => {
  const { state } = casa();
  const ctx = contexto(state);
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const html = renderCompra(ctx);
  revisar(html, 'preparar la compra');
  assert.ok(html.includes('Arroz, granos y pastas'), 'no agrupa por rubros');
  assert.ok(html.includes('Carnes y proteínas'));
  assert.ok(html.includes('data-action="compra-poner"'), 'no se puede tocar un producto');
  assert.ok(!/compra-producto puesto/.test(html), 'algún producto aparece ya puesto');
  // Y no promete ninguna cuenta.
  assert.ok(!/haría falta comprar|te faltan|según lo que queda/i.test(html));
  assert.ok(/no significa que hoy haga falta/.test(html));
});

test('se apunta lo de esta vez, y esta vez no dice nada de la próxima', () => {
  // El ejemplo del encargo: maíz en lata → 2 latas. Ni la app infiere que la
  // casa tiene dos, ni que siempre compra cuatro.
  const { state, maiz } = casa();
  const ctx = contexto(state);
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const lista = listaEnCurso(state);
  COMPRA_FORMS['compra-poner']({ dataset: { id: maiz } }, new Map([['cantidad', '2'], ['unidad', 'lata']]), ctx);

  const linea = listaDeCompra(state, lista.id).lineas[0];
  assert.equal(linea.productId, maiz);
  assert.equal(linea.cantidad, 2);
  assert.equal(linea.unidad, 'lata');
  // El habitual no aprende ninguna cantidad de esto.
  assert.equal(habitualLines(state).find(row => row.productId === maiz).quantity, null,
    'la cantidad de una compra se quedó pegada al producto habitual');
});

test('un producto se puede apuntar sin cantidad: se decide delante del estante', () => {
  const { state, arroz } = casa();
  const lista = crearLista(state);
  const linea = agregarALista(state, lista.id, { productId: arroz });
  assert.equal(linea.cantidad, null);
  assert.equal(pendienteDe(linea), null, 'sin cantidad no hay nada que restar, y eso no es cero');
});

/* ── Lo que no se compra siempre ───────────────────────────────────────── */

test('un ocasional de una vez no entra en los habituales; uno que sí, entra', () => {
  const { state } = casa();
  const lista = crearLista(state);

  agregarOcasional(state, lista.id, { nombre: 'Papel de aluminio', cantidad: 1, unidad: 'unidad', habitual: false });
  assert.equal(productByName(state, 'Papel de aluminio'), undefined, 'una cosa de una vez llenó el catálogo');
  assert.equal(habitualLines(state).length, 3);
  assert.ok(listaDeCompra(state, lista.id).lineas.some(linea => linea.texto === 'Papel de aluminio'));

  agregarOcasional(state, lista.id, { nombre: 'Aceite de oliva', cantidad: 1, unidad: 'unidad', habitual: true });
  const item = productByName(state, 'Aceite de oliva');
  assert.ok(item, 'no se registró el alimento');
  assert.equal(habitualLines(state).length, 4, 'no entró en los habituales');
  assert.equal(habitualLines(state).find(row => row.productId === item.id).quantity, null,
    'entró en los habituales con una cantidad que nadie dijo que fuera la de siempre');
  assert.ok(listaDeCompra(state, lista.id).lineas.some(linea => linea.productId === item.id));
});

test('sin nombre no se apunta nada', () => {
  const { state } = casa();
  const lista = crearLista(state);
  assert.throws(() => agregarOcasional(state, lista.id, { nombre: '  ' }), /Escribe qué hay que comprar/);
});

/* ── Mi lista: tachar, destachar y traer a medias ──────────────────────── */

test('un toque tacha, otro destacha, y lo tachado sigue a la vista', () => {
  const { state, arroz } = casa();
  const ctx = contexto(state);
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const lista = listaEnCurso(state);
  const linea = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });

  marcarComprado(state, lista.id, linea.id, true);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, true);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprada, 25, 'tachar de un toque es decir «lo traje todo»');

  ctx.ui.compra.vista = 'lista';
  const html = renderCompra(ctx);
  revisar(html, 'mi lista');
  assert.ok(html.includes('Ya en el carrito'), 'lo tachado desaparece de la vista');
  assert.ok(html.includes('data-action="compra-tachar"'), 'no se puede destachar');

  marcarComprado(state, lista.id, linea.id, false);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, false);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprada, null);
});

test('dos latas pedidas y una traída: una anotada y una pendiente', () => {
  const { state, maiz } = casa();
  const lista = crearLista(state);
  const linea = agregarALista(state, lista.id, { productId: maiz, cantidad: 2, unidad: 'lata' });

  anotarComprado(state, lista.id, linea.id, 1);
  const despues = listaDeCompra(state, lista.id).lineas[0];
  assert.equal(despues.comprada, 1, 'no se guardó lo que se trajo');
  assert.equal(despues.comprado, false, 'se dio por hecho un renglón que quedó a medias');
  assert.equal(pendienteDe(despues), 1, 'no queda una lata pendiente');

  // Y al traer la segunda, se completa.
  anotarComprado(state, lista.id, linea.id, 2);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, true);
  assert.equal(pendienteDe(listaDeCompra(state, lista.id).lineas[0]), 0);
});

test('sin cantidad pedida, lo que se anote completa el renglón', () => {
  // No hay contra qué compararlo, y dejarlo pendiente para siempre sería un
  // renglón que nunca se puede terminar.
  const { state, arroz } = casa();
  const lista = crearLista(state);
  const linea = agregarALista(state, lista.id, { productId: arroz });
  anotarComprado(state, lista.id, linea.id, 3);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, true);
});

test('el resumen distingue lo hecho, lo pendiente y lo que vino a medias', () => {
  const { state, arroz, salami, maiz } = casa();
  const lista = crearLista(state);
  const uno = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  agregarALista(state, lista.id, { productId: salami, cantidad: 2, unidad: 'paquete' });
  const tres = agregarALista(state, lista.id, { productId: maiz, cantidad: 4, unidad: 'lata' });
  marcarComprado(state, lista.id, uno.id);
  anotarComprado(state, lista.id, tres.id, 1);
  assert.deepEqual(resumenDeLista(listaDeCompra(state, lista.id)), { total: 3, comprados: 1, aMedias: 1, pendientes: 2 });
});

/* ── Terminar ──────────────────────────────────────────────────────────── */

test('terminar guarda la fecha, lo pedido y lo traído, y abre una lista vacía', () => {
  const { state, maiz } = casa();
  const ctx = contexto(state);
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const lista = listaEnCurso(state);
  const linea = agregarALista(state, lista.id, { productId: maiz, cantidad: 2, unidad: 'lata' });
  anotarComprado(state, lista.id, linea.id, 1);

  COMPRA_ACTIONS['compra-terminar'](null, ctx);

  const cerradas = listasCerradas(state);
  assert.equal(cerradas.length, 1);
  assert.ok(cerradas[0].cerradaEl, 'la compra cerrada no dice cuándo se cerró');
  assert.deepEqual(cerradas[0].lineas.map(row => [row.cantidad, row.comprada]), [[2, 1]],
    'el historial no guarda lo que se pidió y lo que se trajo');

  // Y queda una lista nueva y vacía para la próxima salida.
  const abiertas = listasAbiertas(state);
  assert.equal(abiertas.length, 1);
  assert.deepEqual(abiertas[0].lineas, []);
  assert.notEqual(abiertas[0].id, lista.id);
  // Los habituales no se tocan: son el catálogo de la casa, no una salida.
  assert.equal(habitualLines(state).length, 3);
});

test('cerrar una compra no descuenta ni suma nada de la casa', () => {
  // Esto es lo que separa una lista de un inventario. Una lista dice lo que
  // alguien decidió comprar; no afirma nada sobre lo que hay en la despensa.
  const { state, arroz } = casa();
  const antes = inventoryNow(state);
  const lista = crearLista(state);
  const linea = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  marcarComprado(state, lista.id, linea.id);
  cerrarLista(state, lista.id);
  assert.deepEqual(inventoryNow(state), antes, 'cerrar una compra movió las existencias');
  assert.equal(state.purchases.length, 0, 'se anotó una compra en el inventario viejo');
});

/* ── Mensual, quincenal, y el martes que se acabó el café ──────────────── */

test('se pueden abrir dos compras el mismo día sin esperar ningún período', () => {
  const { state, arroz } = casa();
  const ctx = contexto(state);
  COMPRA_ACTIONS['compra-nueva'](null, ctx);
  const primera = listaEnCurso(state);
  agregarALista(state, primera.id, { productId: arroz });
  COMPRA_ACTIONS['compra-terminar'](null, ctx);

  const segunda = listaEnCurso(state);
  assert.ok(segunda && segunda.id !== primera.id);
  COMPRA_ACTIONS['compra-terminar'](null, ctx);
  assert.equal(listasCerradas(state).length, 2, 'no se puede hacer una salida extra');
});

/* ── Lo que ya no está en la experiencia principal ─────────────────────── */

test('la compra ya no calcula nada desde el menú ni desde las existencias', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'page-compra.js'), 'utf8');
  assert.ok(!/shoppingList\(/.test(codigo), 'la compra vuelve a calcularse');
  assert.ok(!/inventoryNow\(|balances\(/.test(codigo), 'la compra vuelve a mirar las existencias');
  assert.ok(!/basis|'menu'/.test(codigo), 'vuelve a haber una «base de cálculo»');
  assert.ok(!/cerrarPeriodo\(/.test(codigo), 'vuelve a cerrarse un período calculado');
});

test('ni el botón + ni la pantalla de Hoy llevan ya al inventario', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(!/'open-purchase'/.test(codigo), 'sigue el atajo de «anotar una compra»');
  assert.ok(!/'open-new-review'/.test(codigo), 'sigue el formulario de «¿cuánto queda?»');
  assert.ok(!/tocaRevisar/.test(codigo), 'sigue el recordatorio semanal del repaso');
  assert.ok(!/m\.type === 'purchase'/.test(codigo));
  assert.ok(!/m\.type === 'new-review'/.test(codigo));
  // Y lo que queda dice lo que de verdad hay: lo que falta por buscar de la
  // lista que se escribió, no una cuenta de lo que hace falta.
  assert.ok(/En tu lista de la compra quedan/.test(codigo));
});

test('ningún texto de la app promete calcular la compra ni llevar inventario', () => {
  // El punto 12 del encargo: los textos viejos que prometían lo que la app ya
  // no hace. Se leen los archivos que escriben en pantalla, no los comentarios.
  const archivos = ['legal.js', 'onboarding.js', 'page-mas.js', 'page-compra.js'];
  // Se busca la promesa, no la palabra: la app sí puede —y debe— decir que NO
  // promete una compra exacta, y eso es lo contrario de prometerla.
  const prohibidos = [/calcular la compra/i, /calcula la compra/i, /(?<!no promete una )compra exacta/i, /deja la compra exacta/i];
  for (const nombre of archivos) {
    const texto = readFileSync(resolve(import.meta.dirname, '..', 'src', nombre), 'utf8')
      .split(/\r?\n/).filter(linea => !/^\s*(\/\/|\*|\/\*)/.test(linea)).join('\n');
    for (const prohibido of prohibidos) {
      assert.ok(!prohibido.test(texto), `${nombre} todavía promete «${prohibido}»`);
    }
  }
  // Y lo dice al revés, que es lo que hay que decir.
  const legal = readFileSync(resolve(import.meta.dirname, '..', 'src', 'legal.js'), 'utf8');
  assert.ok(/no calcula dietas, no lleva inventario y no promete una compra exacta/.test(legal),
    'el aviso de privacidad ya no dice lo que la app NO hace');
});
