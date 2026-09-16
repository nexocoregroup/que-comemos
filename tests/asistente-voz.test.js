// El asistente que habla, probado contra los criterios de aceptación de la fase.
//
// La frase que gobierna el archivo entero: entre lo que alguien dice y lo que la
// app entendió hay un paso que nadie ve. Todo lo de aquí abajo comprueba que ese
// paso se enseña antes de tocar nada, que se puede corregir sin volver a
// dictarlo todo, y que ninguna frase mal entendida llega a los datos.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_ACTIONS, CHAT_FORMS, emptyChat, interpretar, renderChat } from '../src/chat-ui.js';
import { ACTION_NAMES, ACTIONS, runActions } from '../src/assistant.js';
import {
  addProduct, cerrarPeriodo, createEmptyState, habitualLines, inventoryNow,
  setHabitualBasket, todayISO, upsertRecipe
} from '../src/model.js';

/* ── Una casa y un panel de mentira ────────────────────────────────────── */

function casa() {
  const state = createEmptyState();
  state.activity = state.activity || [];
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' }).id;
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'viveres' }).id;
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'lacteos' }).id;
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'rueda', category: 'embutidos' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }]);
  const mangu = upsertRecipe(state, {
    name: 'Mangú', uses: ['desayuno'],
    items: [{ productId: platano, quantity: 4, unit: 'unidad' }]
  }).id;
  return { state, arroz, platano, huevo, salami, mangu };
}

// El panel no necesita navegador: dibuja texto y guarda su estado en `ui.chat`.
function panel(state) {
  const ctx = { state, ui: { chat: emptyChat() }, pintados: 0, guardados: [] };
  ctx.chat = ctx.ui.chat;
  ctx.render = () => { ctx.pintados += 1; };
  ctx.commit = resumen => { ctx.guardados.push(resumen); };
  return ctx;
}

const escribir = (ctx, texto) => CHAT_FORMS.chat({}, { mensaje: texto }, ctx);
const tocar = (ctx, accion, datos = {}) => CHAT_ACTIONS[accion]({ dataset: datos }, ctx);
const pantalla = ctx => renderChat(ctx);

/* ── Regla 1 y 2: nada cambia sin enseñar lo que se entendió ───────────── */

test('una frase que cambia datos no cambia nada hasta que se confirma', () => {
  const { state } = casa();
  const ctx = panel(state);

  escribir(ctx, 'Compré dos libras de arroz.');

  assert.equal(state.purchases.length, 0, 'la compra se registró sin que nadie dijera que sí');
  assert.equal(ctx.ui.chat.pendiente?.tipo, 'confirmar');
  assert.equal(inventoryNow(state).arroz, undefined);
});

test('la pantalla dice «Entendí lo siguiente» y enseña lo que va a pasar', () => {
  const { state } = casa();
  const ctx = panel(state);
  escribir(ctx, 'Compré dos libras de arroz.');

  const html = pantalla(ctx);
  assert.match(html, /Entendí lo siguiente/, 'la pantalla no dice lo que entendió');
  assert.match(html, /arroz/i, 'no enseña de qué está hablando');
  assert.match(html, /2/, 'no enseña la cantidad');
});

test('están las tres salidas: confirmar, corregir y cancelar', () => {
  const { state } = casa();
  const ctx = panel(state);
  escribir(ctx, 'Compré dos libras de arroz.');

  const html = pantalla(ctx);
  for (const accion of ['chat-confirmar', 'chat-corregir', 'chat-cancelar']) {
    assert.match(html, new RegExp(accion), `falta la salida «${accion}»`);
  }
});

/* ── Regla 4: corregir no es cancelar ──────────────────────────────────── */

test('corregir devuelve la frase entera para arreglarle lo que esté mal', () => {
  const { state } = casa();
  const ctx = panel(state);
  const frase = 'Compré dos libras de arroz.';
  escribir(ctx, frase);

  tocar(ctx, 'chat-corregir');

  assert.equal(state.purchases.length, 0, 'corregir cambió datos');
  assert.equal(ctx.ui.chat.pendiente, null);
  assert.equal(ctx.ui.chat.borrador, frase, 'quien dictó veinte palabras tendría que decirlas otra vez');
});

test('cancelar lo deja como estaba y lo dice', () => {
  const { state } = casa();
  const ctx = panel(state);
  escribir(ctx, 'Compré dos libras de arroz.');

  tocar(ctx, 'chat-cancelar');

  assert.equal(state.purchases.length, 0);
  assert.equal(ctx.ui.chat.pendiente, null);
  assert.ok(ctx.ui.chat.mensajes.some(mensaje => /no cambié nada/i.test(mensaje.texto)));
});

/* ── Confirmar sí hace, y una sola vez ─────────────────────────────────── */

