// La compra.
//
// La versión anterior abría con tres botones —Menú, Canasta base, Este mes—
// que obligaban a elegir una «base de cálculo» antes de ver un solo alimento.
// Eso es una pregunta de programador: quien va al colmado no quiere escoger un
// método, quiere la lista.
//
// Aquí hay una sola lista y una sola cuenta:
//
//     lo que tu casa consume al mes  +  lo que cambia este mes  −  lo que queda
//
// El menú sigue pudiendo calcular la compra, porque para quien planifica comida
// por comida es más exacto; pero vive dentro de «Opciones avanzadas», con su
// explicación al lado, y no aparece hasta que alguien lo busca.
//
// Las dos cuentas nunca se suman. Sumarlas contaría dos veces el mismo arroz:
// una por estar en la canasta y otra por estar dentro de una preparación.

import { effectiveBasket, lastStockReview, monthBounds, product, shoppingList, todayISO } from './model.js';
import { button, cap, empty, esc, measure, monthName, niceDate, notice, shiftMonth } from './ui-kit.js';

const hoy = todayISO();

export function emptyCompra(month = hoy.slice(0, 7)) {
  return {
    month,
    // Antes del 16 casi siempre se está comprando la primera quincena. Abrir en
    // el tramo que toca ahorra el primer toque a casi todo el mundo.
    tramo: Number(hoy.slice(8)) <= 15 ? 'primera' : 'segunda',
    desde: hoy,
    hasta: hoy,
    base: 'casa',
    verAvanzado: false,
    verDisponible: false
  };
}

const TRAMOS = [
  ['mes', 'Todo el mes'],
  ['primera', '1.ª quincena'],
  ['segunda', '2.ª quincena']
];

export function periodoDeCompra(compra) {
  if (compra.tramo === 'fechas') return { start: compra.desde, end: compra.hasta };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(compra.month)) return { start: '', end: '' };
  const limites = monthBounds(compra.month);
  if (compra.tramo === 'primera') return { start: limites.start, end: `${compra.month}-15` };
  if (compra.tramo === 'segunda') return { start: `${compra.month}-16`, end: limites.end };
  return limites;
}

export function renderCompra(ctx) {
  const { state, ui } = ctx;
  if (!ui.compra) ui.compra = emptyCompra();
  const compra = ui.compra;
  const periodo = periodoDeCompra(compra);

  let lista, errorPeriodo = '';
  try {
    lista = shoppingList(state, periodo.start, periodo.end, compra.base);
  } catch (error) {
    errorPeriodo = error.message;
    lista = { lines: [], missing: [], pending: [], months: [], lastReview: null, future: false };
  }

  const faltan = lista.lines.filter(linea => linea.shortfall > 0);
  const hay = lista.lines.filter(linea => linea.shortfall <= 0);
  const origenes = mapaDeOrigen(state, compra.month, compra.base);

  return `${selectorDePeriodo(ctx, compra)}
    ${errorPeriodo ? notice('Revisa las fechas.', esc(errorPeriodo), 'error') : ''}
    ${recordatorioDeRevision(state)}
    ${listaPrincipal(ctx, faltan, origenes, lista)}
    ${bloqueDisponible(ctx, hay)}
    ${avisosPrevios(ctx, lista)}
    ${bloqueManual(ctx)}
    ${opcionesAvanzadas(ctx, compra, lista)}
    ${historialDeCompras(ctx)}`;
}

/* ── Período ───────────────────────────────────────────────────────────── */

function selectorDePeriodo(ctx, compra) {
  const periodo = periodoDeCompra(compra);
  const rotulo = compra.tramo === 'fechas' && periodo.start && periodo.end
    ? `${niceDate(periodo.start, { day: 'numeric', month: 'short' })} – ${niceDate(periodo.end, { day: 'numeric', month: 'short' })}`
    : monthName(compra.month);
  return `<div class="toolbar compra-periodo">
    <div class="inline">
      ${button('‹', 'compra-mover', 'btn-secondary btn-small', 'data-delta="-1" aria-label="Mes anterior"')}
      <div class="strong compra-mes">${esc(rotulo)}</div>
      ${button('›', 'compra-mover', 'btn-secondary btn-small', 'data-delta="1" aria-label="Mes siguiente"')}
    </div>
    <div class="segmented">${TRAMOS.map(([id, texto]) => `<button type="button" data-action="compra-tramo" data-tramo="${id}" class="${compra.tramo === id ? 'active' : ''}">${texto}</button>`).join('')}</div>
  </div>
  ${compra.tramo === 'fechas'
    ? `<div class="inline compra-fechas"><label class="field"><span>Desde</span><input id="compra-desde" type="date" value="${esc(compra.desde)}"></label><label class="field"><span>Hasta</span><input id="compra-hasta" type="date" value="${esc(compra.hasta)}"></label>${button('Volver al mes', 'compra-tramo', 'btn-quiet btn-small', 'data-tramo="mes"')}</div>`
    : `<p class="small muted compra-otras"><button type="button" class="enlace" data-action="compra-tramo" data-tramo="fechas">Usar otras fechas</button></p>`}`;
}

