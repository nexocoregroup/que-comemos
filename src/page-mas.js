// Las pantallas que no son «Hoy», «Plan semanal» ni «La compra».
//
// «Más» era una sección de la barra cuyo único contenido era decir dónde
// estaban las demás: una pantalla entera para pintar una lista de enlaces. Ya
// no existe. La barra lleva a las cinco cosas que se usan —Hoy, Plan semanal,
// Compra, Mis productos habituales, Preparaciones— y todo lo que se abre una
// vez cada muchos meses vive detrás del engranaje, en Ajustes, que es el único
// índice que queda.
//
// Con «Más» se fue «Alimentos de la casa», la lista que exhibía la ficha
// técnica de cada producto —medidas, categoría, equivalencia— como si fueran
// trabajo pendiente. El modelo las sigue guardando y el formulario del producto
// las sigue preguntando cuando hacen falta; lo que se retira es obligar a
// alguien a administrarlas. Sus tres capacidades reales no se perdieron, se
// repartieron por donde se necesitan: editar un producto se hace donde la
// persona mira su lista —Mis productos habituales—, y archivar o restaurar uno
// están en Funciones avanzadas, junto a las demás herramientas de reparación.

import { RUBROS } from './catalog-seed.js';
import {
  FRECUENCIAS, MOMENTOS, archiveProduct, etiquetaDeMomento, esActiva, findSimilarProducts, frecuenciaDe,
  nombreEnElCierre, habitualLines, habitualesPorRubro, historialDeFrecuencia, lastStockReview,
  periodosDelMes, personasActivas, product, restoreProduct, restriccionesDe, listasCerradas, resumenDeLista,
  reviewAvailability, sliceStyle, syncReviewProducts, todayISO
} from './model.js';
import { claseDe, hogarDe, resumenDeRestricciones } from './hogar.js';
import { button, empty, esc, fmt, measure, monthName, niceDate, notice, options, shiftMonth, unitText } from './ui-kit.js';
import { icono, iconoDeCategoria } from './icons.js';
import { LEGAL } from './legal.js';

const hoy = todayISO();

/* ── Las pantallas de este archivo ─────────────────────────────────────────

   Ya no es un menú: es la tabla de la que salen las rutas y los títulos de
   cabecera. Ninguna de estas filas se pinta como una lista de enlaces —las dos
   primeras son secciones de la barra, y las demás se entran desde Ajustes—,
   así que el orden de aquí es el de leerlas, no el de enseñarlas.

   El icono y el detalle se conservan porque son lo que cada pantalla es, y
   porque el día que vuelva a hacer falta pintar una fila ya están escritos. */

export const ENTRADAS_MAS = [
  ['canasta', 'canasta', 'Mis productos habituales', 'Lo que se compra de costumbre'],
  ['preparaciones', 'libro', 'Preparaciones', 'Las comidas que se repiten en casa'],
  ['ajustes', 'ajustes', 'Ajustes', 'Tu casa, tus datos y cómo funciona la app'],
  ['familia', 'personas', 'Familia y restricciones', 'Quién come y qué evita cada quien'],
  ['historial', 'reloj', 'Historial', 'Tus compras: qué llevabas y qué trajiste'],
  ['respaldo', 'descargar', 'Respaldo', 'Guardar una copia o traerla de vuelta'],
  ['cuenta', 'persona', 'Mi cuenta', 'Entrar, sincronizar o cerrar sesión'],
  ['avanzado', 'chip', 'Funciones avanzadas', 'Medidas, correcciones y uniones'],
  // «Revisar lo que queda» dejó de pedirse cada semana al retirarse el
  // inventario, pero quien tenga revisiones viejas las sigue abriendo desde
  // Ajustes → Historial: quitarle la ruta sería dejar un enlace que no lleva a
  // ninguna parte en datos que la persona escribió a mano.
  ['revision', 'visto', 'Lo que revisaste antes', 'Las revisiones de la despensa que quedaron guardadas']
];

// «legal» y «organizacion» se llegan desde Ajustes y necesitan el mismo
// enrutado y el mismo botón de volver que las demás.
// «cuenta» se entra desde Ajustes, pero no la pinta este archivo: la pintan las
// pantallas de `page-cuenta.js`, que necesitan cosas —la sesión, el cajón
// abierto, la sincronización— que solo conoce `app.js`. Por eso se queda fuera
// de esta lista aunque esté en la de arriba.
export const PAGINAS_MAS = [...ENTRADAS_MAS.map(([id]) => id).filter(id => id !== 'cuenta'), 'legal', 'organizacion'];

export const TITULOS_MAS = {
  ...Object.fromEntries(ENTRADAS_MAS.map(([id, , titulo]) => [id, titulo])),
  // Tampoco sale en el índice: se llega desde Ajustes, que es donde el usuario
  // la pidió —«Ajustes → Organización de compra → Frecuencia de compra»—.
  organizacion: 'Organización de compra'
};

export function emptyMas() {
  return {

    revisionFiltro: '', revisionSoloFaltan: false,
    // El buscador de preparaciones y qué bloques están abiertos. Empiezan todos
    // abiertos: una casa con seis preparaciones no quiere abrir cinco cajones.
    recetaFiltro: '', recetasPlegadas: [],
    documento: 'privacidad',
    // Qué período cerrado se está mirando por dentro, en el Historial.
    cierreAbierto: '',
    // El formulario de cambiar la frecuencia, plegado hasta que alguien lo pide.
    cambiandoFrecuencia: false, frecuenciaNueva: '', frecuenciaDesde: ''
  };
}

export function renderMas(ctx) {
  const { ui } = ctx;
  if (!ui.mas) ui.mas = emptyMas();
  const vistas = {
    canasta: renderCanasta,
    preparaciones: renderPreparaciones,
    familia: renderFamilia,
    revision: renderRevision,
    historial: renderHistorial,
    respaldo: renderRespaldo,
    ajustes: renderAjustes,
    organizacion: renderOrganizacion,
    avanzado: renderAvanzado,
    legal: renderLegal
  };
  // Ajustes es el índice, así que también es el destino de cualquier ruta que
  // ya no exista: quien llegue a una dirección vieja aterriza donde están
  // todas, no en una pantalla en blanco.
  return (vistas[ui.page] || renderAjustes)(ctx);
}

// Las pantallas de dentro de Ajustes vuelven a Ajustes, que es de donde se
// entra a todas ellas.
function volver(titulo) {
  return `<div class="mas-volver">${button('‹ Ajustes', 'navigate', 'btn-quiet btn-small', 'data-page="ajustes"')}<h2>${esc(titulo)}</h2></div>`;
}

// «Mis productos habituales», «Preparaciones» y el propio Ajustes son destinos
// de primer nivel: se entran desde la barra o desde el engranaje, y no llevan
// botón de volver ni repiten su nombre dentro de la pantalla. La cabecera de
// la app ya lo escribe arriba, y escribirlo otra vez dejaba el mismo título
// dos veces seguidas.

/* ── Mis productos habituales ──────────────────────────────────────────────

   Una lista de nombres agrupada por rubro, y nada más.

   Aquí se preguntaba cuánto se compra de cada cosa al mes. Era el presupuesto
   del que salía la compra calculada, y esa cuenta se retiró: hoy la compra se
   escribe a mano, delante del estante. Un campo que no alimenta nada es peor
   que no tenerlo, porque quien lo ve cree que sirve para algo.

   Las cantidades que ya estaban escritas siguen en el respaldo y en los meses
   cerrados, que se calcularon con ellas. No se enseñan ni se piden. */

function renderCanasta(ctx) {
  const { state } = ctx;
  const grupos = habitualesPorRubro(state);
  if (!grupos.length) {
    return empty('canasta', 'Todavía no has escrito tu lista',
      'Son los productos que en tu casa nunca faltan: los plátanos, el arroz, los huevos, el salami. Se escriben una vez y valen para siempre; sirven para no tener que acordarte de todo cada vez que vas al colmado.',
      `${button('Marcarlos de una lista', 'setup-open', 'btn-primary')}${button(`${icono('hoja', { tamano: 17 })}Escribirlos de corrido`, 'open-bulk', 'btn-secondary', 'data-destino="habitual"')}`);
  }
  const total = grupos.reduce((suma, grupo) => suma + grupo.lineas.length, 0);
  return `<p class="pantalla-intro">Lo que en tu casa nunca falta. <strong>Aquí no se apuntan cantidades</strong>: cuánto llevas se decide en la compra, que es cuando se sabe.</p>
    ${grupos.map(grupo => bloqueDeRubro(ctx, grupo)).join('')}
    <p class="tiny muted">${total} producto(s) en ${grupos.length === 1 ? 'un rubro' : `${grupos.length} rubros`}. Quitar uno de aquí no cambia ninguna compra que ya se hizo.</p>
    <div class="pantalla-acciones">
      ${button('+ Añadir producto', 'open-product', 'btn-secondary')}
      ${button(`${icono('hoja', { tamano: 17 })}Añadir varios de corrido`, 'open-bulk', 'btn-quiet', 'data-destino="habitual"')}
    </div>`;
}