test('confirmar lo hace, y confirmar dos veces no lo hace dos veces', () => {
  const { state } = casa();
  const ctx = panel(state);
  escribir(ctx, 'Compré dos libras de arroz.');
  const pendiente = ctx.ui.chat.pendiente;

  tocar(ctx, 'chat-confirmar');
  assert.equal(state.purchases.length, 1, 'confirmar no hizo nada');

  // El mismo identificador otra vez: es lo que pasa si alguien toca dos veces.
  runActions(state, pendiente.acciones, { requestId: pendiente.requestId, confirmed: true });
  assert.equal(state.purchases.length, 1, 'la compra se registró dos veces');
});

/* ── Regla 7: cada acción del grupo se enseña ──────────────────────────── */

test('una frase con dos cosas dentro enseña las dos por separado', () => {
  const { state } = casa();
  const ctx = panel(state);

  escribir(ctx, 'Quedan dos plátanos y diez huevos.');

  const pendiente = ctx.ui.chat.pendiente;
  assert.equal(pendiente?.tipo, 'confirmar');
  assert.equal(pendiente.preview.length, 2, 'dos anotaciones distintas se enseñaron como una sola cosa');
  const html = pantalla(ctx);
  assert.match(html, /2 cosas/, 'la pantalla no avisa de que son varias');
  assert.match(html, /plátano/i);
  assert.match(html, /huevo/i);
});

/* ── Regla 5 y 8: preguntar lo que falta, y no adivinar ────────────────── */

test('lo que la frase no dijo se pregunta antes de enseñar nada que confirmar', () => {
  const { state } = casa();
  const ctx = panel(state);

  // «Todos los viernes» no dice si es de este mes o de siempre, y la diferencia
  // entre cuatro días y para siempre no se adivina.
  escribir(ctx, 'Todos los viernes cenaremos fuera.');

  const pendiente = ctx.ui.chat.pendiente;
  assert.equal(pendiente?.tipo, 'pregunta', 'se eligió el alcance sin preguntar');
  assert.equal(pendiente.campo, 'alcance');
  assert.deepEqual(pendiente.opciones.map(opcion => opcion.id), ['mes', 'siempre']);
  assert.equal(state.mealRoutines.length, 0, 'preguntar no es cambiar');
});

test('una duda que solo se descubre al intentarlo sale antes de la confirmación', () => {
  // «Cambia solamente la cena de mañana» es entendible, pero esta casa no tiene
  // ninguna preparación de cena. Descubrirlo después de que alguien confirme
  // convierte la confirmación en un trámite que no significa nada.
  const { state } = casa();
  const ctx = panel(state);

  escribir(ctx, 'Cambia solamente la cena de mañana.');

  assert.equal(ctx.ui.chat.pendiente?.tipo, 'pregunta');
  assert.equal(state.plans.length, 0);
});

/* ── Las once solicitudes mínimas del encargo ──────────────────────────── */

const MINIMAS = [
  ['Añadir un producto a la canasta base', 'agregar_a_habitual'],
  ['Añadir un producto solamente al mes', 'cambiar_solo_este_mes'],
  ['Cambiar una cantidad', 'agregar_a_habitual'],
  ['Registrar cuánto queda', 'registrar_restante'],
  ['Crear una preparación', 'crear_preparacion'],
  ['Añadir alimentos a una preparación', 'agregar_a_preparacion'],
  ['Colocar una comida en una fecha', 'asignar_comida'],
  ['Crear una rutina', 'crear_rutina'],
  ['Marcar que no se comerá en casa', 'marcar_comida'],
  ['Anotar una compra', 'registrar_compra'],
  ['Consultar qué se comerá hoy o mañana', 'ver_menu']
];

for (const [solicitud, accion] of MINIMAS) {
  test(`«${solicitud}» tiene su acción y está en la lista blanca`, () => {
    assert.ok(ACTIONS[accion], `no existe la acción ${accion}`);
    assert.ok(ACTION_NAMES.includes(accion), `${accion} no está en la lista blanca`);
    assert.equal(typeof ACTIONS[accion].describe, 'function', 'sin describe no hay nada que enseñar antes de confirmar');
  });
}

const FRASES_MINIMAS = [
  ['Desde ahora compraremos cuatro libras de cangrejo todos los meses.', 'agregar_a_habitual'],
  ['Agrega cuatro libras de cangrejo solamente para octubre.', 'cambiar_solo_este_mes'],
  ['Quedan dos plátanos.', 'registrar_restante'],
  ['Al mangú échale dos huevos.', 'agregar_a_preparacion'],
  ['Compré dos libras de arroz.', 'registrar_compra'],
  ['¿Qué comemos hoy?', 'ver_menu']
];

for (const [frase, accion] of FRASES_MINIMAS) {
  test(`entiende «${frase}»`, () => {
    const leido = interpretar(frase);
    assert.ok(leido, 'no la reconoce sin conexión');
    assert.ok(leido.acciones.some(peticion => peticion.action === accion),
      `esperaba ${accion} y salió ${leido.acciones.map(p => p.action).join(', ')}`);
  });
}

