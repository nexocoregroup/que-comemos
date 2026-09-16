import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Los dos pasos que le faltaban al asistente de entrada.
//
// Quien entraba sin cuenta llegaba al final —«preparar mi primer menú
// mensual»— con la casa vacía: sin nadie registrado, así que la app no podía
// avisar de ninguna alergia ni repartir ninguna porción; y sin una sola
// preparación guardada, así que al abrir el menú no había nada que poner en el
// calendario. El asistente pedía el menú antes de que existiera con qué
// llenarlo.
//
// Ahora son siete pasos: el primero pregunta quiénes comen aquí y qué debe
// evitar cada quien, y el penúltimo escribe las comidas que se repiten.
//
// Fueron ocho hasta que se quitó el de «dictar varios de corrido». Ese paso
// tenía su propia implementación del dictado, en paralelo a la que ya usan las
// otras pantallas, y con la ventanita de cada categoría había dejado de
// compensar mantener dos.

// El asistente lee la pantalla para no perder lo que se está escribiendo. Aquí
// no hay pantalla, así que se finge una que puede devolver lo que haga falta.
const campos = new Map();
const nodoTonto = () => ({ value: undefined, focus() {}, classList: { toggle() {} }, closest: () => null, querySelector: () => null });
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: selector => (campos.has(selector) ? { ...nodoTonto(), value: campos.get(selector) } : nodoTonto())
};
let confirmaciones = true;
globalThis.window = { ...(globalThis.window || {}), confirm: () => confirmaciones };

import {
  PASO, PASOS, SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup, pasosDe, renderSetup
} from '../src/setup.js';
import { HOGAR_ACTIONS, HOGAR_FORMS, emptyHogar } from '../src/hogar.js';
import { addProduct, createEmptyState, personasActivas, todayISO, upsertPerson, upsertRecipe } from '../src/model.js';
import { addRoutine, applyRoutine, datesForRule, describeRule } from '../src/routines.js';
import { loadState, saveState } from '../src/storage.js';

function contexto(state = createEmptyState()) {
  const ctx = {
    state,
    ui: { page: 'setup', modal: null, setup: emptySetup(), hogar: emptyHogar(), voz: { destino: '', estado: 'quieto', sesion: 0 } },
    avisos: [],
    commit: mensaje => { if (mensaje) ctx.avisos.push(mensaje); },
    guardar: () => {},
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {},
    closeModal: () => { ctx.ui.modal = null; },
    openModal: (type, extras) => { ctx.ui.modal = { type, ...extras }; },
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
  return ctx;
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

function almacenDeMentira() {
  const datos = new Map();
  return {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave)
  };
}

/* ── Siete pasos ───────────────────────────────────────────────────────── */

test('el asistente son siete pasos, y los dos nuevos están en su sitio', () => {
  assert.equal(PASOS.length, 7);
  const orden = PASOS.map(paso => paso.id);
  assert.equal(orden[0], PASO.personas, 'quiénes comen aquí va primero: de eso depende todo lo demás');
  assert.equal(orden[orden.length - 1], PASO.mes);
  // Y sobre todo: las preparaciones se escriben ANTES de pedir el primer menú.
  // Ese era el fallo: se ofrecía el menú y al abrirlo no había nada que poner.
  assert.ok(orden.indexOf(PASO.preparaciones) < orden.indexOf(PASO.mes));
});

test('quien compra una vez al mes ve seis, porque el reparto no le pregunta nada', () => {
  const mensual = { ...emptySetup(), frecuencia: 'mensual' };
  const quincenal = { ...emptySetup(), frecuencia: 'quincenal' };
  assert.equal(pasosDe(quincenal).length, 7);
  assert.equal(pasosDe(mensual).length, 6);
  assert.ok(pasosDe(mensual).some(paso => paso.id === PASO.personas));
  assert.ok(pasosDe(mensual).some(paso => paso.id === PASO.preparaciones));
});

test('los siete pasos se dibujan, con la casa vacía y con la casa llena', () => {
  const llena = createEmptyState();
  const arroz = addProduct(llena, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertPerson(llena, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  upsertRecipe(llena, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: arroz, quantity: 1, unit: 'lb' }], note: '' });

  for (const state of [createEmptyState(), llena]) {
    const ctx = contexto(state);
    ctx.ui.setup.frecuencia = 'quincenal';
    for (const paso of PASOS) {
      ctx.ui.setup.paso = paso.id;
      revisar(renderSetup(ctx), `paso «${paso.corto}»`);
    }
  }
});

