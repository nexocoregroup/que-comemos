import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// El archivo de textos se lee de las dos maneras: como texto, para comparar
// frase por frase con las páginas de `legal/`, y como módulo, para comprobar
// que los documentos que la app ofrece leer existen de verdad. Se puede
// importar porque no depende de nada: es un archivo de contenido.
import { LEGAL } from '../src/legal.js';

/* ── Que los documentos no vuelvan a mentir ────────────────────────────────

   Esto existe por un fallo real, no por prudencia abstracta.

   El 15 de septiembre de 2026 entraron las cuentas y la sincronización. La
   política de dentro de la app se actualizó a medias —una sección decía que
   había una puerta a la red y otra, tres más abajo, que no había ninguna— y las
   cuatro páginas públicas de `legal/` no se tocaron: siguieron afirmando «La app
   no habla con ningún servidor. Ni uno», que era exactamente lo contrario de lo
   que hacía el código. El README decía «no hay cuentas ni servidor» y la guía de
   Play Store te daba, para pegar en el formulario de Google, una respuesta que
   declaraba que no existía ningún `fetch` en el proyecto.

   Nada de eso lo cazó una prueba, porque las pruebas miraban el código y no el
   texto. Ese es el hueco que cierra este archivo: cuando la app cambia lo que
   hace con los datos, estas pruebas se ponen rojas hasta que los documentos
   digan la verdad.

   La regla de oro cuando una de estas falle: **arregla el texto, no la prueba.**
   Si de verdad la app dejó de salir a la red, entonces sí, borra la frase de la
   lista de prohibidas y deja constancia de por qué. */

const raiz = resolve(import.meta.dirname, '..');
const leer = (...partes) => readFileSync(resolve(raiz, ...partes), 'utf8');

const PAGINAS = readdirSync(resolve(raiz, 'legal')).filter(nombre => nombre.endsWith('.html'));

// Todo lo que le enseñamos a alguien sobre lo que la app hace con sus datos.
const DOCUMENTOS = [
  ['src/legal.js', leer('src', 'legal.js')],
  ['README.md', leer('README.md')],
  ['docs/play-store.md', leer('docs', 'play-store.md')],
  ...PAGINAS.map(nombre => [`legal/${nombre}`, leer('legal', nombre)])
];

/* ── 1. La app sí sale a la red ────────────────────────────────────────────

   Estas frases fueron verdad hasta que dejaron de serlo. Si alguna vuelve a
   aparecer en un documento, es que alguien copió texto viejo. */

const FRASES_PROHIBIDAS = [
  'no habla con ningún servidor',
  'no hay servidor nuestro',
  'no hace ninguna llamada a internet',
  'no realiza ninguna petición de red',
  'no existe ningún código de red',
  'no existe código de red',
  'no hay cuentas',
  'No hay cuentas, no hay registro',
  'no hay ni una función capaz de salir a la red',
  'ni una línea de código capaz de salir a internet',
  'No se recopilan datos',
  'no lo usa nada',
  'no hay ningún código que pueda usarlo'
];

// La guía de Play Store es la única que necesita poder citar las frases viejas
// para decir que ya no valen: «la ficha ya NO llevará la etiqueta...», «antes
// decía que no había cuentas». Quitarle esas citas la dejaría sin explicar por
// qué el formulario cambió, que es justo lo que hay que recordar. Se le permiten
// a ella y solo a ella, y la prueba siguiente comprueba que las cita para
// negarlas, no para sostenerlas.
const CITAS_HISTORICAS = {
  'docs/play-store.md': ['no hay cuentas', 'no se recopilan datos']
};

test('ningún documento sigue diciendo que la app no sale a la red', () => {
  const encontradas = [];
  for (const [donde, texto] of DOCUMENTOS) {
    const plano = texto.toLocaleLowerCase('es');
    const permitidas = CITAS_HISTORICAS[donde] || [];
    for (const frase of FRASES_PROHIBIDAS) {
      const buscada = frase.toLocaleLowerCase('es');
      if (permitidas.includes(buscada)) continue;
      if (plano.includes(buscada)) encontradas.push(`${donde}: «${frase}»`);
    }
  }
  assert.deepEqual(encontradas, [], `Documentos que siguen negando la red:\n  ${encontradas.join('\n  ')}`);
});

test('la guía de Play declara que la app sí recoge datos', () => {
  const texto = leer('docs', 'play-store.md');
  // La respuesta a la primera pregunta del formulario es la que define todo el
  // resto. Si alguien la devuelve a «No», esto se pone rojo.
  assert.ok(/recopila o comparte.*\|\s*\*\*Sí\*\*/.test(texto), 'la guía volvió a responder «No» a si la app recopila datos');
  assert.ok(texto.includes('¿La app permite crear una cuenta?'), 'la guía no cubre la pregunta de la cuenta');
  assert.ok(texto.toLocaleLowerCase('es').includes('información de salud'), 'la guía no declara el dato de salud de las alergias');
});

/* ── 2. Y lo dice quien tiene que decirlo ──────────────────────────────────

   Lo contrario del punto 1: no basta con quitar la mentira, hay que poner la
   verdad. Un documento que se limite a callar la cuenta tampoco sirve. */

