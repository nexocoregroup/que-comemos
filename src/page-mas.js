// «Más»: todo lo que existe pero no se usa a diario.
//
// La navegación tenía siete destinos y cuatro de ellos —Productos y datos,
// Personas, Preparaciones, Revisión— competían de tú a tú con la pantalla de
// hoy. Ninguna casa abre la app para editar una ficha de producto; se abre para
// saber qué se cocina y qué falta comprar.
//
// Nada se ha eliminado: todo sigue aquí, a un toque, ordenado por la frecuencia
// real con que hace falta. Lo que cambia es que ya no estorba.

import { CATEGORIES } from './catalog-seed.js';
import {
  FRECUENCIAS, MOMENTOS, UNITS, archiveProduct, cierresDe, etiquetaDeMomento, effectiveBasket, esActiva, findSimilarProducts, frecuenciaDe,
  nombreEnElCierre, ultimaCompra,
  corregirHaciaAtras, habitualLines, historialDeFrecuencia, inventoryNow, lastStockReview, monthBasketSummary, monthChanges,
  periodosDelMes, personasActivas, product, productByName, restoreProduct, restriccionesDe,
  reviewAvailability, sliceStyle, syncReviewProducts, todayISO
} from './model.js';
import { filaDeReparto } from './setup.js';
import { claseDe, hogarDe, resumenDeRestricciones } from './hogar.js';
import { WEEKDAY_LABELS, WEEKDAYS } from './routines.js';
import { button, cap, empty, esc, fmt, measure, monthName, niceDate, notice, options, shiftMonth, unitText } from './ui-kit.js';
import { icono, iconoDeCategoria } from './icons.js';
import { avisoDeVoz, capacidad, comprobarDictado } from './device.js';
import { panelDeVoz } from './voz.js';
// El intérprete de frases vive en el asistente, y entiende «quedan dos plátanos,
// diez huevos y media libra de queso» desde hace tiempo. Escribir aquí un
// segundo intérprete sería tener dos gramáticas que se van separando con los
// meses; se reutiliza esa, que además ya está probada.
import { interpretar } from './chat-ui.js';
import { LEGAL } from './legal.js';

const hoy = todayISO();

/* ── El índice de Más ──────────────────────────────────────────────────────

   Eran diez filas seguidas, todas iguales, sin una sola separación. Una lista
   de diez sin jerarquía se lee como un armario sin baldas: para encontrar algo
   hay que mirarlo entero, y la décima vez que alguien busca «revisar lo que
   queda» sigue recorriéndola desde arriba.

   Ahora son tres grupos con un rótulo cada uno y, debajo, Ajustes solo. El
   orden dentro de cada grupo sigue siendo el de siempre: por cuántas veces al
   año una casa necesita abrir cada cosa.

   Lo único que se movió de sitio es «Funciones avanzadas» —medidas, uniones,
   correcciones— que ahora se entra desde Ajustes. No se ha quitado nada: son
   pantallas que se usan una vez cada muchos meses y que estaban compitiendo en
   la misma lista con la canasta, que se toca todas las semanas. */

export const GRUPOS_MAS = [
  ['Lo de cada semana', [
    ['canasta', 'canasta', 'Mi canasta habitual', 'Lo que se compra todos los meses'],
    ['preparaciones', 'libro', 'Preparaciones', 'Las comidas que se repiten en casa'],
    ['revision', 'visto', 'Revisar lo que queda', 'Un repaso a la nevera y la despensa']
  ]],
  ['Mi casa', [
    ['familia', 'personas', 'Familia y restricciones', 'Quién come y qué evita cada quien'],
    ['alimentos', 'hoja', 'Alimentos de la casa', 'La ficha de cada uno: medidas y existencias']
  ]],
  ['Mis datos', [
    ['historial', 'reloj', 'Historial', 'Compras, revisiones y correcciones'],
    ['respaldo', 'descargar', 'Respaldo', 'Guardar una copia o traerla de vuelta'],
    ['cuenta', 'persona', 'Mi cuenta', 'Entrar, sincronizar o cerrar sesión']
  ]],
  ['', [
    ['ajustes', 'ajustes', 'Ajustes', 'Compra, micrófono, funciones avanzadas y ayuda']
  ]]
];

// La lista plana sigue existiendo porque de ella salen las rutas y los títulos.
// «avanzado» no está en ningún grupo —se entra desde Ajustes— pero es una
// página de Más como las demás.
export const ENTRADAS_MAS = [
  ...GRUPOS_MAS.flatMap(([, filas]) => filas),
  ['avanzado', 'chip', 'Funciones avanzadas', 'Medidas, correcciones y uniones']
];

// «legal» no sale en el índice —se llega desde Ajustes— pero es una página de
// Más como las otras: necesita el mismo enrutado y el mismo botón de volver.
// «cuenta» sale en el índice de Más, pero no la pinta este archivo: la pintan
// las pantallas de `page-cuenta.js`, que necesitan cosas —la sesión, el cajón
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
    canastaVista: 'habitual', canastaMes: hoy.slice(0, 7), filtroAlimento: '', verArchivados: false,
    // Lo que se acaba de guardar sobre algo que ya venía de antes, para poder
    // ofrecer una vez el «estaba mal escrito». Se vacía al salir de la pantalla.
    corregibles: [],
    revisionFiltro: '', revisionSoloFaltan: false, revisionAviso: '',
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
  const pagina = ui.page === 'mas' ? 'inicio' : ui.page;
  const vistas = {
    inicio: renderInicio,
    canasta: renderCanasta,
    preparaciones: renderPreparaciones,
    familia: renderFamilia,
    revision: renderRevision,
    alimentos: renderAlimentos,
    historial: renderHistorial,
    respaldo: renderRespaldo,
    ajustes: renderAjustes,
    organizacion: renderOrganizacion,
    avanzado: renderAvanzado,
    legal: renderLegal
  };
  return (vistas[pagina] || renderInicio)(ctx);
}