// Los mismos ocho rubros, con el mismo icono y el mismo orden que en la compra
// y en el registro inicial. Son la misma lista vista desde tres sitios, y verla
// ordenada de tres maneras distintas obligaría a aprenderla tres veces.
function bloqueDeRubro(ctx, grupo) {
  const { state } = ctx;
  const rubro = RUBROS.find(item => item.id === grupo.rubro);
  return `<section class="canasta-rubro">
    <h3 class="canasta-grupo">
      <span class="canasta-grupo-icono">${iconoDeCategoria(grupo.rubro, { tamano: 20 })}</span>
      ${esc(rubro?.titulo || grupo.rubro)}
      <span class="badge-count">${grupo.lineas.length}</span>
    </h3>
    <div class="card canasta-card">${grupo.lineas.map(linea => {
      const item = product(state, linea.productId);
      if (!item) return '';
      return `<div class="canasta-fila">
        <div class="canasta-nombre">${esc(item.name)}${linea.nota ? `<span class="canasta-nota">${esc(linea.nota)}</span>` : ''}</div>
        <button type="button" class="enlace canasta-editar" data-action="open-product" data-id="${esc(item.id)}" aria-label="Editar ${esc(item.name)}">Editar</button>
        <button type="button" class="btn btn-quiet btn-small" data-action="canasta-quitar" data-id="${esc(item.id)}" aria-label="Quitar ${esc(item.name)} de mis productos habituales">${icono('cerrar', { tamano: 17 })}</button>
      </div>`;
    }).join('')}</div>
  </section>`;
}

/* ── Preparaciones ─────────────────────────────────────────────────────────

   Una rejilla plana de tarjetas deja de servir en cuanto hay quince: para
   encontrar lo que se cena hay que leerlas todas. Ahora van en cinco bloques
   plegables, uno por momento del día, con la cuenta a la vista.

   Una preparación marcada para dos momentos sale en los dos bloques, y sigue
   siendo un solo registro: los bloques filtran la misma lista, no la copian.
   Por eso editarla desde cualquiera de ellos la actualiza en todos, sin nada
   que sincronizar. */

function renderPreparaciones(ctx) {
  const { state, ui } = ctx;
  const filtro = String(ui.mas.recetaFiltro || '').trim().toLocaleLowerCase('es');
  const coincide = receta => !filtro
    || receta.name.toLocaleLowerCase('es').includes(filtro)
    || (receta.note || '').toLocaleLowerCase('es').includes(filtro)
    || receta.items.some(item => (product(state, item.productId)?.name || '').toLocaleLowerCase('es').includes(filtro));
  const visibles = state.recipes.filter(coincide);
  const plegados = new Set(ui.mas.recetasPlegadas || []);
  const sinMomento = state.recipes.filter(receta => !receta.uses?.length);

  if (!state.recipes.length) {
    return `      ${empty('libro', 'Todavía no hay ninguna',
        'Una preparación es algo como «mangú con salami» o «arroz con pollo»: el nombre, en cuáles momentos suele comerse y, si quieres, los alimentos principales. No hace falta anotar la sal ni el aceite.',
        button('Crear la primera', 'open-recipe', 'btn-primary'))}`;
  }

  return `    <p class="pantalla-intro">Comidas que se repiten en tu casa. Se guardan una vez aquí y se ponen en los días desde <strong>Plan semanal</strong>, que es donde se ve el calendario.</p>
    <div class="pantalla-acciones">${button('+ Nueva preparación', 'open-recipe', 'btn-primary')}</div>

    <div class="setup-buscador">
      <label class="field setup-search"><span class="sr-only">Buscar una preparación</span>
        <input type="search" id="receta-filtro" value="${esc(ui.mas.recetaFiltro || '')}" placeholder="Buscar entre ${state.recipes.length} preparación(es)…" autocomplete="off" aria-label="Buscar una preparación">
      </label>
      ${ui.mas.recetaFiltro ? button('Ver todo', 'receta-limpiar', 'btn-quiet') : ''}
    </div>

    ${filtro && !visibles.length ? `<p class="muted">Nada coincide con «${esc(ui.mas.recetaFiltro)}».</p>` : ''}

    ${MOMENTOS.map(momento => {
      const delMomento = visibles.filter(receta => receta.uses?.includes(momento.id));
      // Un bloque vacío se sigue enseñando cuando no hay búsqueda: saber que
      // no hay ninguna merienda anotada es información, no ruido.
      if (filtro && !delMomento.length) return '';
      const abierto = !plegados.has(momento.id);
      return `<section class="recetas-bloque">
        <button type="button" class="recetas-cabecera" data-action="receta-plegar" data-momento="${momento.id}" aria-expanded="${abierto}">
          <span class="recetas-flecha">${icono(abierto ? 'desplegar' : 'derecha', { tamano: 18 })}</span>
          <span class="recetas-titulo">${esc(momento.plural)}</span>
          <span class="badge-count">${delMomento.length}</span>
        </button>
        ${abierto ? (delMomento.length
          ? `<div class="grid grid-2">${delMomento.map(receta => tarjetaDeReceta(state, receta)).join('')}</div>`
          : `<p class="small muted recetas-vacio">Todavía no hay ninguna para ${esc(momento.etiqueta.toLocaleLowerCase('es'))}.</p>`) : ''}
      </section>`;
    }).join('')}

    ${sinMomento.length ? notice('Hay preparaciones sin momento', `${sinMomento.length} preparación(es) no tienen ningún momento marcado, así que no salen en ningún bloque: ${sinMomento.map(receta => esc(receta.name)).join(', ')}. Ábrelas y marca cuándo se comen.`, 'warn') : ''}`;
}

/* ── La ficha y sus reglas, en la misma tarjeta ────────────────────────────

   Arriba, la ficha: cómo se llama, en qué momentos **puede** comerse, qué lleva
   y la nota. Abajo, sus reglas: cuándo **se pone**. Son dos cosas y se ven como
   dos cosas, porque confundirlas es lo que hacía que «mangú de desayuno y de
   cena, los lunes» pusiera mangú el lunes por la mañana y el lunes por la noche.

   Cada regla trae sus tres botones. Editar una no toca las demás: la del lunes
   de desayuno y la del viernes de cena son dos costumbres distintas de la misma
   casa, y tratarlas como una era el problema. */

function tarjetaDeReceta(state, receta) {
  const momentos = (receta.uses || []).map(id => MOMENTOS.find(item => item.id === id)?.etiqueta || id);
  // Lo que no se puede comprobar se dice. Una preparación sin alimentos no
  // choca con nada, y eso se leía igual que «revisada y limpia».
  const hayRestricciones = state.people.some(persona => restriccionesDe(persona).length);

  return `<article class="card receta-tarjeta">
    <div class="between"><h3>${esc(receta.name)}</h3></div>
    <p class="small muted">${momentos.map(texto => `<span class="pill warm">${esc(texto)}</span>`).join(' ')}</p>
    ${receta.items.length
      ? `<ul class="food-list">${receta.items.map(item => `<li>${esc(product(state, item.productId)?.name || '—')}</li>`).join('')}</ul>`
      : `<p class="small muted receta-incompleta">Sin alimentos anotados.${hayRestricciones ? ' La app <strong>no ha revisado</strong> si choca con lo que alguien de la casa evita: sin los alimentos no puede saberlo.' : ' Sirve igual para el calendario.'}</p>`}
    ${receta.note ? `<p class="small"><strong>Para quien cocina:</strong> ${esc(receta.note)}</p>` : ''}


    <div class="inline">
      ${button('Ponerla en el calendario', 'semana-poner-en-dias', 'btn-secondary btn-small', `data-receta="${receta.id}" data-kind="recipe"`)}
      ${button('Editar', 'open-recipe', 'btn-quiet btn-small', `data-id="${receta.id}"`)}
      ${button('Eliminar', 'delete-recipe', 'btn-quiet btn-small', `data-id="${receta.id}"`)}
    </div>
  </article>`;
}

/* ── Familia ───────────────────────────────────────────────────────────── */