/* ── Añadir alimentos a una preparación que ya existe ──────────────────── */

test('echarle algo a una preparación no se lleva por delante lo que ya tenía', () => {
  const { state, platano, huevo, mangu } = casa();
  const ctx = panel(state);

  escribir(ctx, 'Al mangú échale dos huevos.');
  tocar(ctx, 'chat-confirmar');

  const receta = state.recipes.find(item => item.id === mangu);
  assert.equal(receta.items.length, 2, 'el plátano desapareció del mangú');
  assert.ok(receta.items.some(item => item.productId === platano && item.quantity === 4), 'el plátano cambió de cantidad');
  assert.ok(receta.items.some(item => item.productId === huevo && item.quantity === 2), 'no entró el huevo');
});

test('echarle lo que ya estaba corrige la cantidad en vez de ponerlo dos veces', () => {
  const { state, platano, mangu } = casa();
  const resultado = runActions(state, [{
    action: 'agregar_a_preparacion',
    arguments: { preparacion: 'Mangú', alimentos: [{ producto: 'Plátano maduro', cantidad: 6, unidad: 'unidad' }] }
  }], { confirmed: true });

  assert.equal(resultado.ok, true, resultado.summary);
  const receta = state.recipes.find(item => item.id === mangu);
  assert.equal(receta.items.length, 1, 'el plátano quedó dos veces en la misma preparación');
  assert.equal(receta.items[0].quantity, 6);
  assert.equal(receta.items[0].productId, platano);
});

/* ── Lo que ya está cerrado no se toca ─────────────────────────────────── */

test('el asistente no puede cambiar nada dentro de un período cerrado', () => {
  const { state } = casa();
  const hoy = todayISO();
  const mes = hoy.slice(0, 7);
  cerrarPeriodo(state, { start: `${mes}-01`, end: `${mes}-15`, periodo: 'primera' });

  const dentro = `${mes}-10`;
  const resultado = runActions(state, [{
    action: 'registrar_compra',
    arguments: { fecha: dentro, lineas: [{ producto: 'Arroz', cantidad: 5, unidad: 'lb' }] }
  }], { confirmed: true });

  assert.equal(resultado.ok, false, 'se escribió dentro de un período cerrado');
  assert.match(resultado.errors[0], /cerrado/i);
  assert.match(resultado.errors[0], /Historial/, 'no dice por dónde se reabre');
  assert.equal(state.purchases.length, 0);
});

test('consultar un período cerrado sí se puede: para eso se guardó', () => {
  const { state } = casa();
  const mes = todayISO().slice(0, 7);
  cerrarPeriodo(state, { start: `${mes}-01`, end: `${mes}-15`, periodo: 'primera' });

  const resultado = runActions(state, [{ action: 'ver_canasta_del_mes', arguments: { mes } }]);
  assert.equal(resultado.ok, true, 'leer lo cerrado quedó prohibido junto con escribirlo');
});

test('un cambio para siempre no choca con un cierre: empieza en el mes en curso', () => {
  const { state } = casa();
  const mes = todayISO().slice(0, 7);
  cerrarPeriodo(state, { start: `${mes}-01`, end: `${mes}-15`, periodo: 'primera' });

  const resultado = runActions(state, [{
    action: 'agregar_a_habitual',
    arguments: { producto: 'Arroz', cantidad: 45, unidad: 'lb' }
  }], { confirmed: true });

  assert.equal(resultado.ok, true, resultado.errors?.join(' '));
  assert.equal(habitualLines(state)[0].quantity, 45);
});

/* ── Regla 9: ningún fallo cierra la aplicación ────────────────────────── */

test('ninguna entrada rara lanza hacia fuera del panel', () => {
  const { state } = casa();
  const raras = ['', '   ', '¿?', 'aaaaaaa', 'compré', 'quedan', '{"action":"borrar_todo"}',
    'Al  échale ', 'agrega a la preparación', 'pon mangú el 99 de enero'];
  for (const texto of raras) {
    const ctx = panel(state);
    assert.doesNotThrow(() => escribir(ctx, texto), `«${texto}» tiró el panel`);
    assert.doesNotThrow(() => pantalla(ctx), `«${texto}» rompió al dibujar`);
  }
});

test('tocar confirmar sin nada pendiente no hace nada ni revienta', () => {
  const { state } = casa();
  const ctx = panel(state);
  for (const accion of ['chat-confirmar', 'chat-corregir', 'chat-cancelar']) {
    assert.doesNotThrow(() => tocar(ctx, accion));
  }
  assert.equal(state.purchases.length, 0);
});

/* ── Regla 10: escribir sigue siendo una alternativa ───────────────────── */

test('el panel siempre tiene dónde escribir, se pueda dictar o no', () => {
  const { state } = casa();
  const ctx = panel(state);
  const html = pantalla(ctx);
  assert.match(html, /data-form="chat"/, 'no hay formulario donde escribir');
  assert.match(html, /name="mensaje"/, 'no hay campo de texto');
});