/* ── Paso 1: quiénes comen aquí ────────────────────────────────────────── */

test('el paso de las personas cuenta, y la cuenta sube y baja', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 4, 'empieza en una: tú');
  SETUP_ACTIONS['setup-personas-menos'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 3);
  // Nunca por debajo de una persona: una casa sin nadie no existe.
  for (let i = 0; i < 9; i++) SETUP_ACTIONS['setup-personas-menos'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 1);
});

test('cuántas personas son sobrevive a cerrar la app', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);

  const almacen = almacenDeMentira();
  saveState(ctx.state, almacen);
  const vuelto = avanceGuardado(loadState(almacen));
  assert.equal(vuelto.personas, 3);
  assert.equal(vuelto.paso, PASO.personas, 'vuelve por donde iba');
});

test('una persona con alergia se ve desde el propio paso, y sin llenar también se ve', () => {
  const state = createEmptyState();
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.personas;
  ctx.ui.setup.personas = 3;
  const html = renderSetup(ctx);
  revisar(html, 'paso de personas');

  assert.ok(html.includes('Sofía'));
  assert.ok(html.includes('Maní'), 'no se ve lo que esa persona debe evitar');
  assert.ok(/motivo-alergia|restriccion-alergia|alergia/i.test(html), 'la alergia tiene que verse como alergia');
  assert.ok(html.includes('Persona 2') && html.includes('Persona 3'), 'las que faltan no se ven');
  // Y se puede seguir sin llenarlas: se avisa, no se bloquea.
  assert.ok(/Faltan 2 personas por llenar/.test(html));
  assert.ok(html.includes('data-action="setup-siguiente"'));
  assert.ok(!/data-action="setup-siguiente"[^>]*disabled/.test(html), 'no se puede bloquear el paso');
});

test('la ficha de una persona es la de siempre, no una segunda escrita aquí', () => {
  // Dos formularios de persona serían dos sitios donde olvidarse de preguntar
  // si un alimento es una alergia o una manía.
  const state = createEmptyState();
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.personas;
  assert.ok(renderSetup(ctx).includes('data-action="hogar-editar"'), 'el paso no abre la ficha de siempre');

  HOGAR_ACTIONS['hogar-editar']({ dataset: { id: '' } }, ctx);
  assert.equal(ctx.ui.modal?.type, 'persona');
  assert.ok(ctx.ui.hogar.ficha, 'no se preparó la ficha que la ventana va a pintar');

  ctx.ui.hogar.ficha = { ...ctx.ui.hogar.ficha, nombre: 'Luis', restricciones: [{ productId: null, texto: 'Leche', motivo: 'intolerancia' }] };
  HOGAR_FORMS.persona({ }, new Map(), ctx);
  assert.deepEqual(personasActivas(state).map(persona => persona.name), ['Luis']);
  assert.equal(personasActivas(state)[0].restricciones[0].motivo, 'intolerancia');
});

test('continuar desde las personas guarda el número tecleado, no solo el de los botones', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  campos.set('[data-setup-personas]', '5');
  SETUP_ACTIONS['setup-siguiente'](null, ctx);
  campos.clear();
  assert.equal(ctx.ui.setup.personas, 5);
  assert.equal(ctx.ui.setup.paso, PASO.alimentos);
});

/* ── Paso 7: las comidas que se repiten ────────────────────────────────── */

test('el paso abre la ventana de siempre, no una versión recortada de ella', () => {
  // El primer intento tenía aquí su propio formulario con el nombre y los
  // momentos y nada más. Quien registraba su casa entera se quedaba sin poder
  // decir qué lleva cada plato, cuánto rinde ni qué nota tiene para quien
  // cocina —campos que sí salían al entrar por «Nueva preparación»—, y dos
  // formularios de la misma cosa es una promesa rota justo donde más se nota.
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const html = renderSetup(ctx);
  revisar(html, 'paso de preparaciones');

  assert.ok(html.includes('data-action="open-recipe"'), 'el paso no abre la ventana de siempre');
  assert.ok(!/data-form="setup-preparacion"/.test(html), 'sigue habiendo un segundo formulario de preparación');
  assert.equal(SETUP_FORMS['setup-preparacion'], undefined, 'quedó vivo el formulario recortado');
  assert.ok(!html.includes('name="uses"'), 'el paso vuelve a pintar campos de la preparación por su cuenta');
});

