import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Las pantallas se pueden probar, y hasta ahora no se probaban.
//
// Dos veces la aplicación se quedó en blanco porque una pantalla llamaba a algo
// que ya no existía. Ninguna prueba lo vio: todas probaban el modelo, y las
// pantallas «tocan el DOM, no se pueden cargar en Node».
//
// Eso era verdad de `app.js`, que lee `document` al arrancar. No lo es de los
// módulos de pantalla: `renderMes`, `renderCompra` y `renderMas` reciben un
// contexto y devuelven una cadena de HTML. Se pueden llamar aquí mismo, con un
// estado de verdad, y comprobar qué sale. Eso caza el «no es una función», el
// campo que cambió de forma y el `undefined` que se cuela en la pantalla.

import { createDemoState } from '../src/demo.js';
import { addProduct, addPurchase, createEmptyState, createReview, saveReview, setHabitualLine, setMonthChange, setPersonActive, setReviewScope, todayISO, upsertPerson } from '../src/model.js';
import { emptyMes, modalDia, modalPonerEnDias, renderMes } from '../src/page-mes.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';
import { PAGINAS_MAS, emptyMas, estadoDeLaCopia, renderMas } from '../src/page-mas.js';

const MES = todayISO().slice(0, 7);

// Lo mínimo que un módulo de pantalla necesita. Las funciones no hacen nada
// porque aquí solo se pinta: si una pantalla intentara guardar algo al
// dibujarse, eso sería el fallo, no la prueba.
function contexto(state, extra = {}) {
  return {
    state,
    ui: {
      page: 'hoy', modal: null, reviewId: null, correctingReview: false,
      mes: emptyMes(MES), compra: emptyCompra(MES), mas: emptyMas(),
      ...extra
    },
    commit: () => {}, toast: () => {}, render: () => {},
    closeModal: () => {}, openModal: () => {}, startTour: () => {}
  };
}

// Un `undefined` dentro de una plantilla no lanza: se imprime tal cual y el
// usuario ve la palabra en pantalla. Es el fallo más silencioso de todos.
function revisar(html, donde) {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  assert.ok(html.length > 40, `${donde} devolvió una pantalla prácticamente vacía`);
  for (const basura of ['undefined', 'NaN', '[object Object]', 'null null']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  // Un `${...}` sin resolver significa que alguien anidó mal una plantilla.
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
}

/* ── Con datos ─────────────────────────────────────────────────────────── */

test('plan mensual se dibuja con datos', () => {
  const ctx = contexto(createDemoState());
  revisar(renderMes(ctx), 'renderMes (resumen)');
  ctx.ui.mes.vista = 'calendario';
  revisar(renderMes(ctx), 'renderMes (calendario)');
});

test('la ventana de poner una comida en varios días se dibuja, venga de donde venga', () => {
  const state = createDemoState();
  const ctx = contexto(state);
  revisar(modalPonerEnDias(ctx, { month: MES }), 'modalPonerEnDias');
  // Desde una preparación y desde una comida del calendario llega con lo que
  // ya se eligió: la ventana no puede volver a preguntarlo.
  revisar(modalPonerEnDias(ctx, { month: MES, receta: state.recipes[0].id, slot: 'cena', kind: 'recipe' }), 'modalPonerEnDias (con preparación y momento)');
  revisar(modalPonerEnDias(ctx, { month: MES, kind: 'outside' }), 'modalPonerEnDias (fuera de casa)');
});

test('la ventana de poner en varios días trae los treinta días del mes y sus atajos', () => {
  const html = modalPonerEnDias(contexto(createDemoState()), { month: MES });
  const dias = (html.match(/name="fechas"/g) || []).length;
  assert.equal(dias, 30, 'septiembre tiene 30 días y todos tienen que poder marcarse');
  for (const cuantos of ['7', '14', '0']) {
    assert.ok(html.includes(`data-cuantos="${cuantos}"`), `falta el atajo de ${cuantos} días`);
  }
  assert.ok(!/weekdays|scope|permanent/.test(html), 'la ventana volvió a preguntar por una costumbre');
});

test('la compra se dibuja con las dos bases y los tres tramos', () => {
  const ctx = contexto(createDemoState());
  for (const base of ['casa', 'menu']) {
    ctx.ui.compra.base = base;
    for (const tramo of ['mes', 'primera', 'segunda']) {
      ctx.ui.compra.tramo = tramo;
      revisar(renderCompra(ctx), `renderCompra (${base} · ${tramo})`);
    }
  }
});

test('todas las pantallas de Más se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas («${pagina}»)`);
  }
});

