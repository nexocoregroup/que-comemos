// Botones que no llevan a ninguna parte.
//
// Es el fallo que el navegador no denuncia: no hay excepción, no hay pantalla
// roja. Se pulsa y no pasa nada, y quien lo pulsó se queda pensando que la app
// se colgó. La reestructuración dejó tres:
//
// - «Añadir a mis habituales» abría el modal `promover` y `renderModal`
//   preguntaba por `promoter`. Nunca coincidían: ni ventana, ni aviso, y encima
//   se escondía el botón + hasta cambiar de pantalla. Al arreglar el nombre
//   salió el segundo fallo escondido debajo —ese bloque llamaba a `shiftMonth`
//   sin importarlo—, que llevaba ahí desde que se escribió porque nunca se
//   había llegado a ejecutar.
// - «Empezar una revisión» era el único botón de su pantalla vacía y no lo
//   atendía nadie desde que se retiró el inventario.
// - El chat ofrecía «Editar una persona» con una acción inexistente.
//
// Se lee el archivo en vez de ejecutarlo porque app.js toca el documento nada
// más cargar y no se puede importar aquí.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);
const ARCHIVOS = readdirSync(new URL(SRC)).filter(nombre => nombre.endsWith('.js'));
const leer = archivo => readFileSync(new URL(archivo, SRC), 'utf8');

// Fuera los comentarios: cuentan la historia de lo que se quitó, y nombran
// acciones y ventanas que ya no existen a propósito.
const sinComentarios = texto => texto
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const TODO = ARCHIVOS.map(nombre => sinComentarios(leer(nombre))).join('\n');

