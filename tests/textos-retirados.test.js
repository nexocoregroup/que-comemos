// Que ningún texto vuelva a prometer una función retirada.
//
// Este archivo existe porque el mismo fallo apareció tres veces seguidas, y las
// tres en sitios distintos: la app decía una cosa, el README otra y la ficha de
// Google Play una tercera. Borrar una función lleva media hora; encontrar las
// once frases repartidas que la seguían anunciando llevó una auditoría entera.
//
// La regla: una frase puede **nombrar** algo retirado —hace falta, para
// explicarle a quien venía de antes qué pasó con sus datos— pero no puede
// **ofrecerlo**. «Las rutinas ya no se crean en ninguna pantalla» está bien.
// «Tus rutinas» dentro de una lista de lo que la app guarda hoy, no.
//
// Por eso lo que se busca son frases enteras, no palabras sueltas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Todo lo que una persona puede leer: la app, la web pública y lo que se
// publica en la tienda.
const ARCHIVOS = [
  ...readdirSync('src').filter(nombre => nombre.endsWith('.js')).map(nombre => `src/${nombre}`),
  ...readdirSync('legal').filter(nombre => nombre.endsWith('.html')).map(nombre => `legal/${nombre}`),
  'README.md',
  'docs/play-store.md',
  'index.html'
];

// Frases que prometen algo que la app dejó de hacer. Cada una salió de un sitio
// real: son las que hubo que corregir, no un ejercicio de imaginación.
const PROMESAS_RETIRADAS = [
  ['cada mes empieza ya preparado', 'el mes ya no se rellena solo'],
  ['cada mes, solo revisar lo que', 'no hay revisión mensual de excepciones'],
  ['cada mes revisa solo lo que', 'lo mismo, en la ficha de la tienda'],
  ['el calendario del mes', 'no hay calendario de mes'],
  ['ya descuenta lo que acabas de contar', 'la compra no descuenta nada'],
  ['ya parte de lo que acabas de contar', 'la compra no parte de ningún conteo'],
  ['la app hace cuentas con lo que tú escribes', 'la app no hace cuentas'],
  ['los períodos que ves en la pantalla de la compra', 'la compra no enseña períodos'],
  ['cuándo toca la próxima lista y qué días cubre', 'nada dice cuándo toca'],
  ['está en ajustes → organización de compra para quien lo quiera', 'el reparto no está en ninguna parte'],
  ['la canasta, el menú, la compra y el inventario', 'ni canasta, ni menú, ni inventario'],
  ['más → respaldo', 'la sección «Más» no existe'],
  ['corregir lo que hay', 'la app no sabe lo que hay'],
  ['plan mensual', 'la sección se llama Plan semanal']
];

// En el código, los comentarios sí pueden nombrar lo retirado: explicar por qué
// una función se fue es justo lo que hay que dejar escrito para quien venga
// después. Lo que no puede es llegar a la pantalla. En la web y en la ficha de
// la tienda no hay comentarios: todo lo que hay ahí se lee.
const legible = (archivo, texto) => (archivo.endsWith('.js')
  ? texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  : texto);

test('ningún texto promete una función que se retiró', () => {
  const encontradas = [];
  for (const archivo of ARCHIVOS) {
    const texto = legible(archivo, readFileSync(archivo, 'utf8')).toLocaleLowerCase('es');
    for (const [frase, porque] of PROMESAS_RETIRADAS) {
      if (texto.includes(frase)) encontradas.push(`${archivo}: «${frase}» — ${porque}`);
    }
  }
  assert.deepEqual(encontradas, [], `volvieron ${encontradas.length} promesa(s) de funciones retiradas`);
});

/* ── Las tres puertas que escribían en el inventario ───────────────────── */

test('ninguna pantalla ofrece escribir en el libro de existencias', () => {
  // Leer lo que se anotó en su día, sí. Escribir, no: esas cifras ya no
  // alimentan nada, y un botón ahí afirma que la app sabe lo que hay en casa.
  const fuentes = ARCHIVOS.filter(nombre => nombre.startsWith('src/')).map(nombre => [nombre, readFileSync(nombre, 'utf8')]);
  for (const [archivo, texto] of fuentes) {
    for (const accion of ['open-correction', 'review-mode', 'review-scope', 'toggle-correct-review']) {
      assert.ok(!texto.includes(`"${accion}"`) && !texto.includes(`'${accion}'`),
        `${archivo} vuelve a ofrecer «${accion}»`);
    }
  }
});

/* ── Y que lo que sí se conserva se siga pudiendo nombrar ──────────────────

   Esto es lo contrario de la prueba de arriba, y hace falta: si alguien
   «arregla» la prueba de arriba borrando las explicaciones, quien venga de una
   versión vieja se queda sin saber qué pasó con lo que escribió. */

test('a quien venga de antes se le explica qué pasó con sus datos', () => {
  const privacidad = readFileSync('legal/privacidad.html', 'utf8');
  assert.ok(/versión anterior/.test(privacidad), 'el aviso de privacidad ya no habla de las versiones anteriores');
  assert.ok(/rutinas/.test(privacidad), 'ya no se nombra lo que quedó guardado de antes');
  assert.ok(/no se crean en ninguna pantalla/.test(privacidad), 'no se dice que aquello dejó de crearse');
});
