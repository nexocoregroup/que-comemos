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
// módulos de pantalla: `renderSemana`, `renderCompra` y `renderMas` reciben un
// contexto y devuelven una cadena de HTML. Se pueden llamar aquí mismo, con un
// estado de verdad, y comprobar qué sale. Eso caza el «no es una función», el
// campo que cambió de forma y el `undefined` que se cuela en la pantalla.

import { createDemoState } from '../src/demo.js';
import { addProduct, addPurchase, createEmptyState, createReview, saveReview, setHabitualLine, setMonthChange, setPersonActive, setReviewScope, todayISO, upsertPerson } from '../src/model.js';
import { emptySemana, modalDia, modalIrAFecha, modalPonerEnDias, renderSemana } from '../src/page-semana.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';
import { ENTRADAS_MAS, PAGINAS_MAS, emptyMas, estadoDeLaCopia, renderMas } from '../src/page-mas.js';

const MES = todayISO().slice(0, 7);

// Lo mínimo que un módulo de pantalla necesita. Las funciones no hacen nada
// porque aquí solo se pinta: si una pantalla intentara guardar algo al
// dibujarse, eso sería el fallo, no la prueba.
function contexto(state, extra = {}) {
  const ui = {
    page: 'hoy', modal: null, reviewId: null, correctingReview: false,
    semana: emptySemana(), compra: emptyCompra(MES), mas: emptyMas(),
    ...extra
  };
  return {
    state, ui,
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

test('el plan semanal se dibuja con datos, en una semana y en dos', () => {
  const ctx = contexto(createDemoState());
  revisar(renderSemana(ctx), 'renderSemana (siete días)');
  ctx.ui.semana.vista = 'dos';
  revisar(renderSemana(ctx), 'renderSemana (catorce días)');
  revisar(modalDia(ctx, { date: todayISO() }), 'la ventana del día');
  revisar(modalIrAFecha(ctx), 'la ventana de ir a una fecha');
});

test('la ventana de poner una comida en varios días se dibuja, venga de donde venga', () => {
  const state = createDemoState();
  const ctx = contexto(state);
  revisar(modalPonerEnDias(ctx, {}), 'modalPonerEnDias');
  // Desde una preparación y desde una comida del calendario llega con lo que
  // ya se eligió: la ventana no puede volver a preguntarlo.
  revisar(modalPonerEnDias(ctx, { receta: state.recipes[0].id, slot: 'cena', kind: 'recipe' }), 'modalPonerEnDias (con preparación y momento)');
  revisar(modalPonerEnDias(ctx, { kind: 'outside' }), 'modalPonerEnDias (fuera de casa)');
});

test('la ventana de poner en varios días pregunta tres cosas y trae los días que se están viendo', () => {
  const ctx = contexto(createDemoState());
  const siete = modalPonerEnDias(ctx, {});
  assert.ok(siete.includes('¿Qué comen?') && siete.includes('¿En qué comida?') && siete.includes('¿Qué días?'),
    'la ventana dejó de preguntar alguna de las tres cosas');
  assert.equal((siete.match(/name="fechas"/g) || []).length, 7, 'viendo una semana hay siete días que marcar');
  for (const cuantos of ['7', '0']) {
    assert.ok(siete.includes(`data-cuantos="${cuantos}"`), `falta el atajo de ${cuantos} días`);
  }
  assert.ok(!siete.includes('data-cuantos="14"'), 'ofrece marcar catorce días viendo solo siete');

  // Y viendo dos semanas, el atajo de las dos.
  ctx.ui.semana.vista = 'dos';
  const catorce = modalPonerEnDias(ctx, {});
  assert.equal((catorce.match(/name="fechas"/g) || []).length, 14);
  assert.ok(catorce.includes('data-cuantos="14"'), 'falta el atajo de las dos semanas');
  assert.ok(!/weekdays|scope|permanent/.test(catorce), 'la ventana volvió a preguntar por una costumbre');
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

test('todas las pantallas de dentro de Ajustes se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const pagina of PAGINAS_MAS) {
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
  // La etiqueta de adulto/adolescente/niño se retiró: no alimentaba nada y
  // decía «Adulto» en todo el mundo. El dato sigue guardado, solo no se pinta.
  assert.ok(!html.includes('Adolescente'), 'volvió la etiqueta de la clasificación');
  assert.ok(html.includes('sin decir por qué'), 'se avisa de lo que falta por completar');
  assert.ok(html.indexOf('Maní') < html.indexOf('Berenjena'), 'la alergia va delante de la preferencia');
});

/* ── Sin datos: los estados vacíos son los que más se ven ──────────────── */

test('todas las pantallas se dibujan con el estado vacío', () => {
  const vacio = createEmptyState();
  const ctx = contexto(vacio);
  revisar(renderSemana(ctx), 'renderSemana vacía');
  revisar(renderCompra(ctx), 'renderCompra vacía');
  for (const pagina of PAGINAS_MAS) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas vacío («${pagina}»)`);
  }
  ctx.ui.semana.vista = 'dos';
  revisar(renderSemana(ctx), 'renderSemana vacía (dos semanas)');
  revisar(modalPonerEnDias(ctx, {}), 'poner en varios días, sin nada escrito');
  revisar(modalDia(ctx, { date: todayISO() }), 'la ventana del día, sin nada escrito');
});

test('un estado vacío ofrece qué hacer, no una pantalla en blanco', () => {
  const ctx = contexto(createEmptyState());
  const html = renderSemana(ctx);
  assert.ok(/est[áa]n en blanco/i.test(html), 'la semana vacía no dice que lo está');
  assert.ok(html.includes('data-action='), 'la semana vacía no ofrece ninguna acción');
  assert.ok(!/rutina/i.test(html), 'la semana vacía vuelve a hablar de rutinas');
  // Y sin ninguna preparación escrita, la ventana de varios días enseña el
  // camino para escribir la primera en vez de un desplegable vacío.
  const ventana = modalPonerEnDias(ctx, {});
  assert.ok(ventana.includes('Todavía no hay preparaciones'));
  assert.ok(/Ve a <strong>Preparaciones<\/strong>/.test(ventana), 'no hay forma de salir de la ventana vacía');
});

test('ninguna pantalla de la semana habla en técnico', () => {
  // «Instancia», «override» y «sincronización» son palabras de quien escribió el
  // programa, no de quien cocina. Aquí no pintan nada.
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['semana', renderSemana(ctx)]];
  ctx.ui.semana.vista = 'dos';
  pantallas.push(['dos semanas', renderSemana(ctx)]);
  pantallas.push(['día', modalDia(ctx, { date: todayISO() })]);
  pantallas.push(['ir a una fecha', modalIrAFecha(ctx)]);
  pantallas.push(['poner en varios días', modalPonerEnDias(ctx, {})]);

  for (const [donde, html] of pantallas) {
    // Sin las etiquetas: `data-slot` y `data-action` son estructura, no texto.
    const limpio = html.replace(/<[^>]*>/g, ' ');
    for (const palabra of ['instancia', 'override', 'sincroniza', 'slot', 'schema', 'payload', 'commit']) {
      assert.ok(!new RegExp(`\\b${palabra}`, 'i').test(limpio), `«${donde}» dice «${palabra}» en pantalla`);
    }
  }
});

/* ── Ajustes es el único índice que queda ──────────────────────────────────

   «Más» era una sección de la barra cuyo único contenido era decir dónde
   estaban las demás. Se fue, y con ella la lista de alimentos de la casa. Lo
   que no puede irse es una ruta: una pantalla sin ruta es un enlace que no
   lleva a ninguna parte en datos que alguien escribió a mano. */

test('las ocho pantallas de siempre siguen teniendo ruta, y «alimentos» ya no es una de ellas', () => {
  for (const id of ['canasta', 'preparaciones', 'ajustes', 'familia', 'historial', 'respaldo', 'avanzado', 'cuenta']) {
    // «cuenta» la pintan las pantallas de `page-cuenta.js`, así que está en las
    // entradas pero no en las rutas de este archivo.
    assert.ok(PAGINAS_MAS.includes(id) || id === 'cuenta', `la página «${id}» se quedó sin ruta`);
    assert.ok(ENTRADAS_MAS.some(([entrada]) => entrada === id), `«${id}» ya no está en la lista de entradas`);
  }
  // «Revisar lo que queda» salió del índice pero su pantalla sigue existiendo:
  // el historial de las revisiones viejas se lee desde Ajustes → Historial.
  assert.ok(PAGINAS_MAS.includes('revision'), 'la pantalla de las revisiones viejas se quedó sin ruta');

  // Y «Alimentos de la casa» se fue entera: editar un producto se hace donde la
  // persona mira su lista, y archivar o restaurar está en Funciones avanzadas.
  assert.ok(!PAGINAS_MAS.includes('alimentos'), 'volvió la lista de alimentos de la casa');
  assert.ok(!ENTRADAS_MAS.some(([entrada]) => entrada === 'alimentos'), 'volvió la entrada de alimentos');
  // Ni queda «Más»: una pantalla entera para pintar una lista de enlaces.
  assert.ok(!PAGINAS_MAS.includes('mas'), 'volvió la pantalla «Más»');
});

test('Ajustes ofrece sus seis destinos, y una ruta que ya no existe aterriza en él', () => {
  const ctx = contexto(createDemoState(), { page: 'ajustes' });
  const html = renderMas(ctx);
  revisar(html, 'ajustes');

  for (const [rotulo, destino] of [
    ['Familia y restricciones', 'data-page="familia"'],
    ['Historial', 'data-page="historial"'],
    ['Respaldo', 'data-page="respaldo"'],
    ['Mi cuenta', 'data-page="cuenta"'],
    // «Preferencias de la aplicación» era una tarjeta con dos botones dentro.
    // Al pasar Ajustes a índice de filas, esos dos destinos son dos filas con
    // su propio nombre; el sitio al que llevan no cambió.
    ['Organización de compra', 'data-page="organizacion"'],
    ['Funciones avanzadas', 'data-page="avanzado"'],
    ['Ver el recorrido', 'data-action="open-tour"']
  ]) {
    assert.ok(html.includes(rotulo), `Ajustes dejó de ofrecer «${rotulo}»`);
    assert.ok(html.includes(destino), `«${rotulo}» no lleva a ninguna parte`);
  }
  // Lo de cada semana NO está aquí: la canasta y las preparaciones son dos de
  // las cinco secciones de la barra, y repetirlas dentro sería esconderlas.
  assert.ok(!html.includes('data-page="canasta"'), 'lo de cada semana volvió a meterse dentro de Ajustes');
  assert.ok(!html.includes('data-page="preparaciones"'));

  // Una dirección vieja —«mas», «alimentos»— no puede dejar una pantalla en
  // blanco: aterriza donde están todas.
  for (const perdida of ['mas', 'alimentos']) {
    ctx.ui.page = perdida;
    assert.equal(renderMas(ctx), html, `«${perdida}» no aterriza en Ajustes`);
  }
});

/* ── Que no se filtre el vocabulario que se quitó ──────────────────────── */

// «Canasta base», «canasta mensual» y «base de cálculo» eran los tres términos
// que obligaban a entender la estructura interna para usar la app. Que no
// vuelvan por una plantilla olvidada.
test('ninguna pantalla enseña el vocabulario técnico que se retiró', () => {
  const PROHIBIDAS = ['canasta base', 'canasta habitual', 'canasta del mes', 'canasta mensual', 'base de cálculo', 'unidad de control', 'promover a base', 'instancia mensual'];
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['semana', () => renderSemana(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of PAGINAS_MAS) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

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

/* ── Mis productos habituales ──────────────────────────────────────────────

   La pantalla tenía dos vistas —«lo de siempre» y «cambios de este mes»— y
   preguntaba cuánto se compra al mes de cada cosa. Ahora es una lista de
   nombres por rubro, y lo que defiende eso está entero en
   `sin-cantidades.test.js`. Aquí queda lo que le toca a este archivo: que se
   dibuje con datos de verdad y no imprima basura. */

test('la lista de productos habituales se dibuja con datos', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' });
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb', category: 'mar' });
  // Uno con cantidad vieja escrita y otro sin ninguna: los dos tienen que
  // salir igual, porque la cantidad dejó de pintarse.
  setHabitualLine(state, arroz.id, 20, 'lb');
  setHabitualLine(state, cangrejo.id, '', 'lb');

  const html = renderMas(contexto(state, { page: 'canasta' }));
  revisar(html, 'canasta (lista de habituales)');
  assert.ok(html.includes('Arroz'), 'el arroz no está en la lista');
});

/* ── La revisión: el archivo del inventario que se retiró ───────────────────

   Ya no se producen revisiones nuevas, y desde la Fase 3 tampoco se pueden
   corregir: la app dejó de saber qué hay en la casa, y un botón que escribe en
   ese libro afirma lo contrario con solo estar ahí.

   Lo que se conserva es leer. Alguien anotó esas cifras a mano en su día y
   siguen siendo suyas.

   La casa de ejemplo ya no trae inventario, así que esto se monta el suyo:
   unos alimentos y una compra, que es lo único que una revisión necesita para
   tener filas. */

function casaConCompra() {
  const state = createEmptyState();
  const ids = ['Arroz', 'Huevo', 'Salami', 'Atún'].map(nombre =>
    addProduct(state, { name: nombre, controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'otros' }).id);
  addPurchase(state, { date: todayISO(), lines: ids.map(id => ({ productId: id, quantity: 4, unidad: 'unidad', unit: 'unidad' })) });
  return state;
}

test('una revisión vieja se lee entera, con sus cifras', () => {
  const state = casaConCompra();
  const revision = createReview(state, todayISO());
  // Confirmar exige contestarlo todo: es una revisión terminada de verdad.
  saveReview(state, revision.id, Object.fromEntries(revision.productIds.map(id => [id, 2])), true);

  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;
  const html = renderMas(ctx);
  revisar(html, 'una revisión vieja');

  // Están todos los alimentos que se contaron aquel día.
  for (const id of revision.productIds) {
    assert.ok(html.includes(`data-review-product="${id}"`), `el alimento ${id} desapareció de la revisión`);
  }
  assert.ok(html.includes('Terminada'), 'no se dice que la revisión está cerrada');
});

test('una revisión vieja no se puede rellenar ni corregir', () => {
  /* Escribir en el libro de existencias no arregla nada: no alimenta ninguna
     pantalla. Lo único que hace un botón ahí es afirmar que la app sabe lo que
     hay en la despensa, y no lo sabe. */
  const state = casaConCompra();
  const revision = createReview(state, todayISO());
  saveReview(state, revision.id, Object.fromEntries(revision.productIds.map(id => [id, 0])), true);

  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;
  const html = renderMas(ctx);

  assert.ok(!/type="number"/.test(html), 'volvió un campo donde escribir una cifra de la despensa');
  assert.ok(!/data-action="toggle-correct-review"/.test(html), 'volvió el botón de corregir');
  assert.ok(!/data-action="review-mode"/.test(html), 'volvieron los dos modos de contar');
  assert.ok(!/data-action="review-scope"/.test(html), 'volvió el alcance de la revisión');
  assert.ok(!/¿Cuánto queda\?/.test(html), 'la pantalla vuelve a preguntar cuánto queda');
});

test('no queda ninguna puerta para escribir en el inventario', () => {
  const codigo = readFileSync('src/app.js', 'utf8');
  for (const accion of ['open-correction', 'review-mode', 'review-scope', 'toggle-correct-review']) {
    assert.ok(!codigo.includes(`'${accion}'`), `volvió la acción «${accion}»`);
  }
  for (const escritura of ['correctStock(', 'correctReview(', 'saveReview(']) {
    assert.ok(!codigo.includes(escritura), `app.js vuelve a escribir en el inventario con ${escritura}`);
  }
  // Y tampoco desde Funciones avanzadas.
  const mas = readFileSync('src/page-mas.js', 'utf8');
  assert.ok(!/Corregir un conteo viejo/.test(mas), 'volvió la tarjeta de corregir un conteo');
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
  assert.ok(html.includes('semana-poner-en-dias'), 'la tarjeta no ofrece ponerla en el calendario');
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

test('los días se ofrecen con su inicial y con el fin de semana marcado', () => {
  const html = modalPonerEnDias(contexto(createDemoState()), {});
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
  const pantallas = [['semana', () => renderSemana(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of PAGINAS_MAS) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

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

/* ── Las ventanas de app.js, que no se pueden dibujar aquí ─────────────────

   `app.js` lee el documento nada más cargar, así que sus ventanas se leen como
   texto. No es lo mismo que dibujarlas, y por eso solo se vigila aquí lo que
   costó un fallo de verdad: cada una de las cuatro que siguen estuvo rota en
   producción. */

// El navegador esconde `[hidden]` con un `display:none` de su propia hoja, que
// pierde contra cualquier regla nuestra que declare `display`. Un `.field`
// (grid) o una `.radio-fila` (flex) con el atributo puesto se quedaba a la
// vista, y con sus campos vivos: alguien podía marcar una opción que la
// pantalla creía escondida y que sí llegaba al formulario.
test('«hidden» esconde de verdad, y no solo en las clases que se acordaron', () => {
  const css = readFileSync('src/theme.css', 'utf8');
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
    'sin la regla general, cualquier clase con display propio vuelve a enseñar lo escondido');
});

// La ventana de añadir un alimento preguntaba «¿dónde entra?»: solo este mes,
// para siempre, o solo la ficha. Las tres respuestas eran del presupuesto
// mensual. Ahora un producto nuevo entra en los habituales, que es el único
// sitio desde donde se añade, y lo que defiende la ficha de hoy está en
// `sin-cantidades.test.js`.

test('«para toda la casa» es una respuesta escrita, no una casilla sin marcar', () => {
  /* El fallo: no se podía poner NI UNA comida en una casa con gente registrada.

     «¿Quiénes comen?» se contesta de dos formas. Abierta, con una casilla por
     persona. Cerrada —lo normal, porque una comida es de toda la casa—, con un
     campo oculto por persona y ninguna casilla. Leyendo solo lo marcado, la
     segunda forma devolvía una lista vacía y el modelo contestaba «Selecciona
     al menos una persona que comerá en casa» a quien no había desmarcado a
     nadie. */
  const codigo = readFileSync('src/app.js', 'utf8');
  assert.ok(/type="hidden" name="\$\{esc\(name\)\}"/.test(codigo), 'el bloque cerrado ya no escribe la respuesta');
  assert.ok(/input\.type === 'hidden' \|\| input\.checked/.test(codigo), 'lo oculto vuelve a no contar como respuesta');
  assert.ok(!/const selected = \(form, name\) => \[\.\.\.form\.querySelectorAll\(`\[name="\$\{name\}"\]:checked`\)\]/.test(codigo),
    'vuelve a leerse solo lo marcado');
});

test('un alimento dentro de una comida se escribe por su nombre y nada más', () => {
  /* Esto empezó siendo el arreglo de un «0 · Arroz»: una preparación podía
     llevar alimentos sin decir cuánto, y la pantalla pintaba la medida a
     ciegas —`measure(null, null)` devuelve «0 »—. La regla de hoy es más
     simple y se comprueba mejor: dentro de una comida no se pinta ninguna
     medida, ni la que traigan las comidas de antes. */
  const codigo = readFileSync('src/app.js', 'utf8');
  const bloque = codigo.slice(codigo.indexOf('function queLleva'), codigo.indexOf('function pieDeHoy'));
  assert.ok(bloque.length > 200, 'no se encontró lo que pinta los alimentos de una comida');
  assert.ok(!/measure\(/.test(bloque), 'una comida vuelve a pintar la medida de sus alimentos');
  assert.ok(/const itemText = item => esc\(productName\(item\.productId\)\);/.test(codigo),
    'el texto de un alimento vuelve a llevar cantidad');
});

test('«cambiar solo este día» existe, y deja la comida nueva suelta de cualquier regla', () => {
  // Antes había que quitar la comida y volver a ponerla, y quien lo intentaba
  // sobre una comida heredada de una costumbre se topaba con la pregunta del
  // alcance cuando lo único que quería era cenar otra cosa ese jueves.
  const codigo = readFileSync('src/app.js', 'utf8');
  assert.ok(/data-form="sustituir"/.test(codigo), 'no hay forma de cambiar el plato de un solo día');
  assert.ok(/Cambiar solo este día/.test(codigo));
  // Solo se ofrecen las preparaciones que valen para ese momento.
  assert.ok(/recipe\.uses\.includes\(plan\.slot\) && recipe\.id !== plan\.recipeId/.test(codigo));
  // Y la que se pone nace sin regla y como cambio manual: eso es lo que impide
  // que una comida heredada siga diciendo que la puso una costumbre.
  assert.ok(/makeRecipePlan\(state, receta\.id, date, slot, participants, null, 'manual'\)/.test(codigo),
    'la comida sustituida no queda marcada como cambio de ese día');
  // Una comida de la que cuelga una parte apartada no se sustituye a ciegas.
  assert.ok(/if \(dependents\(state, plan\.id\)\.length\) throw new Error/.test(codigo));
});