/* ── La lista ──────────────────────────────────────────────────────────── */

// Cada línea dice de dónde sale. «De siempre» y «extra de octubre» son dos
// cosas muy distintas cuando uno está mirando cuánto va a gastar.
function mapaDeOrigen(state, month, base) {
  const mapa = new Map();
  if (base !== 'casa') return mapa;
  for (const linea of effectiveBasket(state, month)) mapa.set(linea.productId, linea.source);
  return mapa;
}

const ETIQUETA_ORIGEN = {
  cambio: '<span class="pill warm">cantidad cambiada este mes</span>',
  extra: '<span class="pill warm">extra de este mes</span>'
};

function listaPrincipal(ctx, faltan, origenes, lista) {
  const { state, ui } = ctx;
  if (!faltan.length) {
    const canastaVacia = ui.compra.base === 'casa' && !effectiveBasket(state, ui.compra.month).length;
    return `<div class="section-head"><div><h2>Lo que falta comprar</h2></div></div>
      ${canastaVacia
        ? empty('🧺', 'Todavía no has dicho qué se compra en tu casa',
            'Se escribe una sola vez: los plátanos, el arroz, los huevos, el salami… Después, cada mes solo cambias lo diferente y la lista sale sola.',
            `${button('Organizar mi casa', 'setup-open', 'btn-primary')}${button('Escribirla a mano', 'navigate', 'btn-secondary', 'data-page="canasta"')}`)
        : empty('✓', 'No falta nada', 'Con lo que hay en casa alcanza para este período. Si no cuadra, revisa cuánto queda de verdad.', button('Revisar lo que queda', 'open-new-review', 'btn-secondary'))}`;
  }
  return `<div class="section-head"><div><h2>Lo que falta comprar</h2><p>${esc(explicacionDeBase(ui.compra.base))}</p></div><span class="pill">${faltan.length} ${faltan.length === 1 ? 'alimento' : 'alimentos'}</span></div>
    <div class="card compra-lista">${faltan.map(linea => {
      const item = product(state, linea.productId);
      const origen = origenes.get(linea.productId);
      return `<div class="list-row compra-fila">
        <div class="list-row-main">
          <div class="list-row-title">${esc(item?.name || 'Alimento eliminado')} ${ETIQUETA_ORIGEN[origen] || ''}</div>
          <div class="list-row-sub">${linea.available > 0 ? `Quedan ${esc(measure(linea.available, item?.controlUnit || ''))} en casa` : 'No queda nada en casa'}</div>
        </div>
        <div class="compra-cantidad">${linea.purchaseQuantity === null
          ? `<span class="pill gray">falta una medida</span>`
          : `<strong>${esc(measure(linea.purchaseQuantity, linea.purchaseUnit))}</strong>`}</div>
      </div>`;
    }).join('')}</div>
    <div class="inline compra-acciones">${button('Ya compré: anotar lo que traje', 'open-purchase', 'btn-primary')}</div>
    ${lista.pending.length ? avisoDeMedidas(state, lista) : ''}`;
}

const explicacionDeBase = base => base === 'casa'
  ? 'Tu canasta habitual con los cambios de este mes, menos lo que ya queda en casa.'
  : 'Los alimentos de las comidas que tienes planificadas, menos lo que ya queda en casa.';

// Una equivalencia que falta no se puede adivinar: si el salami se cuenta en
// ruedas y se compra en paquetes, solo quien lo compra sabe cuántas ruedas trae
// un paquete. Se pide aquí, cuando hace falta, y no en el primer día de uso.
function avisoDeMedidas(state, lista) {
  const productos = [...new Set(lista.pending.map(item => item.productId))];
  return `<div class="notice warn"><span>↔</span><div>
    <strong>${productos.length} ${productos.length === 1 ? 'alimento necesita' : 'alimentos necesitan'} una medida antes de poder calcularlos</strong>
    ${productos.slice(0, 4).map(id => {
      const item = product(state, id);
      const unidad = lista.pending.find(row => row.productId === id)?.unit;
      return `${esc(item?.name || '')}: ¿cuántos ${esc(item?.controlUnit || '')} trae un ${esc(unidad || '')}?`;
    }).join('<br>')}${productos.length > 4 ? '<br>…' : ''}
    <div class="inline" style="margin-top:10px">${productos.slice(0, 1).map(id => button('Decirlo ahora', 'open-equivalence', 'btn-secondary btn-small', `data-id="${id}"`)).join('')}</div>
  </div></div>`;
}

