// Los avisos de alergia.
//
// Esto vivía dentro de `app.js`, que es el único archivo de la aplicación que
// ninguna prueba puede ejecutar: lee `document` al cargarse, así que en Node no
// arranca. Eso dejaba la única cosa del producto que puede hacerle daño a
// alguien —decir, o callar, que una comida lleva lo que una persona no puede
// comer— sin una sola prueba que la ejercitara. Estaba bien escrita y nadie lo
// comprobaba; el día que alguien la tocara, las pruebas seguirían en verde.
//
// Por eso está aquí, en un archivo sin DOM y sin estado propio: `app.js` lo
// importa y las pruebas también.
//
// Hay dos avisos y dicen cosas distintas:
//
//   · **Choque**: sé que esta comida lleva algo que esa persona evita. Se
//     nombra a la persona, el alimento y el motivo.
//   · **No se puede comprobar**: esta preparación no tiene alimentos anotados,
//     así que no he mirado nada. No es una alarma y tampoco es silencio: el
//     silencio se lee como «revisado y todo bien», y para una casa con una
//     alergia al maní esas dos cosas no se parecen en nada.
//
// Cuando sí hay alimentos y no hay ningún choque no se dice nada, que es lo
// correcto: afirmar «esta comida es segura» sería prometer una revisión que
// depende de que los alimentos anotados estén completos, y eso no lo sabe nadie
// más que quien cocina.
import { choquesDeLaComida, gravedadDeLaComida, restriccionesDe } from './model.js';
import { esc } from './ui-kit.js';
import { icono } from './icons.js';

const TONO_DE_GRAVEDAD = { 3: 'choque-alergia', 2: 'choque-intolerancia', 1: 'choque-preferencia' };
const TITULO_DE_GRAVEDAD = {
  3: 'Ojo: esto es una alergia',
  2: 'Cuidado: le sienta mal',
  1: 'Un detalle'
};
const VERBO_DE_MOTIVO = {
  alergia: 'es alérgica a',
  intolerancia: 'no tolera bien',
  preferencia: 'prefiere evitar'
};

export function avisoDeAlergias(state, items, participants, { conSalidas = false } = {}) {
  const hayRestricciones = state.people.some(persona => restriccionesDe(persona).length);
  if (!items.length && hayRestricciones) {
    return `<div class="choque choque-sinsaber" role="status">
      <div class="choque-cabeza"><span class="choque-marca" aria-hidden="true">?</span><strong>No se puede comprobar</strong></div>
      <p class="tiny">Esta preparación no tiene alimentos anotados, así que la app <strong>no ha revisado nada</strong>: no puede decir si choca con lo que alguien de la casa evita. Anota los alimentos que lleva y sí podrá avisarte.</p>
    </div>`;
  }
  return avisoDeChoques(choquesDeLaComida(state, items, participants), { conSalidas });
}

export function avisoDeChoques(choques, { conSalidas = false } = {}) {
  if (!choques.length) return '';
  const peor = gravedadDeLaComida(choques);
  const lineas = choques.map(choque =>
    `<li><strong>${esc(choque.persona)}</strong> ${esc(VERBO_DE_MOTIVO[choque.motivo] || 'evita')} <strong>${esc(choque.producto)}</strong>${choque.motivo ? '' : ' <span class="muted">(sin decir por qué)</span>'}</li>`).join('');
  return `<div class="choque ${TONO_DE_GRAVEDAD[peor] || 'choque-intolerancia'}" role="${peor === 3 ? 'alert' : 'status'}">
    <div class="choque-cabeza"><span class="choque-marca" aria-hidden="true">${peor === 3 ? icono('aviso', { tamano: 17 }) : peor === 2 ? '!' : '·'}</span><strong>${esc(TITULO_DE_GRAVEDAD[peor] || 'Ojo')}</strong></div>
    <ul class="choque-lista">${lineas}</ul>
    ${conSalidas ? '<p class="tiny">Puedes cambiar la preparación, quitar a esa persona de esta comida, o dejarla como está si le vas a hacer otra cosa. La app no te lo impide.</p>' : ''}
  </div>`;
}