const DEBE_HABLAR_DE_LA_CUENTA = ['src/legal.js', 'legal/privacidad.html', 'legal/terminos.html', 'legal/eliminar-datos.html', 'legal/index.html', 'README.md'];

test('los documentos que hablan de datos nombran la cuenta y la sincronización', () => {
  for (const nombre of DEBE_HABLAR_DE_LA_CUENTA) {
    const texto = DOCUMENTOS.find(([donde]) => donde === nombre)?.[1];
    assert.ok(texto, `falta ${nombre} en la lista de documentos`);
    const plano = texto.toLocaleLowerCase('es');
    assert.ok(plano.includes('cuenta'), `${nombre} no menciona la cuenta`);
    assert.ok(plano.includes('sincroniza'), `${nombre} no menciona la sincronización`);
  }
});

test('la privacidad dice que la cuenta y la sincronización son opcionales y vienen apagadas', () => {
  for (const nombre of ['src/legal.js', 'legal/privacidad.html']) {
    const plano = DOCUMENTOS.find(([donde]) => donde === nombre)[1].toLocaleLowerCase('es');
    assert.ok(plano.includes('apagad'), `${nombre} no dice que la sincronización viene apagada`);
    assert.ok(plano.includes('supabase'), `${nombre} no nombra a Supabase, que es quien guarda las cuentas`);
  }
});

/* ── 3. El acceso técnico se dice, no se esquiva ───────────────────────────

   La casa se guarda en texto plano en una base de datos que administra
   NexoCore. Las políticas por fila impiden que una cuenta lea la de otra, pero
   no limitan a quien administra el proyecto. Prometer imposibilidad técnica
   —«nadie de NexoCore puede leerlo»— sería falso, y es la clase de frase por la
   que se retira una app. */

test('no se promete que sea imposible leer lo que se sube', () => {
  const mentiras = ['nadie de nexocore puede leerlo', 'nadie puede leerlo', 'cifrado de extremo a extremo.', 'solo tú puedes leerlo'];
  const encontradas = [];
  for (const [donde, texto] of DOCUMENTOS) {
    const plano = texto.toLocaleLowerCase('es');
    for (const frase of mentiras) if (plano.includes(frase)) encontradas.push(`${donde}: «${frase}»`);
  }
  assert.deepEqual(encontradas, [], `Promesas de imposibilidad técnica que no se sostienen:\n  ${encontradas.join('\n  ')}`);
});

test('la privacidad dice con todas las letras que el acceso técnico existe', () => {
  for (const nombre of ['src/legal.js', 'legal/privacidad.html']) {
    const plano = DOCUMENTOS.find(([donde]) => donde === nombre)[1].toLocaleLowerCase('es');
    assert.ok(plano.includes('acceso técnico'), `${nombre} esquiva que el acceso técnico existe`);
    assert.ok(plano.includes('extremo a extremo'), `${nombre} no aclara que no hay cifrado de extremo a extremo`);
  }
});

/* ── 4. Borrar la cuenta tiene página, y Play la exige ─────────────────────

   Una app con cuentas está obligada a publicar una dirección donde se pida el
   borrado, abierta sin iniciar sesión. Es `legal/eliminar-datos.html`. */

test('la página de eliminación explica cómo borrar la cuenta, no solo el teléfono', () => {
  const plano = leer('legal', 'eliminar-datos.html').toLocaleLowerCase('es');
  assert.ok(plano.includes('borrar mi cuenta'), 'no dice cómo borrar la cuenta');
  assert.ok(plano.includes('tres caminos'), 'sigue hablando de dos caminos');
  assert.ok(/camino 3/.test(plano), 'falta el tercer camino');
});

test('la misma explicación viaja dentro de la app', () => {
  const plano = leer('src', 'legal.js').toLocaleLowerCase('es');
  assert.ok(plano.includes('borrar mi cuenta'), 'la copia de dentro de la app no dice cómo borrar la cuenta');
});

/* ── 5. El correo de contacto está puesto ──────────────────────────────────

   Play lo publica en la ficha. Un marcador sin sustituir se ve en la tienda. */

test('no queda ningún marcador de correo sin sustituir', () => {
  const pendientes = DOCUMENTOS.filter(([, texto]) => texto.includes('CORREO_DE_CONTACTO')).map(([donde]) => donde);
  assert.deepEqual(pendientes, [], `Falta poner el correo en:\n  ${pendientes.join('\n  ')}`);
});

test('las cuatro páginas legales y la copia de dentro llevan el mismo correo', () => {
  const correo = 'nexocore.group@gmail.com';
  for (const nombre of ['src/legal.js', ...PAGINAS.map(p => `legal/${p}`)]) {
    const texto = DOCUMENTOS.find(([donde]) => donde === nombre)[1];
    assert.ok(texto.includes(correo), `${nombre} no lleva el correo de contacto`);
  }
});

/* ── 6. Las dos copias del documento van a la par ──────────────────────────

   `src/legal.js` viaja dentro de la app y `legal/*.html` se publica en la web.
   Son el mismo documento en dos formatos, y se desincronizaron una vez. La
   fecha es lo mínimo que puede comprobarse sin comparar prosa. */