test('la lista del paso enseña lo que la ventana completa deja escrito', () => {
  const ctx = contexto();
  const arroz = addProduct(ctx.state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertRecipe(ctx.state, {
    name: 'Locrio de pollo', uses: ['almuerzo', 'cena'],
    items: [{ productId: arroz, quantity: 3, unit: 'lb' }], servings: 6, note: 'Dejar una parte para mañana'
  });
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.ui.setup.paso = PASO.preparaciones;
  const html = renderSetup(ctx);
  revisar(html, 'paso con preparaciones');

  assert.ok(html.includes('Locrio de pollo'));
  assert.ok(html.includes('Almuerzo · Cena'), 'no dice en qué momentos se come');
  assert.ok(/1 alimento/.test(html), 'no dice cuántos alimentos lleva');
  assert.ok(/rinde 6 porciones/.test(html), 'no dice cuánto rinde');
  assert.ok(html.includes('con nota'), 'no dice que tiene nota para quien cocina');
  // Y la que se quedó a medias lo dice, sin regañar: sirve igual para el
  // calendario, lo único que no hace es sumar a la compra.
  assert.ok(html.includes('sin alimentos todavía'));
  assert.ok(/1 sin alimentos anotados/.test(html));
  assert.ok(!/disabled/.test(html), 'nada puede quedar apagado por una preparación a medias');
});

test('la ventana de una preparación se puede encadenar para escribirlas de una sentada', () => {
  // «Guardar y añadir otra»: la pantalla se comprueba aquí porque la ventana la
  // dibuja app.js, que lee el documento al cargarse y no entra en las pruebas.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/name="seguir" value="1"/.test(codigo), 'no hay forma de guardar y seguir escribiendo');
  assert.ok(/Guardar y añadir otra/.test(codigo));
  // Solo al crear una nueva: encadenar mientras se edita una que ya existe no
  // significa nada.
  assert.ok(/\$\{recipe \? '' : '<button class="btn btn-secondary" type="submit" name="seguir"/.test(codigo),
    'el botón de encadenar sale también al editar una preparación que ya existe');
  // Y al guardar, la ventana se queda abierta y en blanco.
  assert.ok(/const seguir = data\.get\('seguir'\) === '1';/.test(codigo));
  assert.ok(/ui\.modal = seguir \? \{ type: 'recipe', id: '' \}/.test(codigo),
    'guardar y seguir no deja la ventana abierta y vacía');
  // Y quien llegó aquí desde una rutina porque no tenía ninguna preparación
  // vuelve a la rutina con la recién escrita ya elegida, en vez de quedarse en
  // una pantalla que no es la suya.
  assert.ok(/volverARutina \? \{ type: 'rutina', month: volverARutina, receta: receta\.id/.test(codigo),
    'escribir la primera preparación desde una rutina no devuelve a la rutina');
});

test('quitar una preparación pregunta antes, y avisa si está puesta en el calendario', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const receta = upsertRecipe(ctx.state, { name: 'Sancocho', uses: ['almuerzo'], items: [], note: '' });

  confirmaciones = false;
  SETUP_ACTIONS['setup-quitar-preparacion']({ dataset: { id: receta.id } }, ctx);
  assert.equal(ctx.state.recipes.length, 1, 'decir que no tiene que dejarla donde estaba');

  confirmaciones = true;
  SETUP_ACTIONS['setup-quitar-preparacion']({ dataset: { id: receta.id } }, ctx);
  assert.equal(ctx.state.recipes.length, 0);
});

test('el paso avisa cuando no hay ninguna, sin impedir seguir', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const vacio = renderSetup(ctx);
  assert.ok(vacio.includes('Todavía no has guardado ninguna.'));
  assert.ok(vacio.includes('data-action="setup-siguiente"'));
  assert.ok(!/disabled/.test(vacio), 'ningún control puede quedar apagado por no tener preparaciones');
});

/* ── El final ya no promete un menú vacío ──────────────────────────────── */

test('el último paso cuenta con qué se va a llenar el mes', () => {
  const ctx = contexto();
  upsertPerson(ctx.state, { name: 'Sofía', kind: 'nino', restricciones: [] });
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.ui.setup.paso = PASO.mes;
  ctx.ui.setup.guardados = 12;

  const html = renderSetup(ctx);
  revisar(html, 'último paso');
  assert.ok(/1 persona en casa/.test(html));
  assert.ok(/12 alimentos/.test(html));
  assert.ok(/1 preparación/.test(html), 'no dice cuántas preparaciones hay');
  assert.ok(!html.includes('No hay ninguna preparación guardada'), 'no puede avisar de algo que sí hay');
  // Y el último paso no ofrece «Salir»: ya no queda nada que abandonar.
  assert.ok(!html.includes('data-action="setup-salir"'));
});

test('sin preparaciones, el último paso lo dice antes de ofrecer el menú', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.mes;
  const html = renderSetup(ctx);
  assert.ok(html.includes('No hay ninguna preparación guardada.'));
  assert.ok(html.includes('El menú del mes va a empezar vacío'));
  // Pero se puede seguir igual: avisar no es bloquear.
  assert.ok(html.includes('data-action="setup-menu"'));
});