function volver(titulo) {
  return `<div class="mas-volver">${button('‹ Más', 'navigate', 'btn-quiet btn-small', 'data-page="mas"')}<h2>${esc(titulo)}</h2></div>`;
}

/* ── El índice ─────────────────────────────────────────────────────────── */

function renderInicio(ctx) {
  const { state } = ctx;
  // «12 alimento(s)» y, en preparaciones, un «7» a secas. El paréntesis es una
  // forma de no decidir el plural, y un número solo no dice de qué. Al borde de
  // la fila casi no se leían; desde que la pista baja a su propia línea en el
  // teléfono son una frase corta que alguien lee, y una frase corta se escribe
  // entera.
  const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
  const pistas = {
    canasta: cuenta(habitualLines(state).length, 'alimento', 'alimentos'),
    preparaciones: cuenta(state.recipes.length, 'preparación', 'preparaciones'),
    familia: cuenta(personasActivas(state).length, 'persona', 'personas'),
    alimentos: cuenta(state.products.filter(item => !item.archived).length, 'alimento', 'alimentos'),
    revision: lastStockReview(state) ? `última: ${niceDate(lastStockReview(state), { day: 'numeric', month: 'short' })}` : 'nunca',
    historial: cuenta(state.purchases.length, 'compra', 'compras'),
    respaldo: pistaDeCopia(state),
    ajustes: ''
  };
  const copia = estadoDeLaCopia(state);
  const fila = ([id, dibujo, titulo, detalle]) => `
    <button type="button" class="mas-item" data-action="navigate" data-page="${id}">
      <span class="mas-icono">${icono(dibujo, { tamano: 22 })}</span>
      <span class="mas-texto"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span>
      ${pistas[id] ? `<span class="mas-pista ${id === 'respaldo' && copia.urgente ? 'alerta' : ''}">${esc(pistas[id])}</span>` : ''}
      <span class="mas-flecha">${icono('derecha', { tamano: 17 })}</span>
    </button>`;
  return `${copia.urgente ? `<div class="notice warn">${icono('aviso')}<div><strong>${copia.ultima ? `Hace ${copia.dias} días que no guardas una copia.` : 'Todavía no has guardado ninguna copia.'}</strong>Todo lo que has escrito existe solo en este teléfono. <button type="button" class="enlace" data-action="navigate" data-page="respaldo">Guardar una ahora</button></div></div>` : ''}
    ${GRUPOS_MAS.map(([rotulo, filas]) => `${rotulo ? `<h3 class="mas-grupo">${esc(rotulo)}</h3>` : ''}<div class="card mas-lista">${filas.map(fila).join('')}</div>`).join('')}
    <div class="card soft mas-pie">
      <h3>¿Cómo funciona?</h3>
      <p class="muted small">Lo habitual se escribe una vez. Cada mes empieza ya preparado y tú solo revisas lo diferente. Si algo no te cuadra, nada de lo que toques aquí borra tu historial.</p>
      <div class="inline">${button('Organizar mi casa', 'setup-open', 'btn-secondary btn-small')}${button('Ver el recorrido', 'open-tour', 'btn-quiet btn-small')}</div>
    </div>`;
}

/* ── Mi canasta habitual ───────────────────────────────────────────────── */

// Una sola canasta a la vista. Lo que antes eran «canasta base» y «canasta
// mensual» —dos conceptos que había que aprender— son ahora la lista y sus
// excepciones, que es como lo piensa cualquiera: «lo de siempre» y «este mes,
// además, cangrejo».
function renderCanasta(ctx) {
  const { state, ui } = ctx;
  const mes = ui.mas.canastaMes;
  const resumen = monthBasketSummary(state, mes);
  const cambios = resumen.cambiados + resumen.quitados + resumen.extras;
  const enCambios = ui.mas.canastaVista === 'cambios';
  return `${volver('Mi canasta habitual')}
    <div class="segmented segmented-ancho">
      <button type="button" data-action="canasta-vista" data-vista="habitual" class="${enCambios ? '' : 'active'}">Lo de siempre</button>
      <button type="button" data-action="canasta-vista" data-vista="cambios" class="${enCambios ? 'active' : ''}">Cambios de este mes${cambios ? ` · ${cambios}` : ''}</button>
    </div>
    ${enCambios ? vistaCambios(ctx, mes, resumen) : vistaHabitual(ctx)}`;
}