test('la canasta se dibuja en sus dos vistas', () => {
  const ctx = contexto(createDemoState(), { page: 'canasta' });
  revisar(renderMas(ctx), 'canasta (lo de siempre)');
  ctx.ui.mas.canastaVista = 'cambios';
  revisar(renderMas(ctx), 'canasta (cambios del mes)');
});

// Familia es la pantalla donde un fallo de dibujo tiene consecuencias: si una
// alergia no se pinta, quien cocina no la ve. Se prueba con las cuatro
// situaciones a la vez, que es como se ve en una casa de verdad.
test('familia se dibuja con alergias, con gente de baja y con motivos sin decir', () => {
  const state = createEmptyState();
  const mani = addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [
    { productId: mani, texto: '', motivo: 'alergia' },
    { productId: null, texto: 'Berenjena', motivo: 'preferencia' },
    { productId: null, texto: 'Mariscos', motivo: null }
  ], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', kind: 'adolescente', restricciones: [], habitual: [] });
  setPersonActive(state, luis.id, false);

  const ctx = contexto(state, { page: 'familia' });
  const html = renderMas(ctx);
  revisar(html, 'familia');
  assert.ok(html.includes('restriccion-alergia'), 'la alergia se distingue');
  assert.ok(html.includes('Dado de baja'), 'quien se fue sigue a la vista, marcado');
  assert.ok(html.includes('Ya no viven aquí'));
  assert.ok(html.includes('Adolescente'), 'la clasificación nueva se pinta');
  assert.ok(html.includes('sin decir por qué'), 'se avisa de lo que falta por completar');
  assert.ok(html.indexOf('Maní') < html.indexOf('Berenjena'), 'la alergia va delante de la preferencia');
});

/* ── Sin datos: los estados vacíos son los que más se ven ──────────────── */

