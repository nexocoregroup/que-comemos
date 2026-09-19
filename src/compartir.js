// El día, escrito para quien lo va a cocinar.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
//
// En muchas casas quien planifica y quien cocina no son la misma persona. La
// app le enseña a la primera lo que hay que hacer hoy, las notas de cada comida
// —el campo se llama literalmente «Nota para quien cocina»— y, lo más
// importante, los avisos de alergia. La segunda no ve nada de eso: se lo
// cuentan de boca por la mañana, o no se lo cuentan.
//
// Esto convierte el día en un mensaje que se manda por donde ya se habla.
//
// ── Lo que no se puede omitir ──────────────────────────────────────────────
//
// Los avisos de alergia van dentro. `src/avisos.js` empieza diciendo que son
// «la única cosa del producto que puede hacerle daño a alguien», y hasta ahora
// los veía quien planifica, que no es quien echa el maní a la olla. Un mensaje
// con las comidas pero sin los avisos sería un atajo que rodea la única
// comprobación de seguridad que tiene la app: peor que no mandar nada.
//
// Y va el «sin comprobar» igual que en la pantalla, por el mismo motivo que se
// escribió allí: el silencio se lee como «revisado y todo bien». Una comida sin
// alimentos anotados no se ha revisado, y quien cocina es la única que puede
// mirarlo.
//
// ── Esto es texto, no HTML ─────────────────────────────────────────────────
//
// Aquí NO se llama a `esc()`, y es a propósito: lo que sale de este archivo va
// a la bandeja de compartir del teléfono, no a un documento. Escaparlo dejaría
// «arroz &amp; habichuelas» en el WhatsApp de alguien. Si algún día esto se
// enseña en pantalla antes de mandarlo, es ahí donde hay que escaparlo.
//
// Los asteriscos son de WhatsApp, que es donde va: pone en negrita el día y
// cada momento. En otro sitio se ven como asteriscos y se lee igual.

import {
  SLOTS, choquesDeLaComida, esOpcional, etiquetaDeMomento, planFor, recadoDe, restriccionesDe
} from './model.js';
import { tituloDePlan } from './page-semana.js';
import { cap, niceDate } from './ui-kit.js';

/* La frase termina en dos puntos y después el alimento, y no «es alérgica al
   maní», por una razón de gramática que no tiene arreglo barato: el artículo
   depende del género de cada alimento —«al maní» pero «a la leche»— y el
   catálogo no guarda el género de nada. Cualquier plantilla con artículo se
   equivoca en la mitad de los casos. Con dos puntos delante no hace falta
   artículo y la frase es correcta con cualquier alimento.

   En la pantalla esto no se notaba porque el nombre va dentro de un `<strong>`
   y se lee como una etiqueta, no como parte de la frase. En un mensaje de
   texto no hay negrita que lo disimule. */
const VERBO_DE_MOTIVO = {
  alergia: 'no puede comer',
  intolerancia: 'no tolera bien',
  preferencia: 'prefiere evitar'
};

/* Y el nombre en minúscula. El catálogo los guarda capitalizados —«Maní»,
   «Leche»— porque así se enseñan en una lista, pero a media frase «no puede
   comer Maní» se lee como si Maní fuera alguien. Solo la primera letra: un
   nombre que alguien escribió en mayúsculas se respeta a partir de la segunda. */
const enMinuscula = nombre => String(nombre || '').charAt(0).toLocaleLowerCase('es') + String(nombre || '').slice(1);

/* El triángulo es la única concesión a los emojis de todo el proyecto, y se
   gana el sitio: en una pantalla, un aviso de alergia tiene color, borde y
   posición para gritar. En un mensaje de texto no tiene nada de eso, y lo que
   hay que evitar es que alguien lo lea de refilón entre el nombre del plato y
   la nota. Las preferencias no lo llevan: no son un peligro y gastarían la
   señal. */
const MARCA_DE_MOTIVO = { alergia: '⚠️ ALERGIA —', intolerancia: '⚠️ Cuidado —', preferencia: '·' };