function vistaHabitual(ctx) {
  const { state } = ctx;
  const lineas = habitualLines(state);
  if (!lineas.length) {
    return empty('canasta', 'Todavía no has escrito tu canasta',
      'Es la lista de lo que se compra en tu casa todos los meses: los plátanos, el arroz, los huevos, el salami. Se escribe una vez y vale para siempre; después solo cambias lo diferente de cada mes.',
      `${button('Marcarla de una lista', 'setup-open', 'btn-primary')}${button(`${icono('microfono', { tamano: 17 })}Dictarla de corrido`, 'open-bulk', 'btn-secondary', 'data-destino="habitual"')}`);
  }
  const porCategoria = new Map();
  for (const linea of lineas) {
    const item = product(state, linea.productId);
    const categoria = item?.category || 'otros';
    if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
    porCategoria.get(categoria).push({ linea, item });
  }
  return `<p class="pantalla-intro">Lo que tu casa consume en un mes corriente. Lo que <strong>añadas o corrijas</strong> aquí empieza a contar desde este mes: los que ya pasaron se quedan con lo que se compró entonces.</p>
    <p class="tiny muted">Para cambiar un mes solo, entra en «Cambios de este mes».</p>
    ${avisoDeCorreccion(ctx)}
    <form data-form="canasta-habitual" class="canasta-form">
      ${[...porCategoria.entries()].sort((a, b) => etiquetaCategoria(a[0]).localeCompare(etiquetaCategoria(b[0]), 'es')).map(([categoria, filas]) => `
        <h3 class="canasta-grupo">${esc(etiquetaCategoria(categoria))}</h3>
        <div class="card canasta-card">${filas.sort((a, b) => a.item.name.localeCompare(b.item.name, 'es')).map(({ linea, item }) => `
          <div class="canasta-fila">
            <label class="canasta-nombre" for="cant-${linea.productId}">${esc(item.name)}</label>
            <input id="cant-${linea.productId}" class="text canasta-cantidad" type="number" min="0" step="any" inputmode="decimal"
                   name="cantidad-${linea.productId}" value="${linea.quantity ?? ''}" placeholder="—" aria-label="Cantidad al mes de ${esc(item.name)}">
            <select class="text canasta-unidad" name="unidad-${linea.productId}" aria-label="Unidad de ${esc(item.name)}">${options(UNITS.map(unidad => [unidad, unidad]), linea.unit)}</select>
            <button type="button" class="btn btn-quiet btn-small" data-action="canasta-quitar" data-id="${linea.productId}" aria-label="Quitar ${esc(item.name)} de la canasta">✕</button>
            ${historiaDeLaLinea(linea)}
          </div>`).join('')}</div>`).join('')}
      <p class="small muted">Deja una cantidad en blanco si todavía no la sabes: el alimento sigue en la lista y la compra lo avisará.</p>
      <div class="pantalla-acciones">
        ${button('+ Añadir alimento', 'open-product', 'btn-secondary')}
        ${button(`${icono('microfono', { tamano: 17 })}Añadir varios de corrido`, 'open-bulk', 'btn-quiet', 'data-destino="habitual"')}
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`;
}

// Lo que hace falta saber de una línea que ha tenido más de una cantidad. Solo
// se dice cuando hay algo que decir: poner «desde septiembre» debajo de los
// treinta alimentos de una casa sería convertir un dato útil en decoración.
function historiaDeLaLinea(linea) {
  // `monthName` capitaliza porque casi siempre es un rótulo suelto. Aquí el mes
  // va dentro de una frase, y en español ahí se escribe en minúscula.
  const mes = valor => esc(monthName(valor).toLocaleLowerCase('es'));
  const trozos = [];
  if (linea.vigenteDesde && linea.tramos.length > 1) trozos.push(`desde ${mes(linea.vigenteDesde)}`);
  if (linea.proximo) {
    trozos.push(linea.proximo.fuera
      ? `se quita en ${mes(linea.proximo.desde)}`
      : `${esc(measure(linea.proximo.quantity, linea.proximo.unit))} desde ${mes(linea.proximo.desde)}`);
  }
  return trozos.length ? `<p class="canasta-historia tiny muted">${trozos.join(' · ')}</p>` : '';
}

// El escape, y solo cuando puede hacer falta: justo después de guardar un
// cambio sobre algo que ya venía de antes.
//
// Las dos intenciones se parecen y no son la misma. «Ahora comemos más arroz»
// vale desde este mes, que es lo que la app hace sola. «Lo escribí mal» tiene
// que alcanzar hacia atrás. Preguntarlo siempre sería un toque de más en la
// tarea más repetida de la pantalla; no ofrecerlo nunca dejaría un dato malo
// enterrado para siempre. Se ofrece una vez, cuando acaba de pasar.
function avisoDeCorreccion(ctx) {
  const { state, ui } = ctx;
  const ids = (ui.mas.corregibles || []).filter(id => product(state, id));
  if (!ids.length) return '';
  const nombres = ids.map(id => product(state, id).name).join(', ');
  return notice('Guardado desde este mes',
    `${esc(nombres)}: los meses que ya pasaron se quedan con la cantidad que tenían.
     ${ids.length === 1 ? '¿Estaba mal escrita?' : '¿Estaban mal escritas?'}
     <button type="button" class="enlace" data-action="canasta-corregir-atras">Corregir también los meses anteriores</button>`);
}

const etiquetaCategoria = id => CATEGORIES.find(cat => cat.id === id)?.label || 'Otros';

// La pista que va al lado de «Respaldo» en el índice de Más.
function pistaDeCopia(state) {
  const copia = estadoDeLaCopia(state);
  if (!copia.hayDatos) return '';
  if (!copia.ultima) return 'sin copia';
  if (copia.dias === 0) return 'hoy';
  return `hace ${copia.dias} ${copia.dias === 1 ? 'día' : 'días'}`;
}

