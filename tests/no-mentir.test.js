// Que la app no mienta sobre tus datos.
//
// Aquí no había nada roto a la vista. Había cosas que la app afirmaba y no eran
// ciertas, y dos sitios donde la única salida que ofrecía destruía lo que
// intentabas salvar:
//
//  · con los datos guardados ilegibles, las tres salidas de la pantalla los
//    borraban, y la más grande de las tres era un botón que decía «Organizar mi
//    casa»;
//  · al caducar la sesión, la casa desaparecía de la pantalla sin una palabra,
//    y la frase que lo explicaba estaba escrita en el código y no se pintaba;
//  · «Ver un ejemplo» no cargaba ningún ejemplo salvo en el primerísimo
//    arranque de la app;
//  · «Borrar el ejemplo» vaciaba la aplicación entera, también lo que la
//    persona hubiera escrito encima;
//  · y cuatro pantallas juraban «no hay cuenta, no hay servidor» con la
//    sincronización encendida.
//
// `app.js` no se puede importar en Node —toca `document` al cargarse—, así que
// lo que pasa dentro de él se vigila leyéndolo como texto. Lo demás se ejecuta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createEmptyState } from '../src/model.js';
import { saveState, clearAll } from '../src/storage.js';
import { conteo } from '../src/ui-kit.js';

const fuente = nombre => readFileSync(resolve(import.meta.dirname, '..', 'src', nombre), 'utf8');
/* Quitar los comentarios, y quitarlos de verdad.

   Filtrar por línea no vale en este proyecto: los comentarios de bloque
   explican por qué algo se retiró, y sus renglones de continuación empiezan por
   una palabra cualquiera. Justo esos renglones nombran a propósito lo que ya no
   existe —es la convención de la casa—, así que una prueba que busque frases
   prohibidas encontraría la frase dentro de la explicación de por qué se quitó.
   Se quitan los bloques enteros, y las líneas de `//` después. */