/* ── Lo que ya hay ─────────────────────────────────────────────────────── */

function bloqueDisponible(ctx, hay) {
  const { state, ui } = ctx;
  if (!hay.length) return '';
  const abierto = ui.compra.verDisponible;
  return `<details class="plegable" ${abierto ? 'open' : ''}><summary data-action="compra-ver-disponible">Lo que ya queda en casa · ${hay.length}</summary>
    <div class="card">${hay.map(linea => {
      const item = product(state, linea.productId);
      return `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item?.name || '')}</div><div class="list-row-sub">Necesitas ${esc(measure(linea.need, item?.controlUnit || ''))} · hay ${esc(measure(linea.available, item?.controlUnit || ''))}</div></div><span class="pill">alcanza</span></div>`;
    }).join('')}</div></details>`;
}

/* ── Avisos ────────────────────────────────────────────────────────────── */

function recordatorioDeRevision(state) {
  const ultima = lastStockReview(state);
  if (!ultima) {
    return state.products.length
      ? notice('La lista usa las existencias que tiene anotadas la app.', `Si nunca has revisado qué queda de verdad, esos números pueden estar lejos. <button type="button" class="enlace" data-action="open-new-review">Revisar ahora</button>`, 'warn')
      : '';
  }
  // El día de revisión es una costumbre de la casa, no una alarma del sistema:
  // se avisa el día que toca y no se insiste el resto de la semana.
  const diaDeHoy = (new Date(`${hoy}T12:00:00`).getDay() + 6) % 7 + 1;
  const tocaHoy = diaDeHoy === (state.settings?.reviewWeekday ?? 5);
  if (tocaHoy && ultima !== hoy) {
    return notice('Hoy toca revisar lo que queda.', `Un repaso rápido a la nevera y la despensa deja la lista exacta. <button type="button" class="enlace" data-action="open-new-review">Empezar la revisión</button>`);
  }
  return '';
}

function avisosPrevios(ctx, lista) {
  const { ui } = ctx;
  const trozos = [];
  if (lista.future) trozos.push(notice('Esta compra es para un período que todavía no ha llegado.', 'El cálculo usa lo que hay hoy en casa. Vuelve a mirarlo antes de salir.', 'warn'));
  // Se dice, pero no se descuenta. Bajar la canasta entera porque la familia
  // almorzó fuera dos domingos recortaría también el detergente y el café, que
  // no tienen nada que ver con ese almuerzo. Quien quiera ajustarlo lo hace a
  // mano en los cambios del mes, que es donde esa decisión se puede razonar.
  if (ui.compra.base === 'casa' && lista.fuera > 0) {
    trozos.push(notice(`Este período tiene ${lista.fuera} ${lista.fuera === 1 ? 'comida fuera de casa' : 'comidas fuera de casa'}.`,
      'La lista no las descuenta sola: comer fuera un domingo no hace que la casa gaste menos arroz el resto del mes. Si este mes van a consumir menos de algo, anótalo en los cambios del mes.'));
  }
  if (ui.compra.base === 'menu' && lista.missing?.length) {
    trozos.push(notice(`${lista.missing.length} comida(s) sin planificar`, `Calculando desde el menú, lo que no esté planificado no entra en la lista. ${lista.missing.slice(0, 4).map(item => `${cap(item.slot)} ${niceDate(item.date, { day: 'numeric', month: 'short' })}`).join(', ')}${lista.missing.length > 4 ? '…' : ''}`, 'warn'));
  }
  return trozos.join('');
}

/* ── Lo que se anota a mano ────────────────────────────────────────────── */

function bloqueManual(ctx) {
  const { state } = ctx;
  return `<details class="plegable"><summary>Otras cosas que anotar · ${state.manualItems.length}</summary>
    <p class="small muted">Detergente, servilletas, lo que sea. Se apunta y se tacha; la app no le lleva la cuenta.</p>
    <form data-form="manual-item" class="inline">
      <input class="text" name="name" placeholder="Ej. Detergente" required style="max-width:250px">
      <input class="text" name="quantity" placeholder="Cantidad (opcional)" style="max-width:170px">
      <button class="btn btn-secondary" type="submit">Anotar</button>
    </form>
    <div class="card" style="margin-top:14px">${state.manualItems.length
      ? state.manualItems.map(item => `<div class="list-row"><label class="inline"><input type="checkbox" data-action="toggle-manual" data-id="${item.id}" ${item.done ? 'checked' : ''}><span class="${item.done ? 'tachado' : ''}">${esc(item.name)}${item.quantity ? ` <span class="muted">· ${esc(item.quantity)}</span>` : ''}</span></label>${button('Quitar', 'delete-manual', 'btn-quiet btn-small', `data-id="${item.id}"`)}</div>`).join('')
      : '<p class="muted">Nada anotado.</p>'}</div></details>`;
}