// Los choques de una comida, en renglones. Vienen ya ordenados de peor a menos
// grave desde `choquesDeLaComida`, y ese orden es el que hay que respetar: lo
// que puede mandar a alguien al hospital va antes que lo que no le gusta.
function avisosEnTexto(state, plan) {
  if (!plan || !['recipe', 'suelta', 'linked'].includes(plan.kind)) return [];

  const items = Array.isArray(plan.items) ? plan.items : [];
  const hayRestricciones = state.people.some(persona => restriccionesDe(persona).length);
  if (!items.length) {
    return hayRestricciones
      ? ['⚠️ SIN COMPROBAR: esta comida no tiene los alimentos anotados, así que no se ha podido revisar si choca con lo que alguien evita.']
      : [];
  }

  return choquesDeLaComida(state, items, plan.participants || []).map(choque =>
    `${MARCA_DE_MOTIVO[choque.motivo] || '·'} ${choque.persona} ${VERBO_DE_MOTIVO[choque.motivo] || 'evita'}: ${enMinuscula(choque.producto)}`);
}

// Un momento del día: su nombre, qué se cocina, los avisos y la nota.
function bloqueDeMomento(state, fecha, slot) {
  const plan = planFor(state, fecha, slot);
  // Las meriendas solo salen si hay algo puesto. Una casa que no merienda no
  // tiene que recibir dos renglones diciéndolo cada mañana.
  if (!plan && esOpcional(slot)) return null;

  const renglones = [`*${etiquetaDeMomento(slot)}*`];
  renglones.push(plan ? tituloDePlan(plan) : 'Sin decidir todavía.');
  renglones.push(...avisosEnTexto(state, plan));
  if (plan?.note) renglones.push(`Nota: ${plan.note}`);
  return renglones.join('\n');
}

/**
 * El mensaje de un día, listo para mandar. Devuelve texto plano.
 *
 * Lleva la fecha en la primera línea a propósito: un mensaje reenviado o leído
 * dos días después dice de qué día habla, así que no se puede confundir con el
 * de hoy. Es lo que sustituye a que el enlace se actualice solo.
 */
export function textoDelDia(state, fecha) {
  const partes = [`*${cap(niceDate(fecha))}*`];

  for (const slot of SLOTS) {
    const bloque = bloqueDeMomento(state, fecha, slot);
    if (bloque) partes.push(bloque);
  }

  const recado = recadoDe(state, fecha);
  if (recado) partes.push(`*Otros quehaceres*\n${recado}`);

  return partes.join('\n\n');
}

/* ── Mandarlo ──────────────────────────────────────────────────────────────

   El complemento de compartir abre la bandeja del sistema: WhatsApp, o lo que
   haya. Se llega a él por `globalThis.Capacitor` y no con un `import`, como
   todos los demás, porque fuera del APK no existe y un `import` dejaría la app
   sin arrancar en el navegador.

   Lo que la app NO puede hacer, y conviene que quede escrito aquí para que
   nadie lo intente: mandar el mensaje sola. Android no lo permite —el botón de
   enviar es de la persona, y no hay permiso que lo conceda— y las dos formas de
   saltárselo son peores que el problema: la API de empresa de WhatsApp haría
   pasar el plan de la casa por los servidores de Meta, y manejar la pantalla de
   WhatsApp con el servicio de accesibilidad pediría el permiso más poderoso de
   Android y Play lo rechazaría. La bandeja de compartir es el camino, y el
   último toque es de quien manda. */
const complemento = () => globalThis.Capacitor?.Plugins?.Share || null;

export const hayBandejaDeCompartir = () => Boolean(complemento());

/**
 * Abre la bandeja del sistema con el texto. En el navegador, donde no hay
 * complemento, cae al portapapeles: no es lo mismo, pero deja el mensaje en la
 * mano de quien lo pidió en vez de no hacer nada.
 *
 * Nunca lanza. Devuelve cómo salió para que la pantalla pueda decirlo.
 */
export async function compartirTexto(texto, titulo = 'Lo de hoy') {
  const plugin = complemento();
  if (plugin) {
    try {
      await plugin.share({ title: titulo, text: texto, dialogTitle: 'Mandar lo de hoy' });
      return { ok: true, via: 'bandeja' };
    } catch (error) {
      // Cerrar la bandeja sin elegir nada llega aquí como error. No es un
      // fallo: es alguien que se arrepintió, y no hay que decirle nada.
      const mensaje = String(error?.message || '');
      if (/cancel/i.test(mensaje)) return { ok: false, via: 'bandeja', motivo: 'cancelado' };
      return { ok: false, via: 'bandeja', motivo: mensaje || 'no se pudo abrir' };
    }
  }

  try {
    await globalThis.navigator?.clipboard?.writeText(texto);
    return { ok: true, via: 'portapapeles' };
  } catch (error) {
    return { ok: false, via: 'portapapeles', motivo: String(error?.message || 'no se pudo copiar') };
  }
}