function vistaCambios(ctx, mes, resumen) {
  const { state } = ctx;
  const lineas = effectiveBasket(state, mes);
  const cambiadas = lineas.filter(linea => linea.source !== 'habitual');
  const quitadas = (monthChanges(state, mes)?.changes || []).filter(cambio => cambio.removed);
  return `<div class="toolbar">
      <div class="inline">
        ${button('‹', 'canasta-mes', 'btn-secondary btn-small', 'data-delta="-1" aria-label="Mes anterior"')}
        <div class="strong plan-mes-nombre">${esc(monthName(mes))}</div>
        ${button('›', 'canasta-mes', 'btn-secondary btn-small', 'data-delta="1" aria-label="Mes siguiente"')}
      </div>
    </div>
    <p class="pantalla-intro">Lo que este mes será diferente. <strong>No toca los demás meses</strong> ni cambia tu costumbre.</p>
    ${cambiadas.length || quitadas.length ? `<div class="card">
      ${cambiadas.map(linea => `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(product(state, linea.productId)?.name || 'Alimento eliminado')} <span class="pill warm">${linea.source === 'extra' ? `extra de ${esc(monthName(mes).split(' ')[0])}` : 'otra cantidad'}</span></div>
          <div class="list-row-sub">${linea.quantity === null ? 'cantidad pendiente' : esc(measure(linea.quantity, linea.unit))} este mes</div>
        </div>
        <div class="inline">
          ${button('Añadir a mi canasta base', 'canasta-promover', 'btn-secondary btn-small', `data-id="${linea.productId}" data-month="${mes}"`)}
          ${button('Quitar', 'canasta-quitar-cambio', 'btn-quiet btn-small', `data-id="${linea.productId}" data-month="${mes}"`)}
        </div>
      </div>`).join('')}
      ${quitadas.map(cambio => `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(product(state, cambio.productId)?.name || 'Alimento eliminado')} <span class="pill gray">este mes no</span></div>
          <div class="list-row-sub">Sigue en tu canasta habitual; solo este mes no se compra.</div>
        </div>
        ${button('Volver a comprarlo', 'canasta-quitar-cambio', 'btn-quiet btn-small', `data-id="${cambio.productId}" data-month="${mes}"`)}
      </div>`).join('')}
    </div>
    <p class="small muted">«Añadir a mi canasta base» lo pasa a lo de todos los meses, y te pregunta <strong>desde qué mes</strong> entra en vigencia. Los meses anteriores a esa fecha no se tocan: seguirán diciendo lo que dijeron.</p>
    <p class="tiny muted">Un período que hayas cerrado tampoco cambia, porque no se vuelve a calcular: se lee la fotografía que se guardó al cerrarlo. Los meses abiertos sí se recalculan con tu canasta de hoy, que es lo que se quiere mientras todavía no han pasado.</p>`
    : empty('visto', `${monthName(mes)} es un mes normal`, 'No hay nada diferente. Si este mes van a comprar algo especial —un cangrejo para una cena, o menos arroz porque estarán de viaje—, anótalo aquí.', '')}
    <div class="pantalla-acciones">
      ${button('+ Añadir algo solo para este mes', 'canasta-nuevo-cambio', 'btn-primary', `data-month="${mes}"`)}
      ${button(`${icono('microfono', { tamano: 17 })}Dictar varios`, 'open-bulk', 'btn-quiet', `data-destino="mes" data-month="${mes}"`)}
    </div>`;
}

/* ── Preparaciones ─────────────────────────────────────────────────────── */

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
    return `${volver('Preparaciones')}
      ${empty('libro', 'Todavía no hay ninguna',
        'Una preparación es algo como «mangú con salami» o «arroz con pollo»: el nombre, en cuáles momentos suele comerse y, si quieres, los alimentos principales. No hace falta anotar la sal ni el aceite.',
        button('Crear la primera', 'open-recipe', 'btn-primary'))}`;
  }

  return `${volver('Preparaciones')}
    <p class="pantalla-intro">Comidas que se repiten en tu casa. Se guardan una vez y después se ponen en el calendario de golpe, eligiendo los días de la semana.</p>
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

function tarjetaDeReceta(state, receta) {
  const momentos = (receta.uses || []).map(id => MOMENTOS.find(item => item.id === id)?.etiqueta || id);
  return `<article class="card receta-tarjeta">
    <div class="between"><h3>${esc(receta.name)}</h3>${receta.servings ? `<span class="pill gray">${fmt(receta.servings)} porciones</span>` : ''}</div>
    <p class="small muted">${momentos.map(texto => `<span class="pill warm">${esc(texto)}</span>`).join(' ')}</p>
    ${receta.items.length
      ? `<ul class="food-list">${receta.items.map(item => `<li>${esc(measure(item.quantity, item.unit))} · ${esc(product(state, item.productId)?.name || '—')}</li>`).join('')}</ul>`
      : '<p class="small muted receta-incompleta">Sin alimentos anotados. Sirve igual para el calendario; lo que no puede todavía es aportar a la compra.</p>'}
    ${receta.note ? `<p class="small"><strong>Para quien cocina:</strong> ${esc(receta.note)}</p>` : ''}
    <div class="inline">
      ${button('Ponerla en el calendario', 'mes-nueva-rutina', 'btn-secondary btn-small', `data-receta="${receta.id}"`)}
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
    ${persona.habitual?.length ? `<p class="small" style="margin-top:12px"><strong>Come normalmente:</strong> ${persona.habitual.map(item => `${esc(measure(item.quantity, item.unit))} de ${esc(nombreProducto(item.productId))}`).join(' · ')}</p>` : ''}
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

/* ── Revisar lo que queda ──────────────────────────────────────────────── */