// Quien llega aquí viene por una de dos razones: registrar a su casa por primera
// vez, o cambiar algo porque la familia cambió. Las dos tienen su botón arriba y
// ninguna obliga a pasar por la otra.
//
// Dar de baja no borra. Una persona que se fue de casa tiene que seguir
// leyéndose en las comidas de marzo —fue quien las comió— y su ficha sigue
// entera por si vuelve. Lo único que cambia es que deja de contar para lo que se
// va a cocinar. Por eso aquí no hay ningún botón de «eliminar»: borrar a alguien
// reescribiría el historial, que es justo lo que no puede pasar.
function renderFamilia(ctx) {
  const { state } = ctx;
  const nombreProducto = id => product(state, id)?.name || 'Alimento eliminado';
  const enCasa = personasActivas(state);
  const fuera = state.people.filter(persona => !esActiva(persona));
  const hogar = hogarDe(state);
  const sinMotivo = state.people.reduce((total, persona) => total + restriccionesDe(persona).filter(fila => !fila.motivo).length, 0);

  const tarjeta = (persona, activa) => `<article class="card familia-persona">
    <div class="between">
      <h3>${esc(persona.name)}</h3>
      <div class="familia-etiquetas">
        <span class="pill gray">${esc(claseDe(persona.kind).etiqueta)}</span>
        ${activa ? '' : '<span class="pill warm">Dado de baja</span>'}
      </div>
    </div>
    ${resumenDeRestricciones(state, persona)}
    <div class="familia-acciones">
      ${button('Editar', 'hogar-editar', 'btn-secondary btn-small', `data-id="${persona.id}"`)}
      ${activa
        ? button('Ya no vive aquí', 'hogar-baja', 'btn-quiet btn-small', `data-id="${persona.id}"`)
        : button('Vuelve a vivir aquí', 'hogar-alta', 'btn-secondary btn-small', `data-id="${persona.id}"`)}
    </div>
  </article>`;

  return `${volver('Familia y restricciones')}
    <p class="pantalla-intro">Quién come en casa y qué evita cada quien. La app avisa si una comida lleva algo que alguien no puede comer.</p>
    <div class="pantalla-acciones">
      ${button(hogar.estado === 'listo' || enCasa.length ? 'Configurar mi hogar otra vez' : 'Configurar mi hogar', 'hogar-open', enCasa.length ? 'btn-secondary' : 'btn-primary')}
      ${button('+ Añadir persona', 'hogar-editar', enCasa.length ? 'btn-primary' : 'btn-secondary')}
      ${button('Marcar una ausencia', 'open-absence', 'btn-secondary')}
    </div>
    ${sinMotivo ? notice('Hay alimentos anotados sin decir por qué', `${sinMotivo} alimento(s) están marcados como «sin decir»: se anotaron antes de que la app preguntara si era alergia, intolerancia o preferencia. La app avisa de ellos igual que siempre. Si entras a editar a la persona puedes decir cuál es cada uno.`, 'warn') : ''}
    ${enCasa.length
      ? `<div class="grid grid-2">${enCasa.map(persona => tarjeta(persona, true)).join('')}</div>`
      : empty('personas', 'Todavía no hay nadie', 'Anotar quién come en casa sirve para dos cosas: avisar de alergias y saber para cuántos se cocina. Son dos preguntas por persona.', button('Configurar mi hogar', 'hogar-open', 'btn-primary'))}
    ${fuera.length ? `<div class="section-head"><h3 class="plan-sub">Ya no viven aquí</h3></div>
      <p class="small muted">Siguen apareciendo en las comidas de antes, porque las comieron. No cuentan para las comidas nuevas.</p>
      <div class="grid grid-2 familia-baja">${fuera.map(persona => tarjeta(persona, false)).join('')}</div>` : ''}
    ${state.absences.length ? `<div class="section-head"><h3 class="plan-sub">Ausencias anotadas</h3></div>
      <div class="card">${[...state.absences].sort((a, b) => a.date.localeCompare(b.date)).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(state.people.find(p => p.id === item.personId)?.name || 'Persona eliminada')}</div><div class="list-row-sub">${esc(etiquetaDeMomento(item.slot))} · ${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div>${button('Quitar', 'remove-absence', 'btn-quiet btn-small', `data-date="${item.date}" data-slot="${item.slot}" data-id="${item.personId}"`)}</div>`).join('')}</div>` : ''}`;
}

/* ── Lo que revisaste antes ────────────────────────────────────────────── */

// Un archivo, no una tarea. La app dejó de llevar la cuenta de lo que queda en
// casa, así que aquí no se empieza nada: se lee lo que se anotó cuando sí se
// llevaba. Quitar la pantalla habría dejado sin abrir unos datos que el usuario
// escribió a mano, y eso es peor que una pantalla de solo lectura.
function renderRevision(ctx) {
  const { state, ui } = ctx;
  const abierta = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse().find(item => item.status === 'draft');
  if (abierta) syncReviewProducts(state, abierta);
  const ultima = lastStockReview(state);
  if (!abierta) {
    return `${volver('Lo que revisaste antes')}
      ${empty('visto', ultima ? `Última revisión: ${niceDate(ultima, { day: 'numeric', month: 'long' })}` : 'No hay revisiones guardadas',
        'Esta pantalla ya no empieza revisiones nuevas: la app dejó de llevar la cuenta de lo que queda en casa. Se conserva para poder leer lo que anotaste en su día.')}
      ${state.reviews.filter(item => item.status === 'confirmed').length ? `<div class="section-head"><h3 class="plan-sub">Revisiones anteriores</h3></div><div class="card">${[...state.reviews].filter(item => item.status === 'confirmed').reverse().slice(0, 8).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(niceDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="list-row-sub">${item.productIds.filter(id => item.consumed[id] !== undefined).length} de ${item.productIds.length} alimentos</div></div>${button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${item.id}"`)}</div>`).join('')}</div>` : ''}`;
  }
  return `${volver('Lo que revisaste antes')}${tablaDeRevision(ctx, abierta)}`;
}

function tablaDeRevision(ctx, revision) {
  const { state, ui } = ctx;
  const disponible = reviewAvailability(state, revision);
  const editando = revision.status === 'draft' || ui.correctingReview;
  const queda = (revision.mode || 'restante') === 'restante';
  if (!revision.productIds.length) {
    return empty('canasta', 'No hay nada que revisar', 'No quedó ninguna cifra anotada de cuando la app llevaba la cuenta de la despensa.');
  }
  // Revisar treinta alimentos de corrido es donde se abandona la revisión. Por
  // eso hay dos salidas: buscar el que se tiene en la mano y esconder los que ya
  // están contestados.
  const filtro = String(ui.mas.revisionFiltro || '').trim().toLocaleLowerCase('es');
  const contestado = id => revision.consumed[id] !== undefined;
  const visibles = revision.productIds.filter(id => {
    if (ui.mas.revisionSoloFaltan && contestado(id)) return false;
    if (!filtro) return true;
    const item = product(state, id);
    return item?.name.toLocaleLowerCase('es').includes(filtro) || (item?.aliases || []).some(alias => String(alias).toLocaleLowerCase('es').includes(filtro));
  });
  const faltan = revision.productIds.filter(id => !contestado(id)).length;

  return `<p class="pantalla-intro">${esc(niceDate(revision.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${queda ? 'Escribe lo que ves en casa. La resta la hacemos nosotros.' : 'Escribe lo que se consumió desde la última vez.'}</p>
    ${editando && revision.status === 'draft' ? bloqueDeAlcance(ctx, revision) : ''}
    ${editando && revision.status === 'draft' ? `<div class="segmented segmented-ancho">
      <button type="button" data-action="review-mode" data-mode="restante" data-id="${revision.id}" class="${queda ? 'active' : ''}">¿Cuánto queda?</button>
      <button type="button" data-action="review-mode" data-mode="consumido" data-id="${revision.id}" class="${queda ? '' : 'active'}">Lo consumido</button>
    </div>` : ''}
    ${editando ? herramientasDeRevision(ctx, revision, faltan, queda) : ''}
    <form data-form="review" data-id="${revision.id}">
      <div class="card revision-lista">${(visibles.length ? visibles : []).map(id => {
        const item = product(state, id);
        const habia = disponible[id] || 0;
        const usado = revision.consumed[id];
        const resto = revision.remaining?.[id];
        const escrito = queda ? resto : usado;
        const derivado = usado === undefined ? null : queda ? usado : Math.max(0, habia - usado);
        return `<div class="revision-fila" data-review-product="${id}" data-available="${habia}" data-mode="${queda ? 'restante' : 'consumido'}">
          <div class="revision-nombre">
            <strong>${esc(item?.name || 'Alimento eliminado')}</strong>
            <span class="small muted">Había ${esc(measure(habia, item?.controlUnit || ''))}${esc(corte(item, habia))}</span>
          </div>
          ${editando
            ? `<input class="text revision-dato" type="number" name="consume-${id}" min="0" ${queda ? '' : `max="${habia}"`} step="any" inputmode="decimal" placeholder="—" value="${escrito === undefined || escrito === null ? '' : escrito}" aria-label="${queda ? `Cuánto queda de ${esc(item?.name || '')}` : `Cuánto se consumió de ${esc(item?.name || '')}`}">`
            : `<span class="revision-dato">${escrito === undefined || escrito === null ? '—' : fmt(escrito)}</span>`}
          <span class="revision-derivado remaining ${derivado === null ? 'pending' : 'good'}">${derivado === null ? 'pendiente' : `${queda ? 'se consumió' : 'queda'} ${fmt(derivado)}`}</span>
        </div>`;
      }).join('') || `<p class="muted">Nada coincide con «${esc(ui.mas.revisionFiltro)}».</p>`}</div>
      ${ocultas(revision, visibles, queda, editando)}
      <p class="small muted">Lo que dejes en blanco queda pendiente y no cambia nada. Escribe <strong>0</strong> si ${queda ? 'no queda nada' : 'no se consumió nada'}.</p>
      <div class="pantalla-acciones">${editando
        ? revision.status === 'draft'
          ? `<button type="submit" name="intent" value="save" class="btn btn-secondary">Guardar y seguir después</button><button type="submit" name="intent" value="confirm" class="btn btn-primary">Terminar</button>`
          : `<button type="submit" name="intent" value="correct" class="btn btn-primary">Guardar la corrección</button>`
        : `<span class="pill">Terminada</span>${button('Corregir', 'toggle-correct-review', 'btn-quiet btn-small')}`}</div>
    </form>
    ${revision.status === 'confirmed' ? loQueSigue(ctx, revision) : ''}`;
}

/* ── De qué se pregunta ────────────────────────────────────────────────────

   Preguntar por los cuarenta alimentos con existencias, incluidos los que nadie
   ha tocado desde marzo, es exactamente donde se abandona una revisión. Se
   empieza por lo de la última compra —que es lo que se está gastando, y lo que
   hay que contar antes de volver al colmado— y la despensa entera queda a un
   toque para quien la quiera. */

function bloqueDeAlcance(ctx, revision) {
  const { state } = ctx;
  const compra = revision.purchaseId ? state.purchases.find(item => item.id === revision.purchaseId) : null;
  if (!compra) return '';
  const deLaCompra = revision.origen === 'compra';
  return `<div class="segmented segmented-ancho">
      <button type="button" data-action="review-scope" data-origen="compra" data-id="${revision.id}" class="${deLaCompra ? 'active' : ''}">Lo de la última compra · ${compra.lines.length}</button>
      <button type="button" data-action="review-scope" data-origen="todo" data-id="${revision.id}" class="${deLaCompra ? '' : 'active'}">Toda la despensa</button>
    </div>
    <p class="small muted">${deLaCompra
      ? `Lo que trajiste el ${esc(niceDate(compra.date, { day: 'numeric', month: 'long' }))}. Es lo que se está gastando.`
      : 'Todo lo que la app tiene contado en casa, se haya comprado cuando se haya comprado.'}</p>`;
}

/* ── Y después de contar, qué ──────────────────────────────────────────────

   Contar lo que queda no es el final de nada: es el paso previo a la compra
   siguiente. Con dos compras al mes, la segunda; con una, la del mes que
   entra. Decirlo aquí evita el viaje de vuelta a buscar dónde estaba. */

function loQueSigue(ctx, revision) {
  const { state } = ctx;
  const mes = revision.date.slice(0, 7);
  const quincenal = frecuenciaDe(state, mes) === 'quincenal';
  const primeraQuincena = Number(revision.date.slice(8)) <= 15;
  const contados = revision.productIds.filter(id => revision.consumed[id] !== undefined).length;
  const texto = quincenal
    ? `La lista de la ${primeraQuincena ? 'primera' : 'segunda'} quincena ya descuenta lo que acabas de contar: no volverá a pedir lo que todavía tienes.`
    : 'La lista del mes que entra ya parte de lo que acabas de contar.';
  return `<div class="notice"><span>→</span><div>
    <strong>Contaste ${contados} alimento(s).</strong>${esc(texto)}
    <div class="inline" style="margin-top:10px">${button(quincenal ? 'Ver la compra de la quincena' : 'Ver la compra', 'navigate', 'btn-secondary btn-small', 'data-page="compra"')}</div>
  </div></div>`;
}

// Filtrar esconde filas, y `saveReview` reconstruye la revisión entera con lo
// que venga en el formulario: una fila que no esté deja de existir y borraría la
// respuesta que ya tenía. Por eso lo escondido sigue viajando, en un campo
// oculto con su valor. Buscar no puede costarle a nadie lo que ya había contado.
function ocultas(revision, visibles, queda, editando) {
  if (!editando) return '';
  const dentro = new Set(visibles);
  return revision.productIds.filter(id => !dentro.has(id)).map(id => {
    const valor = queda ? revision.remaining?.[id] : revision.consumed[id];
    return `<input type="hidden" name="consume-${id}" value="${valor === undefined || valor === null ? '' : valor}">`;
  }).join('');
}

// La barra de herramientas de la revisión: buscar y esconder lo ya contestado.
function herramientasDeRevision(ctx, revision, faltan, queda) {
  const { ui } = ctx;
  return `<div class="revision-herramientas">
    <label class="field revision-buscar"><span class="sr-only">Buscar un alimento de esta revisión</span>
      <input type="search" id="revision-filtro" data-revision-buscar value="${esc(ui.mas.revisionFiltro)}" placeholder="Buscar un alimento…" aria-label="Buscar un alimento de esta revisión">
    </label>
    <div class="inline">
      <button type="button" class="chip ${ui.mas.revisionSoloFaltan ? 'activa' : ''}" data-action="revision-solo-faltan" aria-pressed="${ui.mas.revisionSoloFaltan}">Solo lo que falta · ${faltan}</button>
    </div>
  </div>`;
}

const corte = (item, cantidad) => {
  const estilo = sliceStyle(item?.slice);
  if (!estilo) return '';
  const palabra = estilo.label.toLowerCase();
  return ` ${cantidad > 0 && cantidad <= 1 ? palabra : `${palabra}s`}`;
};

/* ── Historial ─────────────────────────────────────────────────────────── */

/* ── El historial: lo de ahora arriba, lo de antes debajo y con su aviso ───

   Dos historiales viven aquí, y no dicen lo mismo.

   El de ahora son las listas de compra cerradas: qué se apuntó, cuánto se pidió
   de cada cosa y cuánto se trajo. Eso es un recuerdo de una tarde concreta y es
   cierto.

   El de antes son las compras, las revisiones y las correcciones de cuando la
   app llevaba la cuenta de la despensa. Se siguen leyendo enteras —son datos de
   la casa y borrarlos sería tirar su historia— pero sus cantidades salieron de
   una cuenta que ya no se hace y que nadie ha vuelto a comprobar. Enseñarlas sin
   decirlo sería dejar que se lean como el estado de hoy. */

function renderHistorial(ctx) {
  const { state } = ctx;
  const cerradas = listasCerradas(state);
  const eventos = [
    ...state.purchases.map(item => ({ tipo: 'compra', fecha: item.date, seq: item.seq, item })),
    ...state.reviews.filter(item => item.status === 'confirmed').map(item => ({ tipo: 'revision', fecha: item.date, seq: item.seq, item })),
    ...state.corrections.map(item => ({ tipo: 'correccion', fecha: item.date, seq: item.seq, item }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.seq - a.seq);

  if (!cerradas.length && !eventos.length) {
    return `${volver('Historial')}
      ${empty('reloj', 'Todavía no hay nada', 'Aquí aparecerán tus compras: qué llevabas apuntado y qué trajiste de cada cosa.', '')}`;
  }

  return `${volver('Historial')}
    <p class="pantalla-intro">Tus compras, de la más reciente a la más antigua.</p>

    ${cerradas.length ? `<div class="card">${cerradas.slice(0, 40).map(lista => {
      const resumen = resumenDeLista(lista);
      return `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(niceDate(lista.cerradaEl || lista.fecha, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <div class="list-row-sub">${resumen.comprados} de ${resumen.total} cosa(s) traídas${resumen.pendientes ? ` · ${resumen.pendientes} sin conseguir` : ''}</div>
          <div class="list-row-sub small muted">${lista.lineas.slice(0, 6).map(linea => {
            const nombre = linea.productId ? product(state, linea.productId)?.name || 'Alimento eliminado' : linea.texto;
            return `${esc(nombre)}${linea.comprada ? ` (${esc(measure(linea.comprada, linea.unidad || 'unidad'))})` : ''}`;
          }).join(' · ')}${lista.lineas.length > 6 ? ` y ${lista.lineas.length - 6} más` : ''}</div>
        </div>
      </div>`;
    }).join('')}</div>` : '<p class="muted">Todavía no has terminado ninguna compra con la lista nueva.</p>'}

    ${eventos.length ? `<div class="section-head"><div><h3 class="plan-sub">Lo anotado antes</h3></div></div>
      ${notice('Estas cantidades no están comprobadas.',
        'Vienen de cuando la app llevaba la cuenta de lo que había en la casa. Se guardan enteras porque son tu historia, pero <strong>no dicen lo que hay hoy en la despensa</strong>: nadie las ha vuelto a contar, y la app ya no lleva esa cuenta.', 'warn')}
      ${periodosCerrados(ctx)}
      <div class="card">${eventos.slice(0, 60).map(evento => `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${({ compra: 'Compra', revision: 'Revisión', correccion: 'Corrección' })[evento.tipo]} · ${esc(niceDate(evento.fecha, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
          <div class="list-row-sub">${esc(detalleDeEvento(state, evento))}</div>
        </div>
        ${evento.tipo === 'revision' ? button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${evento.item.id}"`) : ''}
      </div>`).join('')}</div>${eventos.length > 60 ? `<p class="small muted">Se muestran los 60 más recientes de ${eventos.length}.</p>` : ''}` : ''}`;
}

function detalleDeEvento(state, evento) {
  if (evento.tipo === 'compra') {
    const nombres = evento.item.lines.slice(0, 5).map(linea => product(state, linea.productId)?.name || '—');
    return `${evento.item.lines.length} alimento(s): ${nombres.join(', ')}${evento.item.lines.length > 5 ? '…' : ''}`;
  }
  if (evento.tipo === 'revision') {
    const revisados = evento.item.productIds.filter(id => evento.item.consumed[id] !== undefined).length;
    return `${revisados} de ${evento.item.productIds.length} alimentos revisados`;
  }
  const item = product(state, evento.item.productId);
  return `${item?.name || '—'}: ${evento.item.delta >= 0 ? '+' : ''}${fmt(evento.item.delta)} ${item?.controlUnit || ''}${evento.item.reason ? ` · ${evento.item.reason}` : ''}`;
}

/* ── Los períodos cerrados ─────────────────────────────────────────────────

   Un historial que se recalcula no es un historial. Antes, la lista de marzo se
   volvía a sumar contra la canasta de hoy cada vez que alguien la miraba: subir
   el arroz en septiembre cambiaba lo que marzo decía haber necesitado, y no
   había forma de saber qué se calculó de verdad aquel día.

   Aquí se enseña la fotografía tal cual se guardó: la canasta que se usó, las
   excepciones de ese mes, la frecuencia que estaba vigente, lo que se compró,
   lo que la casa declaró que le quedaba y la lista final. Con los nombres que
   los alimentos tenían entonces. */

function periodosCerrados(ctx) {
  const { state, ui } = ctx;
  const cierres = [...(state.closedPeriods || [])].sort((a, b) => b.start.localeCompare(a.start));
  if (!cierres.length) return '';
  const abierto = ui.mas.cierreAbierto;
  return `<div class="section-head"><div><h3 class="plan-sub">Períodos cerrados</h3><p class="small muted">Lo que se calculó y se confirmó entonces, tal cual. No se vuelve a sumar: cambiar tu canasta hoy no los toca.</p></div></div>
    <div class="card">${cierres.map(cierre => {
      const esteAbierto = abierto === cierre.id;
      const compradas = cierre.compras.reduce((suma, compra) => suma + compra.lines.length, 0);
      return `<div class="list-row cierre-fila">
        <div class="list-row-main">
          <div class="list-row-title">${esc(etiquetaDeCierre(cierre))}</div>
          <div class="list-row-sub">Cerrado el ${esc(niceDate(cierre.closedAt, { day: 'numeric', month: 'long', year: 'numeric' }))} · compra ${esc(cierre.frecuencia === 'quincenal' ? 'quincenal' : 'mensual')} · calculado desde ${esc(cierre.basis === 'menu' ? 'el menú' : 'la canasta')}</div>
          <div class="list-row-sub">${cierre.lista.length} en la lista · ${compradas} comprado(s) · ${cierre.canasta.length} de canasta · ${cierre.excepciones.length} excepción(es)</div>
        </div>
        ${button(esteAbierto ? 'Cerrar' : 'Ver todo', 'cierre-ver', 'btn-quiet btn-small', `data-id="${esc(cierre.id)}"`)}
      </div>
      ${esteAbierto ? detalleDelCierre(state, cierre) : ''}`;
    }).join('')}</div>`;
}

const etiquetaDeCierre = cierre => ({
  primera: `1.ª quincena de ${monthName(cierre.month)}`,
  segunda: `2.ª quincena de ${monthName(cierre.month)}`,
  mes: monthName(cierre.month)
})[cierre.periodo] || `${niceDate(cierre.start, { day: 'numeric', month: 'short' })} – ${niceDate(cierre.end, { day: 'numeric', month: 'short' })}`;

function detalleDelCierre(state, cierre) {
  const nombre = id => esc(nombreEnElCierre(state, cierre, id));
  const cantidad = (valor, unidad) => (valor === null || valor === undefined ? 'sin cantidad' : esc(measure(valor, unidad)));
  const seccion = (titulo, cuerpo) => `<div class="cierre-seccion"><h4>${esc(titulo)}</h4>${cuerpo}</div>`;
  const filas = lista => `<ul class="food-list">${lista.join('')}</ul>`;

  const existencia = cierre.existencia || { origen: 'calculada', valores: {} };
  const declarados = Object.entries(existencia.valores).filter(([, valor]) => Number(valor) > 0);

  return `<div class="cierre-detalle">
    ${seccion(`La lista final · ${cierre.lista.length}`, cierre.lista.length
      ? filas(cierre.lista.map(linea => `<li>${nombre(linea.productId)}: necesitaba ${cantidad(linea.need, product(state, linea.productId)?.controlUnit || '')}, había ${cantidad(linea.available, product(state, linea.productId)?.controlUnit || '')}${linea.shortfall > 0 ? ` → comprar ${linea.purchaseQuantity === null ? 'cantidad sin medida' : cantidad(linea.purchaseQuantity, linea.purchaseUnit)}` : ' → alcanzaba'}</li>`))
      : '<p class="muted small">La lista salió vacía.</p>')}

    ${seccion(`La canasta que se usó · ${cierre.canasta.length}`, cierre.canasta.length
      ? filas(cierre.canasta.map(linea => `<li>${nombre(linea.productId)}: ${cantidad(linea.quantity, linea.unit)}${linea.source === 'habitual' ? '' : ` <span class="muted">(${linea.source === 'extra' ? 'extra de ese mes' : 'cantidad cambiada ese mes'})</span>`}</li>`))
      : '<p class="muted small">No había canasta escrita.</p>')}

    ${cierre.excepciones.length ? seccion(`Las excepciones de ese mes · ${cierre.excepciones.length}`,
      filas(cierre.excepciones.map(cambio => `<li>${nombre(cambio.productId)}: ${cambio.removed ? 'ese mes no se compró' : cantidad(cambio.quantity, cambio.unit)}</li>`))) : ''}

    ${seccion(`Lo que se compró · ${cierre.compras.length} compra(s)`, cierre.compras.length
      ? cierre.compras.map(compra => `<p class="small"><strong>${esc(niceDate(compra.date, { day: 'numeric', month: 'long' }))}</strong></p>${filas(compra.lines.map(linea => `<li>${nombre(linea.productId)}: ${cantidad(linea.quantity, linea.unit)}</li>`))}`).join('')
      : '<p class="muted small">No se anotó ninguna compra en este período.</p>')}

    ${seccion('Lo que quedaba', declarados.length
      ? `<p class="small muted">${existencia.origen === 'revision'
          ? `Declarado en la revisión del ${esc(niceDate(existencia.fecha, { day: 'numeric', month: 'long' }))}.`
          : 'Nadie lo contó: es el saldo que la app tenía calculado al cerrar.'}</p>
         ${filas(declarados.map(([id, valor]) => `<li>${nombre(id)}: ${cantidad(valor, product(state, id)?.controlUnit || '')}</li>`))}`
      : '<p class="muted small">No quedaba nada anotado.</p>')}

    ${cierre.menu ? seccion(`El menú que lo produjo · ${cierre.menu.length} comida(s)`,
      filas(cierre.menu.slice(0, 20).map(plan => `<li>${esc(niceDate(plan.date, { day: 'numeric', month: 'short' }))} · ${esc(etiquetaDeMomento(plan.slot))}: ${esc(plan.title || 'Sin nombre')}</li>`))
      + (cierre.menu.length > 20 ? `<p class="small muted">Y ${cierre.menu.length - 20} más.</p>` : '')) : ''}

    ${(cierre.sinCantidades || []).length ? seccion('Preparaciones sin cantidades',
      `<p class="small muted">No se pudieron calcular y no sumaron nada a la lista.</p>
       ${filas([...new Set(cierre.sinCantidades.map(item => item.title))].map(titulo => `<li>${esc(titulo)}</li>`))}`) : ''}
  </div>`;
}

/* ── Respaldo ──────────────────────────────────────────────────────────── */

function renderRespaldo(ctx) {
  const { state } = ctx;
  return `${volver('Respaldo')}
    <p class="pantalla-intro">Tus datos viven solo en este teléfono. No hay cuenta, no hay servidor, y ni siquiera la copia automática de Android se los lleva: eso está apagado a propósito. La otra cara es que <strong>si pierdes el teléfono sin una copia, se pierde todo</strong>.</p>
    ${avisoDeCopia(state)}
    <div class="card">
      <h3>Guardar una copia</h3>
      <p class="muted small">Descarga un archivo con todo: alimentos, canasta, preparaciones, compras y revisiones. Guárdalo donde guardes tus cosas importantes —el correo, un pendrive, otra nube—, no en este mismo teléfono.</p>
      ${button('Descargar una copia', 'export', 'btn-primary')}
    </div>
    <div class="card">
      <h3>Traer una copia de vuelta</h3>
      <p class="muted small">Reemplaza todo lo que hay ahora por lo que traiga el archivo. Te preguntamos antes.</p>
      ${button('Traer una copia', 'open-import', 'btn-secondary')}
    </div>
    <div class="card">
      <h3>Empezar de cero</h3>
      <p class="muted small">Borra todo lo de esta app en este teléfono. No se puede deshacer sin una copia guardada.</p>
      ${button('Borrar todos mis datos', 'clear-demo', 'btn-danger')}
    </div>`;
}

// Cuánto hace de la última copia, y si eso ya es preocupante.
//
// El umbral es de treinta días, que es más o menos un ciclo de la app: si pasó
// un mes entero de compras y revisiones sin copia, lo que se perdería ya duele.
// Y no se avisa cuando no hay nada que perder: una casa recién instalada no
// necesita que le riñan por no haber respaldado una lista vacía.
export function estadoDeLaCopia(state) {
  const hayDatos = state.products.length > 0 || state.purchases.length > 0 || habitualLines(state).length > 0;
  if (!hayDatos) return { hayDatos: false };
  const ultima = state.settings?.lastBackupAt || null;
  if (!ultima) return { hayDatos: true, ultima: null, dias: null, urgente: true };
  const dias = Math.round((new Date(`${hoy}T12:00:00`) - new Date(`${ultima}T12:00:00`)) / 86400000);
  return { hayDatos: true, ultima, dias, urgente: dias >= 30 };
}

function avisoDeCopia(state) {
  const copia = estadoDeLaCopia(state);
  if (!copia.hayDatos) return '';
  if (!copia.ultima) {
    return `<div class="notice warn">${icono('aviso')}<div><strong>Todavía no has guardado ninguna copia.</strong>Ahora mismo, todo lo que has escrito existe en un solo sitio: este teléfono.</div></div>`;
  }
  if (copia.urgente) {
    return `<div class="notice warn">${icono('aviso')}<div><strong>La última copia es de hace ${copia.dias} días.</strong>Desde entonces has anotado compras y revisiones que no están en ningún otro lado.</div></div>`;
  }
  return `<div class="notice"><span>✓</span><div><strong>Última copia: ${esc(niceDate(copia.ultima, { day: 'numeric', month: 'long', year: 'numeric' }))}.</strong>${copia.dias === 0 ? 'Hoy mismo.' : `Hace ${copia.dias} ${copia.dias === 1 ? 'día' : 'días'}.`}</div></div>`;
}

/* ── Ajustes ───────────────────────────────────────────────────────────────

   Con «Más» fuera de la barra, esta pantalla es el único índice que queda: todo
   lo que no se usa a diario se entra por aquí. El orden es el de siempre —por
   cuántas veces al año una casa necesita abrir cada cosa—, con la familia
   arriba porque es lo que cambia cuando cambia la casa, y con lo que solo se
   abre cuando algo va mal al final y en voz baja.

   El aviso de la copia vivía en el índice de Más, que ya no existe. Se muda
   aquí entero: es lo único que le recuerda a alguien que hace cuarenta días que
   no guarda una copia, y perderlo sería quedarse sin la única red que hay. */

function renderAjustes(ctx) {
  const { state } = ctx;
  const copia = estadoDeLaCopia(state);
  const enCasa = personasActivas(state).length;
  const deBaja = state.people.length - enCasa;
  return `    ${copia.urgente ? `<div class="notice warn">${icono('aviso')}<div><strong>${copia.ultima ? `Hace ${copia.dias} días que no guardas una copia.` : 'Todavía no has guardado ninguna copia.'}</strong>Todo lo que has escrito existe solo en este teléfono. <button type="button" class="enlace" data-action="navigate" data-page="respaldo">Guardar una ahora</button></div></div>` : ''}
    <div class="card">
      <h3>Familia y restricciones</h3>
      <p class="muted small">Quién vive aquí, qué es de la casa cada quien y qué alimentos debe evitar. Desde aquí se añade gente, se corrige y se da de baja a quien ya no vive contigo.</p>
      <p class="small">${enCasa
        ? `${enCasa} persona(s) en casa${deBaja ? ` · ${deBaja} dada(s) de baja` : ''}.`
        : 'Todavía no hay nadie registrado.'}</p>
      <div class="inline">${button('Editar mi familia', 'navigate', 'btn-secondary btn-small', 'data-page="familia"')}${button('Configuración guiada', 'hogar-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card">
      <h3>Historial</h3>
      <p class="muted small">Tus compras, de la más reciente a la más antigua: qué llevabas apuntado y qué trajiste de cada cosa. Y los períodos que cerraste, tal como se calcularon entonces.</p>
      <p class="small">${listasCerradas(state).length + state.purchases.length} compra(s) guardada(s).</p>
      ${button('Ver el historial', 'navigate', 'btn-secondary btn-small', 'data-page="historial"')}
    </div>
    <div class="card">
      <h3>Respaldo</h3>
      <p class="muted small">Guardar una copia de todo, traer una de vuelta o empezar de cero. Tus datos viven solo en este teléfono, así que la copia es lo único que los salva si lo pierdes.</p>
      <p class="small">${copia.hayDatos
        ? copia.ultima
          ? `Última copia: ${esc(niceDate(copia.ultima, { day: 'numeric', month: 'long', year: 'numeric' }))}.`
          : 'Todavía no has guardado ninguna.'
        : 'Todavía no hay nada que guardar.'}</p>
      ${button('Abrir el respaldo', 'navigate', copia.urgente ? 'btn-primary btn-small' : 'btn-secondary btn-small', 'data-page="respaldo"')}
    </div>
    <div class="card">
      <h3>Mi cuenta</h3>
      <p class="muted small">Entrar, sincronizar tu casa con otro teléfono o cerrar la sesión. Sin cuenta la app funciona igual: la cuenta solo sirve para que tus datos te encuentren en otro aparato.</p>
      ${button('Abrir mi cuenta', 'navigate', 'btn-secondary btn-small', 'data-page="cuenta"')}
    </div>
    <div class="card">
      <h3>Preferencias de la aplicación</h3>
      <p class="muted small">Cada cuánto se hace la compra principal —y cómo se reparte el mes cuando se compra dos veces—, y las herramientas de reparar: medidas de compra, unir dos alimentos que son el mismo, corregir un conteo viejo.</p>
      <p class="small">Compra <strong>${esc(frecuenciaDe(state, hoy.slice(0, 7)) === 'quincenal' ? 'quincenal — dos veces al mes' : 'mensual — una vez al mes')}</strong>.</p>
      <div class="inline">${button('Organización de compra', 'navigate', 'btn-secondary btn-small', 'data-page="organizacion"')}${button('Funciones avanzadas', 'navigate', 'btn-secondary btn-small', 'data-page="avanzado"')}</div>
    </div>
    <div class="card">
      <h3>Cómo funciona</h3>
      <p class="muted small">Un recorrido corto por las cinco secciones y este engranaje, y por la idea de fondo: escribir una vez lo habitual y revisar solo lo diferente. Nada de lo que toques aquí borra tu historial.</p>
      <div class="inline">${button('Ver el recorrido', 'open-tour', 'btn-secondary btn-small')}${button('Organizar mi casa otra vez', 'setup-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card soft">
      <h3>Si algo se rompe</h3>
      <p class="muted small">Lo que se haya roto desde que abriste la aplicación queda apuntado aquí dentro. No sale de este teléfono; sirve para poder explicar un fallo sin tenerlo delante.</p>
      <div class="inline">${button('Detalle de este aparato', 'open-diagnostico', 'btn-quiet btn-small')}${button('Privacidad y condiciones', 'navigate', 'btn-quiet btn-small', 'data-page="legal"')}</div>
    </div>`;
}

/* ── Organización de compra ────────────────────────────────────────────────

   La frecuencia no es un interruptor: es una lista de tramos con fecha de
   vigencia. Cambiarla hoy no puede reescribir lo que pasó en marzo —si en marzo
   se compró una vez al mes, marzo se compró una vez al mes— así que lo único
   que se puede elegir es desde qué mes de aquí en adelante entra en vigencia, y
   lo que se recomienda es el mes siguiente: cambiarla a mitad de mes deja el
   mes en curso partido por la mitad. */

function renderOrganizacion(ctx) {
  const { state, ui } = ctx;
  const mesActual = hoy.slice(0, 7);
  const actual = frecuenciaDe(state, mesActual);
  const historial = historialDeFrecuencia(state);
  const periodos = periodosDelMes(state, mesActual);
  const quincenal = actual === 'quincenal';

  return `${volver('Organización de compra')}
    <p class="pantalla-intro">Cada cuánto se hace la compra principal de la casa. De esto salen los períodos que ves en la pantalla de la compra.</p>

    <div class="card">
      <h3>Frecuencia de compra</h3>
      <p class="small"><strong>${quincenal ? 'Quincenal' : 'Mensual'}</strong> — ${quincenal ? 'dos compras al mes' : 'una compra al mes'} en ${esc(monthName(mesActual))}.</p>
      <p class="small muted">Este mes se parte así: ${periodos.map(periodo => `${esc(periodo.etiqueta)} (${periodo.dias} días)`).join(' · ')}.</p>

      ${historial.length ? `<div class="section-head"><h3 class="plan-sub">Desde cuándo</h3></div>
        <div class="organizacion-historial">${historial.map((fila, indice) => {
          const siguiente = historial[indice + 1];
          const hasta = siguiente ? ` hasta ${esc(monthName(shiftMonth(siguiente.desde, -1)))}` : '';
          return `<div class="list-row"><div class="list-row-main">
            <div class="list-row-title">${fila.tipo === 'quincenal' ? 'Quincenal' : 'Mensual'}</div>
            <div class="list-row-sub">Desde ${esc(monthName(fila.desde))}${hasta}</div>
          </div>${fila.desde > mesActual ? '<span class="pill warm">Aún no empieza</span>' : ''}</div>`;
        }).join('')}</div>` : '<p class="small muted">Nunca se ha cambiado: la app viene con la compra mensual.</p>'}

      ${ui.mas.cambiandoFrecuencia ? formularioDeFrecuencia(ctx, actual, mesActual) : `<div class="inline" style="margin-top:14px">${button('Cambiar la frecuencia', 'frecuencia-abrir', 'btn-secondary')}</div>`}
      <p class="tiny muted">Cambiarla no toca ninguna compra, revisión ni resultado de los meses anteriores: cada mes se queda con la frecuencia que tenía cuando se compró.</p>
    </div>
`;
}

function formularioDeFrecuencia(ctx, actual, mesActual) {
  const { ui } = ctx;
  const recomendado = shiftMonth(mesActual, 1);
  const elegida = ui.mas.frecuenciaNueva || (actual === 'quincenal' ? 'mensual' : 'quincenal');
  const desde = ui.mas.frecuenciaDesde || recomendado;
  // Solo de aquí en adelante. Hacia atrás no se ofrece porque cambiaría meses
  // que ya se compraron, y eso es justamente lo que no puede pasar.
  const meses = [mesActual, ...Array.from({ length: 5 }, (unused, i) => shiftMonth(mesActual, i + 1))];
  const opcion = (id, titulo, detalle) => `<button type="button" class="setup-opcion ${elegida === id ? 'activa' : ''}"
      data-action="frecuencia-tipo" data-frecuencia="${id}" aria-pressed="${elegida === id}">
      <strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></button>`;

  return `<form data-form="frecuencia" class="stack organizacion-form">
    <div class="field"><span>¿Cada cuánto hacen la compra principal en tu hogar?</span>
      <div class="setup-opciones">
        ${opcion('quincenal', 'Quincenal', 'Del 1 al 15 y del 16 al último día del mes.')}
        ${opcion('mensual', 'Mensual', 'Una sola compra para el mes completo.')}
      </div>
      <input type="hidden" name="tipo" value="${esc(elegida)}">
    </div>
    <label class="field"><span>¿Desde qué mes entra en vigencia?</span>
      <select name="desde">${options(meses.map(mes => [mes, `${monthName(mes)}${mes === recomendado ? ' (recomendado)' : ''}${mes === mesActual ? ' — este mes, ya empezado' : ''}`]), desde)}</select>
      <small>Lo anterior a ese mes se queda como está. No se puede cambiar hacia atrás.</small>
    </label>
    <div class="inline">
      <button type="submit" class="btn btn-primary">Guardar el cambio</button>
      ${button('Cancelar', 'frecuencia-cerrar', 'btn-quiet')}
    </div>
  </form>`;
}

// El reparto entre las dos quincenas, el mismo que enseña el recorrido guiado.
// Aquí vive el resto del año, que es cuando de verdad se corrige.

/* ── Privacidad y condiciones ──────────────────────────────────────────── */

// El mismo texto que se publica en la web, viajando dentro de la app.
//
// Google Play exige una dirección pública con el aviso de privacidad, y eso ya
// está en `legal/`. Pero una política que solo se lee con conexión no la lee
// nadie en el momento en que importa, que es cuando alguien se pregunta si esto
// manda sus cosas a algún sitio. Por eso está también aquí.
//
// `src/legal.js` guarda texto plano, sin etiquetas: se pinta con `esc()` y una
// etiqueta que se colara saldría escrita en pantalla en vez de ejecutarse.
const DOCUMENTOS = [['privacidad', 'Privacidad'], ['terminos', 'Condiciones'], ['eliminar', 'Borrar mis datos']];

function renderLegal(ctx) {
  const { ui } = ctx;
  const cual = DOCUMENTOS.some(([id]) => id === ui.mas.documento) ? ui.mas.documento : 'privacidad';
  const doc = LEGAL[cual];
  return `${volver('Privacidad y condiciones')}
    <div class="segmented segmented-ancho">${DOCUMENTOS.map(([id, etiqueta]) =>
      `<button type="button" data-action="legal-ver" data-doc="${id}" class="${cual === id ? 'active' : ''}">${esc(etiqueta)}</button>`).join('')}</div>
    <article class="card documento">
      <h2>${esc(doc.titulo)}</h2>
      <p class="small muted">Última actualización: ${esc(niceDate(LEGAL.actualizado, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      ${doc.secciones.map(seccion => `<h3>${esc(seccion.titulo)}</h3>${seccion.parrafos.map(parrafo => `<p>${esc(parrafo)}</p>`).join('')}`).join('')}
    </article>`;
}

/* ── Funciones avanzadas ───────────────────────────────────────────────── */

// Estas cosas existían ya, repartidas por donde se usan: la medida se pide
// cuando hace falta calcular una compra, la unión cuando se ve el alimento
// duplicado. Eso sigue igual y es lo correcto —se pregunta en el momento, no el
// primer día—. Lo que faltaba era una puerta para quien sabe lo que busca y no
// quiere ir a encontrárselo por casualidad. Se entra desde Ajustes →
// Preferencias de la aplicación.
//
// Archivar y restaurar llegaron aquí al retirarse «Alimentos de la casa».
// Encajan: son las dos únicas cosas que se le pueden hacer a un alimento que ya
// no se compra, se hacen una vez cada muchos meses, y la de restaurar no tenía
// otro sitio donde vivir —un alimento archivado no sale en ninguna lista, así
// que la única forma de volver a verlo es una pantalla que lo enseñe a
// propósito—.
function renderAvanzado(ctx) {
  const { state } = ctx;
  const sinMedida = state.products.filter(item => !item.archived && item.purchaseUnit !== item.controlUnit && !Number.isFinite(item.equivalences?.[item.purchaseUnit]));
  const parecidos = paresParecidos(state);
  const enLaCanasta = new Set(habitualLines(state).map(linea => linea.productId));
  // Primero los que ya no están en los productos habituales: son los que de
  // verdad sobran, y quien entra aquí a archivar viene por uno de ellos.
  const vivos = state.products.filter(item => !item.archived)
    .sort((a, b) => Number(enLaCanasta.has(a.id)) - Number(enLaCanasta.has(b.id)) || a.name.localeCompare(b.name, 'es'));
  const archivados = state.products.filter(item => item.archived).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `${volver('Funciones avanzadas')}
    <p class="pantalla-intro">Nada de esto hace falta para usar la app. Está aquí por si algo no cuadra y quieres arreglarlo a mano.</p>

    <div class="card">
      <h3>Medidas de compra</h3>
      <p class="muted small">Cuando un alimento se cuenta de una forma y se compra de otra —ruedas y paquetes—, hace falta decir cuántas trae cada uno. Sin eso la compra avisa en vez de dar un número inventado.</p>
      ${sinMedida.length
        ? `<div class="card soft">${sinMedida.slice(0, 8).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item.name)}</div><div class="list-row-sub">Se cuenta en ${esc(unitText(item.controlUnit, 2))} y se compra en ${esc(unitText(item.purchaseUnit, 2))}</div></div>${button('Decirlo', 'open-equivalence', 'btn-secondary btn-small', `data-id="${item.id}"`)}</div>`).join('')}</div>
           ${sinMedida.length > 8 ? `<p class="small muted">Y ${sinMedida.length - 8} más.</p>` : ''}`
        : '<p class="small muted">✓ No falta ninguna medida.</p>'}
    </div>

    <div class="card">
      <h3>Alimentos que podrían ser el mismo</h3>
      <p class="muted small">Un alimento anotado dos veces aparece dos veces en la lista de la compra, y parte su historial en dos mitades que no se pueden leer juntas. Unirlos deja una sola ficha con todo. <strong>No se puede deshacer.</strong></p>
      ${parecidos.length
        ? `<div class="card soft">${parecidos.slice(0, 6).map(([uno, otro]) => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(uno.name)} · ${esc(otro.name)}</div><div class="list-row-sub">Los dos se cuentan en ${esc(unitText(uno.controlUnit, 2))}</div></div>${button('Revisar', 'open-merge', 'btn-quiet btn-small', `data-id="${uno.id}"`)}</div>`).join('')}</div>`
        : '<p class="small muted">✓ No encontré parecidos sospechosos.</p>'}
    </div>

    <div class="card">
      <h3>Corregir un conteo viejo</h3>
      <p class="muted small">La app ya no lleva la cuenta de lo que hay en tu despensa. Esto sirve para arreglar una cifra de cuando sí la llevaba, si el historial de entonces te dice algo que no cuadra. Queda anotado con su motivo.</p>
      ${button('Corregir un alimento', 'open-correction', 'btn-secondary')}
    </div>

    <div class="card">
      <h3>Archivar un alimento</h3>
      <p class="muted small">Archivar lo saca de las listas y de las búsquedas sin borrar nada: su historial se conserva entero y se puede reactivar cuando quieras. Es lo que se le hace a un alimento que la casa dejó de comprar, en vez de eliminarlo.</p>
      ${vivos.length
        ? `<p class="small muted">Cada uno abre sus opciones: ahí está «Archivar», y también decir cómo se compra, unirlo con otro o corregir su conteo.</p>
           <div class="card soft">${vivos.map(item => `<div class="list-row">
             <div class="list-row-main">
               <div class="list-row-title">${esc(item.name)}</div>
               <div class="list-row-sub">${enLaCanasta.has(item.id) ? 'Está en tus productos habituales' : 'Ya no está en tus productos habituales'}</div>
             </div>
             ${button('Opciones', 'open-avanzado-producto', 'btn-quiet btn-small', `data-id="${item.id}" aria-label="Opciones de ${esc(item.name)}"`)}
           </div>`).join('')}</div>`
        : '<p class="small muted">Todavía no hay ningún alimento registrado.</p>'}
    </div>

    <div class="card">
      <h3>Alimentos archivados</h3>
      <p class="muted small">Siguen enteros —con su historial y sus cantidades— pero no salen en ninguna lista. Reactivar uno lo devuelve tal como estaba.</p>
      ${archivados.length
        ? `<div class="card soft">${archivados.map(item => `<div class="list-row archived">
             <div class="list-row-main"><div class="list-row-title">${esc(item.name)}</div></div>
             ${button('Reactivar', 'restore-product', 'btn-secondary btn-small', `data-id="${item.id}"`)}
           </div>`).join('')}</div>`
        : '<p class="small muted">No hay ninguno archivado.</p>'}
    </div>

    <div class="card">
      <h3>Servicios externos</h3>
      <p class="muted small">Sin cuenta, esta app no llama a ninguna parte: no hay dirección que configurar ni clave que guardar. Con cuenta, lo único que sale de aquí son tus datos hacia el servidor que los guarda para que los encuentres en otro teléfono.</p>
      ${button('Ver el detalle de este aparato', 'open-diagnostico', 'btn-quiet')}
    </div>`;
}

// Dos alimentos que se cuentan igual y cuyos nombres se parecen mucho. Solo se
// proponen; unirlos siempre lo decide una persona.
function paresParecidos(state) {
  const vivos = state.products.filter(item => !item.archived);
  const pares = [], vistos = new Set();
  for (const item of vivos) {
    if (vistos.has(item.id)) continue;
    const parecido = findSimilarProducts(state, item.name, { limit: 1, threshold: 0.78, exclude: item.id })[0];
    if (!parecido || parecido.product.controlUnit !== item.controlUnit || vistos.has(parecido.product.id)) continue;
    vistos.add(item.id); vistos.add(parecido.product.id);
    pares.push([item, parecido.product]);
  }
  return pares;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const MAS_ACTIONS = {
  'cierre-ver': (el, ctx) => { ctx.ui.mas.cierreAbierto = ctx.ui.mas.cierreAbierto === el.dataset.id ? '' : el.dataset.id; ctx.render(); },
  'revision-solo-faltan': (el, ctx) => { ctx.ui.mas.revisionSoloFaltan = !ctx.ui.mas.revisionSoloFaltan; ctx.render(); },
  'legal-ver': (el, ctx) => { ctx.ui.mas.documento = el.dataset.doc; ctx.render(); },
  'open-avanzado-producto': (el, ctx) => ctx.openModal('avanzado-producto', { id: el.dataset.id }),
  'open-diagnostico': (el, ctx) => ctx.openModal('diagnostico'),
  'receta-plegar': (el, ctx) => {
    const plegadas = new Set(ctx.ui.mas.recetasPlegadas || []);
    const momento = el.dataset.momento;
    if (plegadas.has(momento)) plegadas.delete(momento); else plegadas.add(momento);
    ctx.ui.mas.recetasPlegadas = [...plegadas];
    ctx.render();
  },
  'receta-limpiar': (el, ctx) => { ctx.ui.mas.recetaFiltro = ''; ctx.render(); },
  'frecuencia-abrir': (el, ctx) => {
    Object.assign(ctx.ui.mas, { cambiandoFrecuencia: true, frecuenciaNueva: '', frecuenciaDesde: '' });
    ctx.render();
  },
  'frecuencia-cerrar': (el, ctx) => {
    Object.assign(ctx.ui.mas, { cambiandoFrecuencia: false, frecuenciaNueva: '', frecuenciaDesde: '' });
    ctx.render();
  },
  'frecuencia-tipo': (el, ctx) => {
    if (!FRECUENCIAS.includes(el.dataset.frecuencia)) return;
    // Lo que ya estuviera elegido en el desplegable no se pierde al cambiar de
    // botón: se lee de la pantalla antes de redibujar.
    ctx.ui.mas.frecuenciaDesde = document.querySelector('[data-form="frecuencia"] [name="desde"]')?.value || ctx.ui.mas.frecuenciaDesde;
    ctx.ui.mas.frecuenciaNueva = el.dataset.frecuencia;
    ctx.render();
  },
  'archive-product': (el, ctx) => { archiveProduct(ctx.state, el.dataset.id); ctx.closeModal(); ctx.commit('Alimento archivado. Su historial se conserva.'); },
  'restore-product': (el, ctx) => { restoreProduct(ctx.state, el.dataset.id); ctx.commit('Alimento disponible otra vez.'); }
};