/* ── Y el camino se recorre entero ─────────────────────────────────────── */

test('se llega del principio al final sin quedarse atascado en ningún paso', () => {
  const ctx = contexto();
  SETUP_ACTIONS['setup-empezar'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);

  const visitados = [ctx.ui.setup.paso];
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.mes; i++) {
    SETUP_ACTIONS['setup-siguiente'](null, ctx);
    visitados.push(ctx.ui.setup.paso);
  }
  assert.equal(ctx.ui.setup.paso, PASO.mes, `se quedó atascado: ${visitados.join(' → ')}`);
  assert.deepEqual(visitados, pasosDe(ctx.ui.setup).map(paso => paso.id));

  // Y hacia atrás también, sin saltarse ninguno.
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.personas; i++) SETUP_ACTIONS['setup-atras'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);
});

test('el borrador sobrevive hasta el final, no hasta las cantidades', () => {
  // Detrás de las cantidades quedan dos pasos. Borrar el borrador ahí dejaba a
  // quien cerrara la app en medio volviendo a la pantalla de entrada.
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.cantidades;
  ctx.ui.setup.personas = 4;
  // El paso de las cantidades guarda lo que haya escrito en la pantalla, y sin
  // una sola línea se niega a guardar. Se le pone una.
  const fila = {
    dataset: { origen: 'catalogo', categoria: 'granos' },
    querySelector: nombre => ({ value: { nombre: 'Arroz', cantidad: '10', unidad: 'lb' }[nombre.replace(/^\[name="|"\]$/g, '')] ?? '' })
  };
  document.querySelectorAll = selector => (selector === '[data-setup-cantidad]' ? [fila] : []);
  SETUP_FORMS['setup-cantidades']({ querySelectorAll: () => [] }, new Map(), ctx);
  document.querySelectorAll = () => [];

  assert.equal(ctx.ui.setup.paso, PASO.preparaciones);
  const guardado = avanceGuardado(ctx.state);
  assert.ok(guardado, 'el borrador se borró con dos pasos todavía por delante');
  assert.equal(guardado.paso, PASO.preparaciones);
  assert.equal(guardado.personas, 4);

  // Al terminar sí se borra: ya no queda nada que retomar.
  SETUP_ACTIONS['setup-ahora-no'](null, ctx);
  assert.equal(avanceGuardado(ctx.state), null);
});

/* ── Los días se dicen en la propia preparación ────────────────────────── */