const sinComentarios = codigo => codigo
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .filter(linea => !/^\s*\/\//.test(linea))
  .join('\n');

// Un almacenamiento de mentira, para poder romperlo a voluntad.
function almacen({ rompe = false } = {}) {
  const datos = new Map();
  return {
    datos,
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => {
      if (rompe) { const error = new Error('The quota has been exceeded.'); error.name = 'QuotaExceededError'; throw error; }
      datos.set(clave, valor);
    },
    removeItem: clave => datos.delete(clave),
    key: indice => [...datos.keys()][indice],
    get length() { return datos.size; }
  };
}

/* ── Guardar dice si guardó ────────────────────────────────────────────── */

test('un guardado que no ocurre no se ve igual que uno que sí', () => {
  const state = createEmptyState();

  const bien = saveState(state, almacen(), 'prueba');
  assert.equal(bien.ok, true, 'un guardado que funciona dice que falló');

  // Teléfono lleno: `setItem` lanza. Antes eso subía hasta el reparto de
  // acciones y salía un aviso de 4,2 s diciendo «lo dejé como estaba» — mentira,
  // el cambio ya estaba en pantalla; lo único que no pasó fue guardarlo.
  const lleno = saveState(state, almacen({ rompe: true }), 'prueba');
  assert.equal(lleno.ok, false, 'un teléfono lleno se traga el fallo');
  assert.equal(lleno.motivo, 'no-cabe');

  // Y el agujero de verdad: sin almacenamiento, el interrogante de
  // `storage?.setItem` se tragaba la llamada entera. Ni excepción, ni aviso, ni
  // una línea en el cuaderno de fallos, mientras la pantalla enseñaba cada
  // casilla marcada. Los dos motivos se distinguen porque no son lo mismo.
  const sinNada = saveState(state, null, 'prueba');
  assert.equal(sinNada.ok, false, 'sin almacenamiento, guardar sigue diciendo que sí');
  assert.equal(sinNada.motivo, 'sin-almacen');

  // Y no lanza nunca: quedarse sin pantalla porque el disco está lleno sería
  // cambiar un fallo callado por uno peor.
  assert.doesNotThrow(() => saveState(state, almacen({ rompe: true }), 'prueba'));
});

test('la app se entera de que no pudo guardar, y lo dice en una franja', () => {
  const codigo = sinComentarios(fuente('app.js'));
  assert.ok(/function guardarSiSePuede/.test(codigo), 'nadie mira lo que devuelve saveState');
  assert.ok(/noSePudoGuardar/.test(codigo), 'el fallo de guardado no deja rastro en pantalla');
  // Una franja, no un aviso flotante: quien está marcando la compra en un
  // pasillo no está mirando la pantalla durante esos 4,2 segundos, y el fallo no
  // es de un toque sino de todos los que vengan detrás.
  assert.ok(/\$\{noSePudoGuardar \? notice\(/.test(codigo), 'el fallo de guardado volvió a ser un aviso que se va solo');
  // Y `guardar()` no repinta a propósito, así que tiene que pedir el repintado
  // cuando el fallo es nuevo o la franja no aparecería nunca.
  assert.ok(/if \(noSePudoGuardar !== antes\) render\(\);/.test(codigo), 'la franja no se pinta cuando el fallo aparece');
});

/* ── Datos ilegibles ───────────────────────────────────────────────────── */

test('con los datos ilegibles no se pinta la app, y no se escribe nada encima', () => {
  const codigo = sinComentarios(fuente('app.js'));
  // La pantalla propia va ANTES que todo lo demás: mientras se vea, no hay app
  // que usar, porque usarla pisa lo guardado.
  const pintar = /function pintar\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(/if \(loadError\) \{/.test(pintar), 'con los datos ilegibles se vuelve a pintar la app entera debajo del aviso');
  assert.ok(pintar.indexOf('loadError') < pintar.indexOf('tocaPedirCuenta'), 'la pantalla de ilegibles ya no es lo primero');
  assert.ok(/pantallaDeDatosIlegibles/.test(codigo));

  // Y la trampa: cualquier guardado pisaba el cajón con un estado vacío creado
  // para poder pintar algo.
  const guardarSiSePuede = /function guardarSiSePuede\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(/if \(loadError\) return;/.test(guardarSiSePuede),
    'con los datos ilegibles se vuelve a escribir encima del cajón');

  // La salida que no toca nada: los bytes del cajón, no `exportState`, que
  // escribiría el estado vacío que hay en memoria.
  assert.ok(/'descargar-crudo'/.test(codigo), 'no hay forma de salvar lo guardado antes de borrarlo');
  const descargar = /else if \(action === 'descargar-crudo'\) \{[\s\S]*?\n    \}/.exec(codigo)?.[0] || '';
  assert.ok(/localStorage\.getItem\(cajon\)/.test(descargar), 'la descarga de emergencia escribe el estado vacío en vez de lo guardado');
  assert.ok(!/exportState/.test(descargar));
});

/* ── La sesión que caduca ──────────────────────────────────────────────── */

test('una sesión caducada no cambia la pantalla por un formulario de registro', () => {
  const codigo = sinComentarios(fuente('app.js'));
  assert.ok(/function alCaducarLaSesion/.test(codigo), 'caducar vuelve a tratarse como cerrar sesión');
  const caducar = /function alCaducarLaSesion\(\) \{[\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  // Lo que hacía daño era esto: `alSalirDeLaCuenta` abre el cajón DE ESTE
  // TELÉFONO, que está vacío para quien siempre usó la cuenta.
  assert.ok(!/abrirCajon\(CAJON_DE_ESTE_TELEFONO\)/.test(caducar),
    'al caducar la sesión se vuelve a echar a la persona de su casa');
  assert.ok(/sesionCaducada = true/.test(caducar));
  // Y la portada de la cuenta no puede aparecer sola encima de la casa abierta.
  assert.ok(/!sesionCaducada/.test(/const tocaPedirCuenta = [^;]+;/.exec(codigo)?.[0] || ''),
    'la portada de registro vuelve a taparlo todo al caducar la sesión');
  // Al reiniciar tampoco: se recuerda qué cajón estaba abierto. Cerrar sesión a
  // propósito sí lo borra, que es la diferencia entre las dos cosas.
  assert.ok(/CLAVE_CAJON_CADUCADO/.test(codigo), 'reiniciar la app vuelve a esconder la casa');
  const salir = /function alSalirDeLaCuenta\([\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(/recordarCajonCaducado\(''\)/.test(salir), 'cerrar sesión deja la casa de esa cuenta al alcance del siguiente');
});

test('«borrar todos mis datos» se lleva también el cajón recordado', () => {
  // Si no, la app volvería a abrir la casa de una cuenta que alguien acaba de
  // pedir que desaparezca de este teléfono.
  const memoria = almacen();
  memoria.setItem('que-comemos-cajon-caducado', 'que-comemos-v1::alguien');
  memoria.setItem('que-comemos-v1::alguien', '{}');
  clearAll(memoria);
  assert.equal(memoria.getItem('que-comemos-cajon-caducado'), null, 'el cajón recordado sobrevive a «borrar mis datos»');
  assert.equal(memoria.getItem('que-comemos-v1::alguien'), null);
});

/* ── El ejemplo ────────────────────────────────────────────────────────── */

test('«Ver un ejemplo» carga un ejemplo, y no solo el primer día', () => {
  const codigo = sinComentarios(fuente('app.js'));
  const accion = /else if \(action === 'welcome-demo'\) \{[\s\S]*?\n    \}/.exec(codigo)?.[0] || '';
  assert.ok(accion, 'no encuentro la acción del ejemplo');
  assert.ok(/createDemoState\(\)/.test(accion),
    '«Ver un ejemplo» vuelve a encender el recorrido sobre cinco pantallas en blanco');
  assert.ok(/if \(!state\.demo\)/.test(accion),
    'pedir el ejemplo estando ya en él lo reconstruye y borra lo que se hubiera escrito encima');
});

test('la franja del ejemplo tiene dos salidas, y solo una borra', () => {
  const codigo = sinComentarios(fuente('app.js'));
  const franja = /\$\{state\.demo \?[\s\S]*?: ''\}/.exec(codigo)?.[0] || '';
  assert.ok(franja, 'no encuentro la franja del ejemplo');
  assert.ok(/'demo-adoptar'/.test(franja), 'la única salida de la franja del ejemplo vuelve a ser borrarlo todo');
  assert.ok(/btn-danger/.test(franja), 'la acción que vacía la aplicación entera vuelve a parecer inocente');
  // Y adoptar no borra nada: apaga la marca y ya. Mientras `demo` siga
  // encendido, `mereceLaPenaVincular` dice que no y quien se registre pierde el
  // ofrecimiento de subir su casa y le vuelven a preguntar quién vive en ella.
  const adoptar = /else if \(action === 'demo-adoptar'\) \{[\s\S]*?\n    \}/.exec(codigo)?.[0] || '';
  assert.ok(/state\.demo = false/.test(adoptar));
  assert.ok(!/clearAll|createEmptyState/.test(adoptar), '«Esto ya es mío» borra algo');
});

/* ── Lo que la app afirma sobre dónde viven los datos ──────────────────── */

test('ninguna pantalla jura «no hay servidor» sin mirar si lo hay', () => {
  // Era la única afirmación categórica y falsa de toda la app, y estaba en la
  // pantalla donde alguien decide si necesita bajarse un archivo.
  // La frase puede seguir existiendo —es verdad cuando la cuenta está apagada—
  // pero tiene que estar debajo de un condicional. Se mira el trozo de código
  // que la rodea y no su línea, porque el `sincronizando ?` va un renglón antes.
  const frases = /No hay cuenta, no hay servidor|datos viven solo en este teléfono|datos están solo en este teléfono|existe solo en este teléfono/g;
  for (const nombre of ['page-mas.js', 'page-cuenta.js']) {
    const codigo = sinComentarios(fuente(nombre));
    for (const encaje of codigo.matchAll(frases)) {
      const alrededor = codigo.slice(Math.max(0, encaje.index - 400), encaje.index);
      assert.ok(/sincronizando/.test(alrededor),
        `${nombre} vuelve a afirmar que no hay servidor sin mirar si lo hay: «${encaje[0]}»`);
    }
  }
  // Y el contexto se lo tiene que estar pasando alguien.
  assert.ok(/sincronizando: Boolean\(sesion\?\.sincronizando\)/.test(sinComentarios(fuente('app.js'))),
    'las pantallas ya no reciben si la sincronización está encendida');
});

/* ── Un conflicto no secuestra la pantalla ─────────────────────────────── */

test('un conflicto avisa donde estés, y no te lleva a otro sitio', () => {
  const codigo = sinComentarios(fuente('app.js'));
  const rama = /if \(salida\.resultado === 'conflicto'\) \{[\s\S]*?\n  \}/.exec(codigo)?.[0] || '';
  assert.ok(rama, 'no encuentro la rama del conflicto');
  assert.ok(!/ui\.page = 'cuenta'/.test(rama),
    'un conflicto vuelve a cambiar la pantalla sola cuatro segundos después de guardar algo');
  assert.ok(/ui\.cuenta\?\.conflicto \? notice\(/.test(codigo), 'un conflicto deja de avisarse fuera de Mi cuenta');
});

test('la pantalla del conflicto dice qué hay en cada una de las dos versiones', () => {
  const codigo = sinComentarios(fuente('page-cuenta.js'));
  assert.ok(/function comoEsEsaCasa/.test(codigo), 'de la versión de este teléfono no se dice nada');
  const vista = /function vistaConflicto\([\s\S]*?\n\}/.exec(codigo)?.[0] || '';
  assert.ok(/datosDeLaCasa/.test(vista), 'la versión de este teléfono sigue sin describirse');
  assert.ok(/estadoServidor/.test(vista));
  assert.ok(/queda una copia guardada/.test(vista),
    'la pantalla sigue sin decir que de la versión descartada queda copia');
});

/* ── Hablar como una persona ───────────────────────────────────────────── */

test('los conteos eligen el plural al pintar, que es cuando se sabe', () => {
  assert.equal(conteo(1, 'día', 'días'), '1 día');
  assert.equal(conteo(2, 'día', 'días'), '2 días');
  // El cero va en plural, que es como se dice en español.
  assert.equal(conteo(0, 'comida', 'comidas'), '0 comidas');
});