test('cada ventana que se abre es una ventana que se sabe dibujar', () => {
  const app = sinComentarios(leer('app.js'));

  // Lo que se abre: `openModal('x')` desde cualquier archivo, más los que se
  // ponen a mano con `ui.modal = { type: 'x' }`.
  const abiertas = new Set();
  for (const [, tipo] of TODO.matchAll(/openModal\(\s*'([a-z0-9-]+)'/g)) abiertas.add(tipo);
  for (const [, tipo] of TODO.matchAll(/ui\.modal\s*=\s*\{\s*type:\s*'([a-z0-9-]+)'/g)) abiertas.add(tipo);
  assert.ok(abiertas.size > 15, `solo se encontraron ${abiertas.size} ventanas: el patrón de búsqueda se quedó atrás`);

  // Lo que se sabe dibujar: las ramas `m.type === 'x'` de `renderModal`.
  const dibujables = new Set([...app.matchAll(/m\.type === '([a-z0-9-]+)'/g)].map(hit => hit[1]));

  assert.deepEqual([...abiertas].filter(tipo => !dibujables.has(tipo)).sort(), [],
    'se abren ventanas que renderModal no sabe pintar');
  // Y al revés: una rama que nadie abre es código muerto que engaña al que lo lee.
  assert.deepEqual([...dibujables].filter(tipo => !abiertas.has(tipo)).sort(), [],
    'renderModal dibuja ventanas que nadie abre');
});

test('cada botón tiene quien lo atienda, y cada manejador quien lo dispare', () => {
  // Lo que se escribe en el HTML. Tres formas: el atributo literal, el ayudante
  // `button(etiqueta, accion, …)` de ui-kit, y los seis sitios donde el nombre
  // se arma con una plantilla.
  const escritas = new Set();
  for (const [, nombre] of TODO.matchAll(/data-action="([a-z0-9-]+)"/g)) escritas.add(nombre);
  for (const [, nombre] of TODO.matchAll(/\bbutton\(\s*(?:esc\()?[^,]+,\s*'([a-z0-9-]+)'/g)) escritas.add(nombre);
  // Los interpolados se resuelven a mano: el único prefijo en uso es `hogar`.
  for (const [, sufijo] of TODO.matchAll(/data-action="\$\{esc\(prefijo\)\}-([a-z-]+)"/g)) escritas.add(`hogar-${sufijo}`);
  for (const [, sufijo] of TODO.matchAll(/`\$\{prefijo\}-([a-z-]+)`/g)) escritas.add(`hogar-${sufijo}`);
  assert.ok(escritas.size > 40, `solo se encontraron ${escritas.size} acciones: el patrón se quedó atrás`);

  // Quien las atiende: las claves de los objetos `*_ACTIONS` y la cadena de
  // `else if (action === '…')` de app.js.
  const atendidas = new Set();
  for (const [, nombre] of TODO.matchAll(/^\s{2}'([a-z0-9-]+)':\s*(?:\(|async)/gm)) atendidas.add(nombre);
  for (const [, nombre] of TODO.matchAll(/action === '([a-z0-9-]+)'/g)) atendidas.add(nombre);

  // `navigate` y `close-modal` los atiende el armazón antes de la cadena.
  const DEL_ARMAZON = new Set(['navigate', 'close-modal']);
  assert.deepEqual([...escritas].filter(nombre => !atendidas.has(nombre) && !DEL_ARMAZON.has(nombre)).sort(), [],
    'botones que al pulsarlos no hacen nada');
});

/* ── Los seis tipos de comida, y el que se olvida ──────────────────────────

   Una comida puede ser de seis clases: `recipe` (del catálogo), `suelta`
   (escrita a mano ese día), `linked` (lo que sobró de otra) y las tres que no
   nombran plato —`outside`, `order`, `unplanned`—.

   `suelta` es la última en llegar, y por eso es la que se cae de las listas.
   Cae en silencio: una comida escrita a mano que no entra en la lista no
   revienta nada, simplemente deja de tener nombre, deja de poder reutilizarse o
   deja de poder editarse, y quien la escribió no entiende por qué su sancocho
   se comporta distinto del locrio.

   Lo que se busca aquí son las listas blancas de tipos de comida: un arreglo de
   cadenas que se pregunta por `algo.kind`. La regla es una sola y es la que
   tiene sentido: **donde entra `recipe` porque la comida tiene nombre propio,
   tiene que entrar `suelta`**, que también lo tiene.

   No se miran los `kind === 'recipe'` sueltos a propósito. Ahí `recipe` sí
   significa «del catálogo» y solo eso —cambiar el plato de un día, o
   «ponerla otros días», necesitan una preparación guardada detrás—, y además
   `kind` nombra otras dos cosas en este código: la clase de una persona y el
   tipo de un formulario. Una prueba que cazara esos tres a la vez sería una
   prueba que nadie podría poner en verde. */

test('ninguna lista de tipos de comida se olvida de la que se escribe a mano', () => {
  const CLASES = ['recipe', 'suelta', 'linked', 'outside', 'order', 'unplanned'];
  // Un arreglo hecho solo de tipos de comida, preguntado contra un `.kind`.
  const patron = new RegExp(String.raw`\[\s*((?:'(?:${CLASES.join('|')})'\s*,?\s*)+)\]\s*\.includes\(\s*[A-Za-z_$][\w$.?]*\.kind`, 'g');

  const listas = [];
  for (const archivo of ARCHIVOS) {
    for (const [texto, dentro] of sinComentarios(leer(archivo)).matchAll(patron)) {
      listas.push({ archivo, texto: texto.replace(/\s+/g, ' '), tipos: [...dentro.matchAll(/'([a-z]+)'/g)].map(hit => hit[1]) });
    }
  }
  // Si el patrón se queda atrás, esta prueba dejaría de poder fallar. Cinco son
  // las que hay hoy; que aparezcan más está bien, que desaparezcan no.
  assert.ok(listas.length >= 5, `solo se encontraron ${listas.length} listas de tipos de comida: el patrón se quedó atrás`);

  const olvidadizas = listas
    .filter(lista => lista.tipos.includes('recipe') && !lista.tipos.includes('suelta'))
    .map(lista => `${lista.archivo}: ${lista.texto}`);
  assert.deepEqual(olvidadizas, [],
    'listas que tratan una comida del catálogo como comida con nombre y dejan fuera la escrita a mano');

  // Y la lista de clases del modelo tiene que seguir nombrando las seis: es de
  // donde sale todo lo demás.
  const modelo = sinComentarios(leer('model.js'));
  assert.ok(/CLASES_DE_COMIDA = \['recipe', 'suelta', 'linked', \.\.\.ESTADOS_SIN_COMIDA\]/.test(modelo),
    'las seis clases de comida dejaron de estar escritas en un solo sitio');
  assert.ok(/ESTADOS_SIN_COMIDA = \['outside', 'order', 'unplanned'\]/.test(modelo));
});

test('cada formulario que se dibuja tiene quien lo guarde', () => {
  const escritos = new Set([...TODO.matchAll(/data-form="([a-z0-9-]+)"/g)].map(hit => hit[1]));
  assert.ok(escritos.size > 25, `solo se encontraron ${escritos.size} formularios: el patrón se quedó atrás`);

  // Las claves de los objetos `*_FORMS` —con comillas o sin ellas, y el
  // manejador puede ser `async`— y la cadena de `kind === '…'` de app.js.
  const atendidos = new Set();
  for (const [, nombre] of TODO.matchAll(/^\s{2}'([a-z0-9-]+)':\s*(?:async\s*)?\(form/gm)) atendidos.add(nombre);
  for (const [, nombre] of TODO.matchAll(/^\s{2}([a-z0-9]+):\s*(?:async\s*)?\(form/gm)) atendidos.add(nombre);
  for (const [, nombre] of TODO.matchAll(/kind === '([a-z0-9-]+)'/g)) atendidos.add(nombre);

  assert.deepEqual([...escritos].filter(nombre => !atendidos.has(nombre)).sort(), [],
    'formularios que al enviarlos no guardan nada');
});