test('la ventana de una preparación pregunta qué días se repite', () => {
  // Esto vivía solo en la ventana de rutinas del plan mensual: se escribía la
  // preparación en un sitio y cuándo se repite en otro, y entre las dos
  // pantallas se perdía la mitad de la gente.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/¿Qué días de la semana se repite\?/.test(codigo), 'la ventana no pregunta los días');
  assert.ok(/name="weekdays"/.test(codigo));
  assert.ok(/function bloqueDeDias\(recipe\)/.test(codigo));
  assert.ok(/\$\{bloqueDeDias\(recipe\)\}/.test(codigo), 'el bloque no está puesto en la ventana');
  // Y al guardar se aplica al mes en curso.
  assert.ok(/const repeticion = aplicarDiasDeLaReceta\(form, data, receta\);/.test(codigo));
  assert.ok(/applyRoutine\(state, regla\.id, mes, \{ modo: 'vacios' \}\)/.test(codigo),
    'aplicar los días puede pisar comidas que ya estaban puestas');
  // Sin días marcados no pasa nada: hay platos que no tienen día fijo.
  assert.ok(/if \(!weekdays\.length\) \{\s*\n\s*if \(!rutina\) return '';/.test(codigo));
  // Con varias reglas no se toca ninguna desde aquí.
  assert.ok(/if \(cuantas > 1\) return '';/.test(codigo));
});

test('la regla que sale de una preparación llena el mes de una vez', () => {
  // Lo que hace la ventana, hecho aquí con las mismas piezas: una preparación
  // de desayuno y cena, los martes y jueves, tiene que poner dos comidas por
  // cada martes y cada jueves del mes.
  const state = createEmptyState();
  const receta = upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [], note: '' });
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: receta.id, slots: receta.uses, weekdays: [2, 4], weeks: null, scope: 'permanent' });
  const mes = todayISO().slice(0, 7);
  const dias = datesForRule(mes, [2, 4], null).length;

  const puestas = applyRoutine(state, rutina.id, mes, { modo: 'vacios' });
  assert.equal(puestas.creados.length, dias * 2, 'no puso las dos comidas de cada día');
  assert.ok(dias >= 8, 'un mes tiene al menos ocho martes y jueves');
  assert.equal(describeRule([2, 4], null), 'Todos los martes y jueves');
});

test('el último paso enseña lo que ya quedó puesto, y deja cambiarlo', () => {
  const state = createEmptyState();
  const receta = upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [], note: '' });
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: receta.id, slots: receta.uses, weekdays: [2, 4], weeks: null, scope: 'permanent' });
  const mes = todayISO().slice(0, 7);
  applyRoutine(state, rutina.id, mes, { modo: 'vacios' });

  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.mes;
  const html = renderSetup(ctx);
  revisar(html, 'último paso con el mes montado');

  assert.ok(html.includes('ya está montado'), 'sigue diciendo que hay que crear el mes');
  assert.ok(html.includes('Mangú con salami'));
  assert.ok(html.includes('Todos los martes y jueves'), 'no dice qué días se repite');
  assert.ok(html.includes('Desayuno y Cena'), 'no dice en qué momentos');
  assert.ok(/\d+ días en/.test(html), 'no dice cuántos días caen este mes');
  // «Cambiar» lleva a la preparación, que es donde se escribieron los días.
  assert.ok(html.includes(`data-action="open-recipe" data-id="${receta.id}"`), 'no se puede cambiar desde aquí');
  assert.ok(html.includes('data-action="setup-ver-mes"'), 'no ofrece ver el mes ya montado');
  assert.ok(!html.includes('Preparar mi primer menú mensual'), 'sigue prometiendo construir lo que ya está construido');
});

test('terminar lleva al mes, no a una pantalla en blanco', () => {
  const state = createEmptyState();
  const receta = upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [], note: '' });
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: receta.id, slots: ['almuerzo'], weekdays: [7], weeks: null, scope: 'permanent' });
  applyRoutine(state, rutina.id, todayISO().slice(0, 7), { modo: 'vacios' });

  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.mes;
  SETUP_ACTIONS['setup-ver-mes'](null, ctx);
  assert.equal(ctx.ui.page, 'mes');
  assert.equal(ctx.ui.setup, null);
  assert.equal(avanceGuardado(state), null, 'el borrador tenía que borrarse al terminar');
});

test('sin ninguna repetición, el último paso lo dice y ofrece anotarlas', () => {
  const ctx = contexto();
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.ui.setup.paso = PASO.mes;
  const html = renderSetup(ctx);
  revisar(html, 'último paso sin repeticiones');
  assert.ok(html.includes('Falta decir qué días se prepara cada comida'));
  assert.ok(html.includes('data-action="setup-menu"'));
  assert.ok(!html.includes('data-action="setup-ver-mes"'), 'no hay mes montado que ver');
});