// «¿Cuánto queda?» en vez de «¿cuánto se consumió?». La diferencia parece
// pequeña y no lo es: lo primero se contesta abriendo la nevera y mirando; lo
// segundo obliga a recordar toda la semana y a restar de cabeza.
function renderRevision(ctx) {
  const { state, ui } = ctx;
  const abierta = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse().find(item => item.status === 'draft');
  if (abierta) syncReviewProducts(state, abierta);
  const ultima = lastStockReview(state);
  if (!abierta) {
    return `${volver('Revisar lo que queda')}
      ${empty('visto', ultima ? `Última revisión: ${niceDate(ultima, { day: 'numeric', month: 'long' })}` : 'Todavía no has revisado nada',
        'Abre la nevera y la despensa y escribe lo que ves. La app calcula sola lo que se consumió y afina la lista de la compra.',
        button('Empezar una revisión', 'open-new-review', 'btn-primary'))}
      ${state.reviews.filter(item => item.status === 'confirmed').length ? `<div class="section-head"><h3 class="plan-sub">Revisiones anteriores</h3></div><div class="card">${[...state.reviews].filter(item => item.status === 'confirmed').reverse().slice(0, 8).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(niceDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="list-row-sub">${item.productIds.filter(id => item.consumed[id] !== undefined).length} de ${item.productIds.length} alimentos</div></div>${button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${item.id}"`)}</div>`).join('')}</div>` : ''}`;
  }
  return `${volver('Revisar lo que queda')}${tablaDeRevision(ctx, abierta)}`;
}

function tablaDeRevision(ctx, revision) {
  const { state, ui } = ctx;
  const disponible = reviewAvailability(state, revision);
  const editando = revision.status === 'draft' || ui.correctingReview;
  const queda = (revision.mode || 'restante') === 'restante';
  if (!revision.productIds.length) {
    return empty('canasta', 'No hay nada que revisar', 'Todavía no hay alimentos con existencias anotadas. Anota una compra primero.', button('Ir a la compra', 'navigate', 'btn-secondary', 'data-page="compra"'));
  }
  // Revisar treinta alimentos de corrido es donde se abandona la revisión. Por
  // eso hay tres salidas: buscar el que se tiene en la mano, esconder los que ya
  // están contestados, y dictar varios de un tirón.
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

// La barra de herramientas de la revisión: buscar, esconder lo ya contestado y
// dictar varios de corrido.
function herramientasDeRevision(ctx, revision, faltan, queda) {
  const { ui } = ctx;
  const motor = capacidad('dictar');
  return `<div class="revision-herramientas">
    <label class="field revision-buscar"><span class="sr-only">Buscar un alimento de esta revisión</span>
      <input type="search" id="revision-filtro" data-revision-buscar value="${esc(ui.mas.revisionFiltro)}" placeholder="Buscar un alimento…" aria-label="Buscar un alimento de esta revisión">
    </label>
    <div class="inline">
      <button type="button" class="chip ${ui.mas.revisionSoloFaltan ? 'activa' : ''}" data-action="revision-solo-faltan" aria-pressed="${ui.mas.revisionSoloFaltan}">Solo lo que falta · ${faltan}</button>
      ${motor.ok ? `<button type="button" class="btn btn-secondary btn-small" data-action="voz-abrir" data-destino="revision" aria-label="Dictar o escribir lo que queda">${icono('microfono', { tamano: 17 })}Dictar</button>` : ''}
    </div>
    ${panelDeVoz(ctx, 'revision')}
    ${ui.mas.revisionAviso ? `<p class="small revision-aviso">${esc(ui.mas.revisionAviso)}</p>` : ''}
  </div>`;
}

const corte = (item, cantidad) => {
  const estilo = sliceStyle(item?.slice);
  if (!estilo) return '';
  const palabra = estilo.label.toLowerCase();
  return ` ${cantidad > 0 && cantidad <= 1 ? palabra : `${palabra}s`}`;
};

/* ── Alimentos de la casa ──────────────────────────────────────────────── */

function renderAlimentos(ctx) {
  const { state, ui } = ctx;
  const filtro = String(ui.mas.filtroAlimento || '').trim().toLocaleLowerCase('es');
  const existencias = inventoryNow(state);
  const visibles = state.products
    .filter(item => ui.mas.verArchivados || !item.archived)
    .filter(item => !filtro || item.name.toLocaleLowerCase('es').includes(filtro) || (item.aliases || []).some(alias => String(alias).toLocaleLowerCase('es').includes(filtro)))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'es'));
  const archivados = state.products.filter(item => item.archived).length;
  return `${volver('Alimentos de la casa')}
    <p class="pantalla-intro">La ficha de cada alimento: cómo se cuenta, cómo se compra y cuánto hay. Normalmente no hace falta entrar aquí; la app rellena esto sola cuando marcas o dictas alimentos.</p>
    <div class="pantalla-acciones">${button('+ Añadir alimento', 'open-product', 'btn-primary')}${button(`${icono('microfono', { tamano: 17 })}Dictar varios`, 'open-bulk', 'btn-secondary')}</div>
    ${state.products.length ? `<div class="toolbar">
      <label class="field" style="flex:1"><span class="sr-only">Buscar</span><input type="search" id="alimento-filtro" value="${esc(ui.mas.filtroAlimento)}" placeholder="Buscar entre ${state.products.length} alimentos…" aria-label="Buscar un alimento"></label>
      ${archivados ? button(ui.mas.verArchivados ? 'Ocultar archivados' : `Ver ${archivados} archivados`, 'alimentos-archivados', 'btn-quiet btn-small') : ''}
    </div>
    <div class="card">${visibles.map(item => filaDeAlimento(state, item, existencias)).join('') || '<p class="muted">Nada coincide con esa búsqueda.</p>'}</div>`
      : empty('hoja', 'Todavía no hay alimentos', 'Lo más rápido es marcarlos de una lista: se registran solos, con su categoría y su unidad.', `${button('Marcarlos de una lista', 'setup-open', 'btn-primary')}${button('Añadir uno a mano', 'open-product', 'btn-secondary')}`)}`;
}

function filaDeAlimento(state, item, existencias) {
  const linea = habitualLines(state).find(row => row.productId === item.id);
  const equivalencias = Object.entries(item.equivalences || {});
  const categoria = CATEGORIES.find(cat => cat.id === item.category);
  const hay = existencias[item.id] || 0;
  return `<div class="list-row ${item.archived ? 'archived' : ''}">
    <div class="list-row-main">
      <div class="list-row-title">${esc(item.name)} ${item.archived ? '<span class="pill gray">archivado</span>' : linea ? `<span class="pill">${linea.quantity === null ? 'cantidad pendiente' : `${esc(measure(linea.quantity, linea.unit))} al mes`}</span>` : '<span class="pill gray">no está en la canasta</span>'}</div>
      <div class="list-row-sub">${categoria ? `${iconoDeCategoria(categoria.id, { tamano: 15, clase: 'ico-linea' })}${esc(categoria.label)} · ` : ''}Se cuenta en ${esc(unitText(item.controlUnit, 2))}${equivalencias.length ? ` · 1 ${esc(item.purchaseUnit)} = ${equivalencias.map(([, factor]) => esc(measure(factor, item.controlUnit))).join(' / ')}` : item.purchaseUnit !== item.controlUnit ? ` · se compra en ${esc(unitText(item.purchaseUnit, 2))} <span class="pill gray">falta la medida</span>` : ''} · hay ${esc(measure(hay, item.controlUnit))}</div>
    </div>
    <div class="inline">${item.archived
      ? button('Reactivar', 'restore-product', 'btn-secondary btn-small', `data-id="${item.id}"`)
      : `${button('Editar', 'open-product', 'btn-secondary btn-small', `data-id="${item.id}"`)}${button(icono('puntos', { tamano: 18 }), 'open-avanzado-producto', 'btn-quiet btn-small btn-flecha', `data-id="${item.id}" aria-label="Más opciones de ${esc(item.name)}"`)}`}</div>
  </div>`;
}

/* ── Historial ─────────────────────────────────────────────────────────── */

function renderHistorial(ctx) {
  const { state } = ctx;
  const eventos = [
    ...state.purchases.map(item => ({ tipo: 'compra', fecha: item.date, seq: item.seq, item })),
    ...state.reviews.filter(item => item.status === 'confirmed').map(item => ({ tipo: 'revision', fecha: item.date, seq: item.seq, item })),
    ...state.corrections.map(item => ({ tipo: 'correccion', fecha: item.date, seq: item.seq, item }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.seq - a.seq);
  return `${volver('Historial')}
    <p class="pantalla-intro">Todo lo que ha movido las existencias, de lo más reciente a lo más antiguo.</p>
    ${periodosCerrados(ctx)}
    ${eventos.length ? `<div class="card">${eventos.slice(0, 60).map(evento => `<div class="list-row">
      <div class="list-row-main">
        <div class="list-row-title">${({ compra: 'Compra', revision: 'Revisión', correccion: 'Corrección' })[evento.tipo]} · ${esc(niceDate(evento.fecha, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        <div class="list-row-sub">${esc(detalleDeEvento(state, evento))}</div>
      </div>
      ${evento.tipo === 'revision' ? button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${evento.item.id}"`) : ''}
    </div>`).join('')}</div>${eventos.length > 60 ? `<p class="small muted">Se muestran los 60 más recientes de ${eventos.length}.</p>` : ''}`
      : empty('reloj', 'Todavía no hay nada', 'Aquí aparecerán las compras que anotes y las revisiones que hagas.', '')}`;
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

/* ── Ajustes ───────────────────────────────────────────────────────────── */

function renderAjustes(ctx) {
  const { state } = ctx;
  const dictado = capacidad('dictar');
  const diaRevision = state.settings?.reviewWeekday ?? 5;
  return `${volver('Ajustes')}
    <div class="card">
      <h3>¿Qué día revisas lo que queda?</h3>
      <p class="muted small">Ese día la app te lo recuerda en la pantalla de la compra. Nada más: no manda notificaciones.</p>
      <form data-form="ajuste-revision" class="inline">
        <label class="field" style="max-width:220px"><span class="sr-only">Día de revisión</span>
          <select name="dia">${options(WEEKDAYS.map((dia, indice) => [dia, WEEKDAY_LABELS[indice]]), diaRevision)}</select>
        </label>
        <button type="submit" class="btn btn-secondary">Guardar</button>
      </form>
    </div>
    <div class="card">
      <h3>Dictar en vez de escribir</h3>
      <p class="muted small">Lo hace el propio teléfono. No hay que configurar nada, no hay cuentas ni claves.</p>
      ${avisoDeVoz() ? `<p class="small revision-aviso">${esc(avisoDeVoz())}</p>` : '<p class="small muted">✓ En este teléfono la voz no sale del aparato.</p>'}
      <p class="small ${dictado.ok ? '' : 'muted'}">${dictado.ok ? '✓ Disponible en este aparato.' : '· No disponible en este aparato. Puedes escribir a mano en cualquier campo, o usar el micrófono del teclado de Android.'}</p>
      <p class="small muted">${esc(dictado.detalle)}</p>
      ${button('Detalle técnico de este aparato', 'open-diagnostico', 'btn-quiet btn-small')}
    </div>
    <div class="card">
      <h3>Organización de compra</h3>
      <p class="muted small">Cada cuánto se hace la compra principal, y cómo se reparte el mes cuando se compra dos veces.</p>
      <p class="small">Ahora mismo: <strong>${esc(frecuenciaDe(state, hoy.slice(0, 7)) === 'quincenal' ? 'quincenal — dos compras al mes' : 'mensual — una compra al mes')}</strong>.</p>
      <div class="inline">${button('Frecuencia de compra', 'navigate', 'btn-secondary btn-small', 'data-page="organizacion"')}</div>
    </div>
    <div class="card">
      <h3>Las personas de tu hogar</h3>
      <p class="muted small">Quién vive aquí, qué es de la casa cada quien y qué alimentos debe evitar. Desde aquí se añade gente, se corrige y se da de baja a quien ya no vive contigo.</p>
      <p class="small">${personasActivas(state).length
        ? `${personasActivas(state).length} persona(s) en casa${state.people.length - personasActivas(state).length ? ` · ${state.people.length - personasActivas(state).length} dada(s) de baja` : ''}.`
        : 'Todavía no hay nadie registrado.'}</p>
      <div class="inline">${button('Editar mi familia', 'navigate', 'btn-secondary btn-small', 'data-page="familia"')}${button('Configuración guiada', 'hogar-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card">
      <h3>Cómo funciona la app</h3>
      <p class="muted small">Un recorrido corto por las cuatro pantallas y por la idea de fondo: escribir una vez lo habitual y revisar solo lo diferente.</p>
      <div class="inline">${button('Ver el recorrido', 'open-tour', 'btn-secondary btn-small')}${button('Organizar mi casa otra vez', 'setup-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card">
      <h3>Funciones avanzadas</h3>
      <p class="muted small">Medidas y equivalencias, unir dos alimentos que son el mismo, corregir existencias a mano. Están aquí y no en la lista de Más porque una casa las abre una vez cada muchos meses —y cuando las abre, las necesita enteras.</p>
      ${button('Abrir funciones avanzadas', 'navigate', 'btn-secondary btn-small', 'data-page="avanzado"')}
    </div>
    <div class="card">
      <h3>Privacidad y condiciones</h3>
      <p class="muted small">Qué se guarda, dónde, y qué no sale de aquí. Está dentro de la app a propósito: se puede leer sin conexión y sin abrir el navegador.</p>
      ${button('Leerlo', 'navigate', 'btn-secondary btn-small', 'data-page="legal"')}
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

    ${quincenal ? bloqueDeReparto(ctx) : ''}`;
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

// El reparto entre las dos quincenas, el mismo que enseña el asistente. Aquí
// vive el resto del año, que es cuando de verdad se corrige.
function bloqueDeReparto(ctx) {
  const { state } = ctx;
  const filas = habitualLines(state)
    .map(linea => ({ linea, item: product(state, linea.productId) }))
    .filter(fila => fila.item && fila.linea.quantity !== null)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
  if (!filas.length) {
    return `<div class="card"><h3>Cómo se reparte el mes</h3>
      <p class="muted small">Cuando escribas cuánto se compra al mes de cada alimento, aquí podrás decir cuánto de eso entra en la primera quincena.</p></div>`;
  }
  return `<div class="card">
    <h3>Cómo se reparte el mes</h3>
    <p class="muted small">La cantidad del mes no cambia: esto solo dice cuánto de ella entra en la primera compra. Lo que no toques se reparte a la mitad.</p>
    <div class="setup-reparto">${filas.map(({ linea, item }) => filaDeReparto(ctx, linea, item)).join('')}</div>
  </div>`;
}

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

// Estas cuatro cosas existían ya, repartidas por donde se usan: la medida se
// pide cuando hace falta calcular una compra, la unión cuando se ve el alimento
// duplicado. Eso sigue igual y es lo correcto —se pregunta en el momento, no el
// primer día—. Lo que faltaba era una puerta para quien sabe lo que busca y no
// quiere ir a encontrárselo por casualidad.
function renderAvanzado(ctx) {
  const { state } = ctx;
  const sinMedida = state.products.filter(item => !item.archived && item.purchaseUnit !== item.controlUnit && !Number.isFinite(item.equivalences?.[item.purchaseUnit]));
  const parecidos = paresParecidos(state);
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
      <p class="muted small">Un alimento anotado dos veces parte su inventario en dos, y eso se descubre semanas después, cuando las cuentas no cuadran. Unirlos suma sus existencias y junta su historial. <strong>No se puede deshacer.</strong></p>
      ${parecidos.length
        ? `<div class="card soft">${parecidos.slice(0, 6).map(([uno, otro]) => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(uno.name)} · ${esc(otro.name)}</div><div class="list-row-sub">Los dos se cuentan en ${esc(unitText(uno.controlUnit, 2))}</div></div>${button('Revisar', 'open-merge', 'btn-quiet btn-small', `data-id="${uno.id}"`)}</div>`).join('')}</div>`
        : '<p class="small muted">✓ No encontré parecidos sospechosos.</p>'}
    </div>

    <div class="card">
      <h3>Corregir existencias a mano</h3>
      <p class="muted small">Para cuando algo se dañó, se perdió, o el conteo no cuadra y no quieres esperar a la próxima revisión. Queda anotado en el historial con su motivo.</p>
      ${button('Corregir un alimento', 'open-correction', 'btn-secondary')}
    </div>

    <div class="card">
      <h3>Servicios externos</h3>
      <p class="muted small">No hay ninguno, y no es un descuido: <strong>esta app no habla con ningún servidor</strong>. No hay dirección que configurar, ni clave que guardar, ni nada que pueda salir de aquí. Lo que la asistente entiende, lo entiende dentro del teléfono; lo que no, lo dice.</p>
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

// Dictar «quedan dos plátanos, diez huevos y media libra de queso» y que aparezca
// en tres casillas.
//
// Lo dictado se escribe en el formulario y se guarda **a través del formulario**,
// no directamente en el estado. Parece un rodeo y no lo es: así lo que la persona
// ya había tecleado a mano viaja en el mismo envío y no se pierde al repintar.
// Guardar por un lado y repintar por otro habría borrado media revisión.
export function aplicarDictado(ctx, texto) {
  const { state, ui } = ctx;
  const revision = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse().find(item => item.status === 'draft');
  const form = document.querySelector('[data-form="review"]');
  if (!revision || !form) return;
  const enLaRevision = new Set(revision.productIds);
  const disponible = reviewAvailability(state, revision);
  const queda = (revision.mode || 'restante') === 'restante';

  const puestos = [], fuera = [];
  for (const { action, arguments: args } of interpretar(texto).acciones || []) {
    if (action !== 'registrar_restante') continue;
    const item = productByName(state, args.producto) || findSimilarProducts(state, args.producto, { limit: 1 })[0]?.product;
    if (!item || !enLaRevision.has(item.id)) { fuera.push(args.producto); continue; }
    const campo = form.querySelector(`[name="consume-${item.id}"]`);
    if (!campo) continue;
    // El intérprete siempre dice cuánto QUEDA. Si la revisión está puesta en
    // «lo consumido», lo que hay que escribir es la resta, no el mismo número.
    const valor = queda ? args.queda : Math.max(0, (disponible[item.id] || 0) - Number(args.queda));
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    puestos.push(item.name);
  }

  ui.mas.revisionAviso = puestos.length
    ? `Anotado: ${puestos.join(', ')}.${fuera.length ? ` No encontré en esta revisión: ${fuera.join(', ')}.` : ''}`
    : `No reconocí ningún alimento de esta revisión en «${texto}». Puedes escribirlo a mano.`;

  if (!puestos.length) { ctx.render(); return; }
  // Guardar sin confirmar: la revisión sigue abierta y lo dictado queda a salvo.
  const guardar = form.querySelector('[name="intent"][value="save"]');
  if (guardar) form.requestSubmit(guardar); else ctx.render();
}

export const MAS_ACTIONS = {
  'cierre-ver': (el, ctx) => { ctx.ui.mas.cierreAbierto = ctx.ui.mas.cierreAbierto === el.dataset.id ? '' : el.dataset.id; ctx.render(); },
  'revision-solo-faltan': (el, ctx) => { ctx.ui.mas.revisionSoloFaltan = !ctx.ui.mas.revisionSoloFaltan; ctx.render(); },
  // Dictar ya no vive aquí: lo lleva `voz.js`, el mismo panel que usan el
  // asistente, la configuración inicial y la entrada rápida. Cuando la persona
  // toca «Usar este texto», app.js llama a `aplicarDictado` con lo dictado.
  'legal-ver': (el, ctx) => { ctx.ui.mas.documento = el.dataset.doc; ctx.render(); },
  'canasta-vista': (el, ctx) => { ctx.ui.mas.canastaVista = el.dataset.vista; ctx.ui.mas.corregibles = []; ctx.render(); },
  'canasta-corregir-atras': (el, ctx) => {
    const ids = ctx.ui.mas.corregibles || [];
    const hechas = ids.filter(id => corregirHaciaAtras(ctx.state, id)).length;
    ctx.ui.mas.corregibles = [];
    ctx.commit(hechas ? `Corregido también en los meses anteriores: ${hechas} alimento(s).` : 'No había nada que corregir hacia atrás.');
  },
  'canasta-mes': (el, ctx) => { ctx.ui.mas.canastaMes = shiftMonth(ctx.ui.mas.canastaMes, Number(el.dataset.delta)); ctx.render(); },
  'alimentos-archivados': (el, ctx) => { ctx.ui.mas.verArchivados = !ctx.ui.mas.verArchivados; ctx.render(); },
  'canasta-nuevo-cambio': (el, ctx) => ctx.openModal('cambio-mes', { month: el.dataset.month || ctx.ui.mas.canastaMes }),
  'open-avanzado-producto': (el, ctx) => ctx.openModal('avanzado-producto', { id: el.dataset.id }),
  'open-diagnostico': (el, ctx) => {
    ctx.openModal('diagnostico');
    // Preguntarle al teléfono si entiende la voz por sí solo. Es asíncrono y no
    // pide permisos, así que se lanza y se vuelve a pintar cuando conteste: es
    // la diferencia entre decir «no se sabe» y decir la verdad.
    comprobarDictado().then(() => { if (ctx.ui.modal?.type === 'diagnostico') ctx.render(); }).catch(() => {});
  },
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
