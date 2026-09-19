// Los avisos de alergia.
//
// Es lo único de esta app que puede hacerle daño a alguien. Todo lo demás, si
// se equivoca, cuesta una cena rara; esto cuesta una visita al hospital.
//
// Hasta ahora vivía dentro de `app.js`, que ninguna prueba puede ejecutar
// —lee `document` al cargarse—, así que estaba escrito con cuidado y sin una
// sola prueba detrás. Ahora está en `src/avisos.js` y esto es lo que lo
// defiende.
//
// Las dos mitades de la promesa:
//
//   1. Con alimentos anotados, el aviso sale y nombra a quién le toca.
//   2. Sin alimentos anotados, la app NO dice que la comida sea segura ni que
//      haya comprobado nada. El silencio se lee como «revisado y todo bien», y
//      eso sería mentir.

import test from 'node:test';
import assert from 'node:assert/strict';

import { avisoDeAlergias, avisoDeChoques } from '../src/avisos.js';
import { addProduct, createEmptyState, choquesDeLaComida, upsertPerson } from '../src/model.js';

// Palabras que el aviso no puede decir nunca cuando no ha comprobado nada.
const PALABRAS_QUE_TRANQUILIZAN = [
  'segur', 'sin problema', 'todo bien', 'comprobad', 'revisad', 'apto', 'puede comer', 'no hay riesgo'
];

function casa({ motivo = 'alergia' } = {}) {
  const state = createEmptyState();
  const mani = addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb', category: 'otros' }).id;
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' }).id;
  const sofia = upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: mani, motivo }] }).id;
  const luis = upsertPerson(state, { name: 'Luis', kind: 'adulto', restricciones: [] }).id;
  return { state, mani, arroz, sofia, luis };
}

const texto = html => html.replace(/<[^>]*>/g, ' ').toLocaleLowerCase('es');

/* ── 1. Con alimentos: el aviso sale ───────────────────────────────────── */

test('una comida con el alimento que alguien evita avisa, y dice quién y qué', () => {
  const { state, mani, arroz, sofia, luis } = casa();
  const html = avisoDeAlergias(state, [{ productId: arroz }, { productId: mani }], [sofia, luis]);

  assert.ok(html, 'no salió ningún aviso');
  assert.ok(html.includes('Sofía'), 'el aviso no dice a quién le toca');
  assert.ok(html.includes('Maní'), 'el aviso no dice qué alimento es');
  assert.ok(html.includes('es alérgica a'), 'el aviso no dice por qué');
  // Una alergia es una alarma, no una nota al pie.
  assert.ok(html.includes('role="alert"'), 'una alergia no se anuncia como alarma');
  assert.ok(html.includes('choque-alergia'), 'una alergia no se pinta como alergia');
});

test('solo se nombra a quien le toca', () => {
  const { state, mani, sofia, luis } = casa();
  const html = avisoDeAlergias(state, [{ productId: mani }], [sofia, luis]);
  assert.ok(html.includes('Sofía'));
  assert.ok(!html.includes('Luis'), 'se avisa de una alergia a quien no la tiene');
});

test('a quien no come esa comida no se le avisa', () => {
  const { state, mani, sofia, luis } = casa();
  const html = avisoDeAlergias(state, [{ productId: mani }], [luis]);
  assert.equal(html, '', 'avisa de la alergia de alguien que no está en esa comida');
  assert.ok(!html.includes('Sofía'));
});

test('cada motivo se dice con sus palabras y su tono', () => {
  for (const [motivo, verbo, clase] of [
    ['alergia', 'es alérgica a', 'choque-alergia'],
    ['intolerancia', 'no tolera bien', 'choque-intolerancia'],
    ['preferencia', 'prefiere evitar', 'choque-preferencia']
  ]) {
    const { state, mani, sofia } = casa({ motivo });
    const html = avisoDeAlergias(state, [{ productId: mani }], [sofia]);
    assert.ok(html.includes(verbo), `«${motivo}» no se escribe como «${verbo}»`);
    assert.ok(html.includes(clase), `«${motivo}» no se pinta con su tono`);
  }
});

test('una restricción sin motivo avisa igual, y dice que no se sabe por qué', () => {
  // Media respuesta es mejor que ninguna: que alguien evite algo importa
  // aunque nadie haya escrito si es alergia o manía.
  const { state, mani, sofia } = casa({ motivo: '' });
  const html = avisoDeAlergias(state, [{ productId: mani }], [sofia]);
  assert.ok(html, 'una restricción sin motivo dejó de avisar');
  assert.ok(html.includes('Sofía') && html.includes('Maní'));
  assert.ok(/sin decir por qué/.test(html), 'no se dice que falta el motivo');
});