test('todas las pantallas se dibujan con el estado vacío', () => {
  const vacio = createEmptyState();
  const ctx = contexto(vacio);
  revisar(renderMes(ctx), 'renderMes vacío');
  revisar(renderCompra(ctx), 'renderCompra vacía');
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas vacío («${pagina}»)`);
  }
  ctx.ui.mes.vista = 'calendario';
  revisar(renderMes(ctx), 'renderMes vacío (calendario)');
});

test('un estado vacío ofrece qué hacer, no una pantalla en blanco', () => {
  const ctx = contexto(createEmptyState());
  const html = renderMes(ctx);
  assert.ok(/marcas los días|marca los días|varios días/i.test(html), 'el plan mensual vacío no explica cómo se llena');
  assert.ok(html.includes('data-action='), 'el plan mensual vacío no ofrece ninguna acción');
  assert.ok(!/rutina/i.test(html), 'el plan mensual vacío vuelve a hablar de rutinas');
});

/* ── Que no se filtre el vocabulario que se quitó ──────────────────────── */

// «Canasta base», «canasta mensual» y «base de cálculo» eran los tres términos
// que obligaban a entender la estructura interna para usar la app. Que no
// vuelvan por una plantilla olvidada.
test('ninguna pantalla enseña el vocabulario técnico que se retiró', () => {
  const PROHIBIDAS = ['canasta base', 'canasta habitual', 'canasta del mes', 'canasta mensual', 'base de cálculo', 'unidad de control', 'promover a base', 'instancia mensual'];
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['mes', () => renderMes(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of ['mas', ...PAGINAS_MAS]) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

  const encontradas = [];
  for (const [nombre, dibujar] of pantallas) {
    const html = dibujar().toLocaleLowerCase('es');
    for (const termino of PROHIBIDAS) if (html.includes(termino)) encontradas.push(`${nombre}: «${termino}»`);
  }
  // Las ventanas y los avisos no se dibujan aquí —piden un `state` y un `ui`
  // concretos—, así que se leen como texto. Sin las líneas de comentario: ahí sí
  // puede contarse por qué algo se llamó «canasta». Los tres nombres que
  // sobrevivieron a la última limpieza estaban justamente en un modal y en unos
  // cuantos avisos, no en una pantalla.
  for (const archivo of ['app.js', 'bulk-entry.js', 'hogar.js', 'page-mas.js', 'setup.js']) {
    const fuente = readFileSync(new URL(`../src/${archivo}`, import.meta.url), 'utf8')
      .split(/\r?\n/).filter(linea => !/^\s*(\/\/|\*|\/\*)/.test(linea)).join('\n')
      .toLocaleLowerCase('es');
    for (const termino of PROHIBIDAS) if (fuente.includes(termino)) encontradas.push(`${archivo}: «${termino}»`);
  }
  assert.deepEqual(encontradas, [], 'términos técnicos que volvieron a la interfaz');
});

/* ── Que un extra del mes se vea como tal ──────────────────────────────── */

test('un extra de un mes se enseña marcado, y no como parte de lo habitual', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' });
  setHabitualLine(state, arroz.id, 20, 'lb');
  setMonthChange(state, MES, cangrejo.id, { quantity: 4, unit: 'lb' });

  const ctx = contexto(state, { page: 'canasta' });
  ctx.ui.mas.canastaVista = 'habitual';
  const habitual = renderMas(ctx);
  assert.ok(habitual.includes('Arroz'), 'el arroz debería estar en lo de siempre');
  assert.ok(!habitual.includes('Cangrejo'), 'el cangrejo de este mes NO puede aparecer como habitual');

  ctx.ui.mas.canastaVista = 'cambios';
  const cambios = renderMas(ctx);
  assert.ok(cambios.includes('Cangrejo'), 'el cangrejo debería estar en los cambios del mes');
  revisar(cambios, 'canasta (cambios con un extra)');
});

/* ── La revisión: el archivo del inventario que se retiró ───────────────────

   Ya no se producen revisiones nuevas. La pantalla sigue ahí, en solo lectura,
   para quien tenga datos de cuando la app llevaba la cuenta de la despensa, y
   sigue mereciendo que su buscador y su filtro funcionen: una lista de treinta
   alimentos sin buscador no se lee.

   La casa de ejemplo ya no trae inventario, así que estas tres se montan el
   suyo: unos alimentos y una compra, que es lo único que una revisión
   necesita para tener filas. */

function casaConCompra() {
  const state = createEmptyState();
  const ids = ['Arroz', 'Huevo', 'Salami', 'Atún'].map(nombre =>
    addProduct(state, { name: nombre, controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'otros' }).id);
  addPurchase(state, { date: todayISO(), lines: ids.map(id => ({ productId: id, quantity: 4, unidad: 'unidad', unit: 'unidad' })) });
  return state;
}

test('la revisión ofrece buscar y esconder lo contestado', () => {
  const state = casaConCompra();
  const revision = createReview(state, todayISO());
  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;

  const html = renderMas(ctx);
  revisar(html, 'revisión abierta');
  assert.ok(html.includes('id="revision-filtro"'), 'falta el buscador');
  assert.ok(html.includes('revision-solo-faltan'), 'falta el filtro de pendientes');
  assert.ok(html.includes('¿Cuánto queda?'), 'la pregunta principal debería ser «¿cuánto queda?»');
});

// El filtro esconde filas del DOM, y `saveReview` reconstruye la revisión con lo
// que venga en el formulario. Si una fila escondida no viajara, buscar «arroz»
// borraría las otras veintinueve respuestas. Esta prueba existe por eso.
test('buscar en la revisión no deja fuera lo ya contestado', () => {
  const state = casaConCompra();
  const revision = createReview(state, todayISO());
  // Una revisión empieza por lo de la última compra. Aquí se quiere la despensa
  // entera, que es donde de verdad duele perder una fila al buscar.
  setReviewScope(state, revision.id, 'todo');
  assert.ok(revision.productIds.length >= 3, 'la casa de prueba debería traer varios alimentos');
  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;

  // Un filtro que no deja pasar nada: todas las filas tienen que seguir viajando.
  ctx.ui.mas.revisionFiltro = 'zzzzz';
  const html = renderMas(ctx);
  for (const id of revision.productIds) {
    assert.ok(html.includes(`name="consume-${id}"`), `el alimento ${id} desapareció del formulario al filtrar`);
  }
  assert.ok(html.includes('type="hidden"'), 'lo escondido debería viajar en campos ocultos');
});

test('la revisión se puede mirar solo por lo que falta', () => {
  const state = casaConCompra();
  const revision = createReview(state, todayISO());
  const [primero] = revision.productIds;
  saveReview(state, revision.id, { [primero]: 0 });

  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;
  ctx.ui.mas.revisionSoloFaltan = true;
  const html = renderMas(ctx);
  // El contestado sale del listado visible pero sigue en el formulario.
  assert.ok(!html.includes(`data-review-product="${primero}"`), 'el alimento ya contestado debería esconderse');
  assert.ok(html.includes(`name="consume-${primero}"`), 'y aun así seguir viajando al guardar');
});

/* ── Lo que una tarjeta promete ────────────────────────────────────────── */

test('la tarjeta de una preparación no promete porciones que la ficha no pregunta', () => {
  const state = createDemoState();
  // Un dato de cuando sí se preguntaban. Sigue en el respaldo de quien lo
  // escribió, y esa es la razón de que no se borre.
  state.recipes[0].servings = 6;
  const html = renderMas(contexto(state, { page: 'preparaciones' }));
  assert.ok(!/6 porciones/.test(html), 'sigue enseñando un dato que ya no se puede escribir');
  assert.equal(state.recipes[0].servings, 6, 'pero el dato no se borra: se conserva de cuando se preguntaba');
});

test('la tarjeta de una preparación tampoco promete que se repita sola', () => {
  const html = renderMas(contexto(createDemoState(), { page: 'preparaciones' }));
  for (const palabra of ['rutina', 'Se repite', 'repetición']) {
    assert.ok(!html.includes(palabra), `la tarjeta vuelve a hablar de «${palabra}»`);
  }
  assert.ok(html.includes('mes-poner-en-dias'), 'la tarjeta no ofrece ponerla en el calendario');
});

/* ── La copia de seguridad, que ahora es la única red que hay ──────────── */

// El respaldo automático de Android está apagado a propósito, así que perder el
// teléfono sin copia es perderlo todo. La app tiene que insistir —pero solo
// cuando hay algo que perder y solo cuando ya toca.
test('la app avisa de la copia cuando toca, y calla cuando no', () => {
  const vacio = createEmptyState();
  assert.equal(estadoDeLaCopia(vacio).hayDatos, false, 'una casa vacía no necesita que le riñan');

  const conDatos = createDemoState();
  const nunca = estadoDeLaCopia(conDatos);
  assert.equal(nunca.ultima, null);
  assert.equal(nunca.urgente, true, 'sin ninguna copia, el aviso tiene que salir');

  conDatos.settings = { ...conDatos.settings, lastBackupAt: todayISO() };
  const hoyMismo = estadoDeLaCopia(conDatos);
  assert.equal(hoyMismo.dias, 0);
  assert.equal(hoyMismo.urgente, false, 'recién guardada no debería avisar');

  // Un mes es el umbral: lo que se perdería ya duele.
  //
  // La fecha se cuenta hacia atrás desde `todayISO()`, que es el día del
  // calendario local, y no desde `Date.now()`. Restando milisegundos a `Date.now()`
  // y pasando el resultado por `toISOString()` se mezclaban dos husos: con el
  // reloj local en UTC-4 y pasadas las ocho de la noche, el día UTC ya era el
  // siguiente y la resta daba 39. La prueba fallaba por la hora a la que se
  // ejecutara, que es lo peor que le puede pasar a una prueba.
  const hace40 = new Date(`${todayISO()}T12:00:00`);
  hace40.setDate(hace40.getDate() - 40);
  const hace40ISO = `${hace40.getFullYear()}-${String(hace40.getMonth() + 1).padStart(2, '0')}-${String(hace40.getDate()).padStart(2, '0')}`;
  conDatos.settings.lastBackupAt = hace40ISO;
  const vieja = estadoDeLaCopia(conDatos);
  assert.equal(vieja.dias, 40);
  assert.equal(vieja.urgente, true, 'una copia de hace cuarenta días debería avisar');
});

/* ── Los días se eligen mirando un calendario, no una lista ────────────── */

test('los días del mes se ofrecen con su inicial y con el fin de semana marcado', () => {
  const html = modalPonerEnDias(contexto(createDemoState()), { month: MES });
  // Elegir «los tres viernes que viene mi mamá» sin la inicial del día obliga a
  // mirar un calendario aparte y contar.
  assert.ok(/<em>[LMXJVSD]<\/em>/.test(html), 'los días no dicen de qué día de la semana son');
  assert.ok(html.includes('finde'), 'el fin de semana no se distingue del resto');
  assert.ok(!html.includes('weekdays') && !html.includes('[7]'), 'se está enseñando la estructura interna');
});


/* ── Que el micrófono del teclado pueda escribir en los campos ─────────────

   La aplicación ya no escucha: el único micrófono que hay es el del teclado del
   teléfono, y ese no es cosa nuestra salvo en una cosa —que nuestros campos lo
   admitan—. Por eso se comprueba aquí, en vez de confiar en que nadie añada
   mañana un `readonly` sin pensarlo.

   Lo que de verdad apaga la tecla del micrófono en un WebView de Android:

     · `readonly` y `disabled` — no hay dónde escribir, así que no hay teclado.
     · `inputmode="none"` — le dice al sistema que no saque teclado ninguno.

   Aparte queda un caso que no es un fallo y conviene no confundir: en un campo
   `type="number"` el teclado que sale es el numérico, y el numérico no trae
   tecla de micrófono. Eso lo decide Android, no esta aplicación, y la respuesta
   no es quitarle el `type="number"` a un campo donde solo caben números. */

test('ningún campo de texto apaga el micrófono del teclado', () => {
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['mes', () => renderMes(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of ['mas', ...PAGINAS_MAS]) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

  const culpables = [];
  for (const [nombre, dibujar] of pantallas) {
    const html = dibujar();
    // Los campos donde se escriben palabras: texto libre, búsqueda y áreas.
    const campos = html.match(/<(?:input|textarea)\b[^>]*>/g) || [];
    for (const campo of campos) {
      const tipo = (campo.match(/type="([^"]*)"/) || [])[1] || (campo.startsWith('<textarea') ? 'textarea' : 'text');
      if (!['text', 'search', 'textarea'].includes(tipo)) continue;
      if (/\breadonly\b/.test(campo)) culpables.push(`${nombre}: readonly en ${tipo}`);
      if (/\bdisabled\b/.test(campo)) culpables.push(`${nombre}: disabled en ${tipo}`);
      if (/inputmode="none"/.test(campo)) culpables.push(`${nombre}: inputmode="none" en ${tipo}`);
    }
  }
  assert.deepEqual(culpables, [], 'campos donde el micrófono del teclado no podría escribir');
});

test('los cuadros de texto libre vienen preparados para escribir de corrido', () => {
  // `autocapitalize="sentences"` hace que un párrafo empiece en mayúscula como
  // una frase y no como un grito; `spellcheck` es lo que subraya la palabra mal
  // escrita —o mal oída, si se usa el micrófono del teclado—, que es justo lo
  // que hay que repasar antes de guardar.
  const fuentes = ['src/bulk-entry.js', 'src/setup.js', 'src/app.js'];
  const sinPreparar = [];
  for (const archivo of fuentes) {
    const codigo = readFileSync(archivo, 'utf8');
    for (const etiqueta of codigo.match(/<textarea\b[^>]*>/g) || []) {
      if (!/autocapitalize=/.test(etiqueta)) sinPreparar.push(`${archivo}: textarea sin autocapitalize`);
    }
  }
  assert.deepEqual(sinPreparar, [], 'cuadros de texto sin preparar para escribir de corrido');
});