test('la fecha de actualización es la misma dentro y fuera de la app', () => {
  const dentro = /actualizado:\s*'(\d{4})-(\d{2})-(\d{2})'/.exec(leer('src', 'legal.js'));
  assert.ok(dentro, 'src/legal.js no declara fecha de actualización');
  const [, ano, mes, dia] = dentro;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esperada = `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`;
  for (const pagina of PAGINAS) {
    const texto = leer('legal', pagina);
    assert.ok(texto.includes(esperada), `legal/${pagina} no dice «Última actualización: ${esperada}»`);
  }
});

/* ── La primera pantalla ───────────────────────────────────────────────────

   Google NO exige la pantalla de aceptar, y eso está escrito en app.js para
   que nadie la defienda con un argumento que no es: el «prominent disclosure»
   obligatorio se limita a servicios de accesibilidad, ubicación en segundo
   plano y ver qué apps hay instaladas, y esta no usa ninguno.

   Lo que estas guardias vigilan es lo que sí importa: que la pantalla no se
   pueda saltar, que los documentos se puedan leer ahí mismo y sin conexión, y
   que la aceptación quede apuntada con la versión que estaba delante. */

test('la pantalla de entrada va antes que cualquier otra, y no se puede saltar', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  const pintar = /function pintar\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(pintar, 'no encuentro pintar()');
  assert.ok(/if \(tocaAceptar\(\)\)/.test(pintar), 'la pantalla de aceptar dejó de pintarse');
  // Antes que la portada de la cuenta y que la bienvenida: primero se dice qué
  // hace la app con lo que escribas, y después se pregunta nada.
  assert.ok(pintar.indexOf('tocaAceptar') < pintar.indexOf('tocaPedirCuenta'),
    'la portada de la cuenta volvió a salir antes que la de aceptar');
  assert.ok(pintar.indexOf('tocaAceptar') < pintar.indexOf('ui.welcome'),
    'la bienvenida volvió a salir antes que la de aceptar');
  // Y los datos ilegibles siguen ganándole: ahí lo urgente es no pisarlos.
  assert.ok(pintar.indexOf('loadError') < pintar.indexOf('tocaAceptar'),
    'la pantalla de aceptar se puso por delante de los datos ilegibles');
});

test('los documentos se leen en la propia pantalla, sin salir y sin conexión', () => {
  // Mandar a alguien a un enlace del navegador para poder entrar en una app
  // que presume de funcionar sin internet sería contradecirse en la primera
  // pantalla. El texto sale de `LEGAL`, que viaja dentro.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  const pantalla = /function renderAceptar\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(pantalla, 'no encuentro la pantalla de entrada');
  assert.ok(/LEGAL\[leyendoLegal\]/.test(pantalla), 'los documentos dejaron de leerse dentro de la app');
  assert.ok(!/https?:\/\//.test(pantalla), 'la pantalla de entrada manda a un enlace de fuera');
  // Los dos que se ofrecen existen de verdad en el archivo de textos.
  for (const cual of ['privacidad', 'terminos']) {
    assert.ok(LEGAL[cual]?.secciones?.length, `falta el documento «${cual}»`);
  }
});

test('aceptar deja apuntado cuándo y qué versión', () => {
  // Una aceptación sin la versión no dice nada, porque los textos se corrigen:
  // lo que hay que poder responder es qué documento estaba delante ese día.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  const accion = /else if \(action === 'legal-aceptar'\) \{[\s\S]*?\n    \}/.exec(codigo)?.[0] || '';
  assert.ok(accion, 'no encuentro la acción de aceptar');
  assert.ok(/version: LEGAL\.actualizado/.test(accion), 'la aceptación dejó de guardar qué versión se aceptó');
  assert.ok(/cuando:/.test(accion), 'la aceptación dejó de guardar cuándo fue');
  // Y borrar los datos la olvida: quien pide que se borre todo lo suyo también
  // pide eso, y la app vuelve a enseñarle los documentos.
  const almacen = readFileSync(resolve(import.meta.dirname, '..', 'src', 'storage.js'), 'utf8');
  assert.ok(/'que-comemos-acepto-v1'/.test(almacen), 'la aceptación sobrevive a «borrar mis datos»');
});

test('la pantalla de arranque se quita sola y no se queda encima', () => {
  // Una capa transparente encima de la app seguiría siendo dueña de los toques.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  const fn = /function quitarElArranque\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(fn, 'no encuentro quitarElArranque()');
  assert.ok(/capa\.remove\(\)/.test(fn), 'la capa de arranque se queda en el documento');
  assert.ok(/quitarElArranque\(\);/.test(codigo), 'nadie quita la pantalla de arranque');
  // Y existe en el documento, con su estilo escrito ahí mismo: es lo único que
  // tiene que poder pintarse aunque ninguna hoja de estilo llegue.
  const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
  assert.ok(/id="arranque"/.test(html), 'se fue la pantalla de arranque');
  assert.ok(/#arranque \{/.test(html), 'el estilo del arranque se fue a una hoja que puede no llegar');
});