/* ── 2. Sin alimentos: no se afirma nada ───────────────────────────────── */

test('sin alimentos anotados, la app dice que no ha comprobado nada', () => {
  const { state, sofia } = casa();
  const html = avisoDeAlergias(state, [], [sofia]);

  assert.ok(html, 'una preparación sin alimentos no dijo absolutamente nada');
  assert.ok(/No se puede comprobar/.test(html), 'no se dice que no se ha comprobado');
  assert.ok(/no ha revisado nada/.test(html), 'no se dice que no se revisó nada');
  // Y se explica cómo arreglarlo, que es lo único útil que se puede decir ahí.
  assert.ok(/Anota los alimentos/.test(html), 'no se dice cómo conseguir el aviso');
});

test('sin alimentos anotados NO se afirma que la comida sea segura', () => {
  const { state, sofia } = casa();
  const plano = texto(avisoDeAlergias(state, [], [sofia]));
  for (const palabra of PALABRAS_QUE_TRANQUILIZAN) {
    if (palabra === 'comprobad' || palabra === 'revisad') continue; // los usa en negativo
    assert.ok(!plano.includes(palabra), `el aviso tranquiliza con la palabra «${palabra}» sin haber mirado nada`);
  }
  // «comprobar» y «revisar» solo pueden salir negados.
  assert.ok(/no se puede comprobar/.test(plano), 'la frase de comprobar no está en negativo');
  assert.ok(/no ha revisado nada/.test(plano), 'la frase de revisar no está en negativo');
});

test('sin nadie que evite nada, no se dice nada: no es ruido', () => {
  const state = createEmptyState();
  upsertPerson(state, { name: 'Luis', kind: 'adulto', restricciones: [] });
  assert.equal(avisoDeAlergias(state, [], [state.people[0].id]), '',
    'se avisa de restricciones en una casa que no tiene ninguna');
});

test('con alimentos y sin choques no se promete nada', () => {
  // Callar es lo correcto. Decir «sin problemas» sería prometer que los
  // alimentos anotados están completos, y eso no lo sabe la app.
  const { state, arroz, sofia } = casa();
  const html = avisoDeAlergias(state, [{ productId: arroz }], [sofia]);
  assert.equal(html, '', 'se dibuja algo cuando no hay nada que decir');
});

/* ── Que el aviso no se pueda romper ───────────────────────────────────── */

test('un nombre con HTML dentro no se cuela en la pantalla', () => {
  const state = createEmptyState();
  const veneno = addProduct(state, { name: '<img src=x onerror=alert(1)>', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const persona = upsertPerson(state, { name: '<script>malo</script>', kind: 'adulto', restricciones: [{ productId: veneno, motivo: 'alergia' }] }).id;
  const html = avisoDeAlergias(state, [{ productId: veneno }], [persona]);
  assert.ok(!/<img|<script/.test(html), 'el aviso deja pasar HTML de un nombre');
  assert.ok(html.includes('&lt;'), 'no se escapó nada');
});

test('el aviso de choques por su cuenta no inventa nada con una lista vacía', () => {
  assert.equal(avisoDeChoques([]), '', 'sin choques se dibuja algo');
});

/* ── Que sigan conectados ──────────────────────────────────────────────────

   El aviso es la pantalla; `choquesDeLaComida` es quien sabe. Si alguien
   cambiara uno sin el otro, la comida seguiría teniendo el choque y la persona
   no lo vería. Esto ata los dos. */

test('todo choque que el modelo encuentra acaba escrito en el aviso', () => {
  const { state, mani, arroz, sofia, luis } = casa();
  const otro = upsertPerson(state, { name: 'Ana', kind: 'adulto', restricciones: [{ productId: arroz, motivo: 'intolerancia' }] }).id;
  const items = [{ productId: mani }, { productId: arroz }];
  const gente = [sofia, luis, otro];

  const choques = choquesDeLaComida(state, items, gente);
  assert.equal(choques.length, 2, 'el modelo dejó de ver uno de los dos choques');

  const html = avisoDeAlergias(state, items, gente);
  for (const choque of choques) {
    assert.ok(html.includes(choque.persona), `«${choque.persona}» no aparece en el aviso`);
    assert.ok(html.includes(choque.producto), `«${choque.producto}» no aparece en el aviso`);
  }
  // Y manda la más grave de las dos.
  assert.ok(html.includes('choque-alergia'), 'con una alergia y una intolerancia, gana la intolerancia');
});