/* ── Opciones avanzadas ────────────────────────────────────────────────── */

// Aquí vive la única decisión técnica que queda, con su explicación al lado.
// Casi nadie va a abrir esto, y esa es exactamente la intención.
function opcionesAvanzadas(ctx, compra, lista) {
  const { state } = ctx;
  const tramos = lista.months?.length ? lista.months : [];
  return `<details class="plegable" ${compra.verAvanzado ? 'open' : ''}><summary data-action="compra-ver-avanzado">Opciones avanzadas</summary>
    <div class="card">
      <h3 class="plan-sub">¿De dónde sale la lista?</h3>
      <div class="opcion-larga">
        <label class="radio-bloque">
          <input type="radio" name="compra-base" value="casa" data-action="compra-base" data-base="casa" ${compra.base === 'casa' ? 'checked' : ''}>
          <span><strong>De mi canasta habitual</strong><em>Recomendado.</em> Lo que tu casa consume en un mes, con los cambios de este mes, menos lo que queda. No hace falta planificar comidas.</span>
        </label>
        <label class="radio-bloque">
          <input type="radio" name="compra-base" value="menu" data-action="compra-base" data-base="menu" ${compra.base === 'menu' ? 'checked' : ''}>
          <span><strong>Del menú planificado</strong>Suma los alimentos de las comidas que tengas puestas en el calendario. Más exacto si planificas comida por comida, y peor si dejas huecos.</span>
        </label>
      </div>
      <p class="small muted">Nunca se suman las dos: el mismo arroz saldría contado dos veces, una por estar en la canasta y otra por estar dentro de una preparación.</p>
      ${compra.base === 'casa' ? `<p class="small muted">Las comidas fuera de casa no descuentan de esta lista. Almorzar fuera un domingo no hace que la casa gaste menos detergente, y quitar alimentos «a ojo» dejaría la compra corta.</p>` : ''}
      ${tramos.length ? `<h3 class="plan-sub">Cómo se reparte el mes</h3><p class="small muted">${tramos.map(tramo => `${tramo.days} de los ${tramo.monthDays} días de ${esc(monthName(tramo.month))} → ${Math.round(tramo.share * 100)}% de esa canasta`).join('<br>')}</p>` : ''}
      <h3 class="plan-sub">Existencias</h3>
      <p class="small muted">${lista.lastReview ? `Última revisión: ${esc(niceDate(lista.lastReview, { day: 'numeric', month: 'long', year: 'numeric' }))}.` : 'Todavía no hay ninguna revisión confirmada.'}</p>
      <div class="inline">${button('Revisar lo que queda', 'open-new-review', 'btn-secondary btn-small')}${button('Corregir existencias', 'open-correction', 'btn-quiet btn-small')}</div>
    </div>
  </details>`;
}

/* ── Historial ─────────────────────────────────────────────────────────── */

function historialDeCompras(ctx) {
  const { state } = ctx;
  if (!state.purchases.length) return '';
  const ultimas = [...state.purchases].reverse().slice(0, 6);
  return `<details class="plegable"><summary>Compras anotadas · ${state.purchases.length}</summary>
    <div class="card">${ultimas.map(compra => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(niceDate(compra.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="list-row-sub">${compra.lines.slice(0, 6).map(linea => `${esc(measure(linea.quantity, linea.unit))} de ${esc(product(state, linea.productId)?.name || '—')}`).join(' · ')}${compra.lines.length > 6 ? ` · y ${compra.lines.length - 6} más` : ''}</div></div></div>`).join('')}</div>
  </details>`;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const COMPRA_ACTIONS = {
  'compra-mover': (el, ctx) => {
    ctx.ui.compra.month = shiftMonth(ctx.ui.compra.month, Number(el.dataset.delta));
    if (ctx.ui.compra.tramo === 'fechas') ctx.ui.compra.tramo = 'mes';
    ctx.render();
  },
  'compra-tramo': (el, ctx) => {
    ctx.ui.compra.tramo = el.dataset.tramo;
    if (el.dataset.tramo === 'fechas') {
      const limites = monthBounds(ctx.ui.compra.month);
      ctx.ui.compra.desde = limites.start;
      ctx.ui.compra.hasta = limites.end;
    }
    ctx.render();
  },
  'compra-base': (el, ctx) => { ctx.ui.compra.base = el.dataset.base; ctx.ui.compra.verAvanzado = true; ctx.render(); },
  // `details` abre y cierra solo; esto únicamente recuerda el estado para que
  // volver a pintar la pantalla no lo cierre de golpe.
  'compra-ver-avanzado': (el, ctx) => { ctx.ui.compra.verAvanzado = !el.closest('details').open; },
  'compra-ver-disponible': (el, ctx) => { ctx.ui.compra.verDisponible = !el.closest('details').open; }
};

export const COMPRA_FORMS = {};
