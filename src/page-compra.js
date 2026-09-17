// La compra: una lista que escribe una persona.
//
// Aquí había una cuenta. Sumaba lo que la casa consume al mes, le restaba lo
// que decía quedar en la despensa y prometía cuánto había que comprar. La
// cuenta estaba bien hecha y aun así no servía, por una razón que no es de
// programación: nadie anota el arroz que se cayó, ni las dos tazas que se llevó
// la vecina, ni el paquete que se abrió para probar. A los tres meses el número
// no se parecía a la despensa, y una lista que no se parece a la despensa se
// deja de mirar.
//
// Así que no hay cuenta. Hay dos pantallas:
//
//  · **Preparar la compra** — los productos habituales, por rubros y con
//    buscador. Se toca uno, se dice cuánto se quiere llevar ESTA VEZ, y entra
//    en la lista. Ni uno entra solo. Que el arroz esté en los habituales no
//    significa que este sábado haga falta arroz.
//
//  · **Mi lista** — lo que queda por buscar arriba y lo tachado abajo. Un toque
//    tacha. Si la lista decía dos latas y solo había una, se anota una y queda
//    una pendiente, porque eso es lo que pasó.
//
// La app no sabe cuánto hace falta y no lo dice. Lo decide quien compra.

import {
  agregarALista, agregarOcasional, anotarComprado, cerrarLista, crearLista, habitualesPorRubro, listasAbiertas,
  listasCerradas, marcarComprado, pendienteDe, product, quitarDeLista, resumenDeLista, todayISO
} from './model.js';
import { RUBROS } from './catalog-seed.js';
import {
  button, empty, esc, measure, niceDate, notice, options
} from './ui-kit.js';
import { icono, iconoDeCategoria } from './icons.js';
import { normalizeName } from './nombres.js';

const hoy = todayISO();

export function emptyCompra() {
  return {
    // «preparar» es donde se escribe la lista; «lista» es lo que se lleva al
    // colmado. Se empieza por preparar: sin nada apuntado, «mi lista» está
    // vacía y no hay nada que enseñar.
    vista: 'preparar',
    busqueda: '',
    // Qué producto tiene abierta la casilla de «¿cuánto?». Uno cada vez: abrir
    // ochenta casillas de cantidad es exactamente lo que esta etapa vino a
    // quitar de en medio.
    poniendo: '',
    anadiendo: false,
    nombreNuevo: '',
    errorNuevo: '',
    verHistorial: false
  };
}

// La lista que se está escribiendo. Si no hay ninguna abierta, no se crea al
// mirar: preguntar por la compra no puede empezar una.
export const listaEnCurso = state => listasAbiertas(state)[0] || null;

const nombreDeLinea = (state, linea) => (linea.productId ? product(state, linea.productId)?.name || 'Alimento eliminado' : linea.texto);
const cuanto = (cantidad, unidad) => (cantidad === null || cantidad === undefined ? '' : measure(cantidad, unidad || 'unidad'));

/* ── La pantalla ───────────────────────────────────────────────────────── */

export function renderCompra(ctx) {
  const { state, ui } = ctx;
  const lista = listaEnCurso(state);
  if (!lista) return sinListaAbierta(ctx);

  const resumen = resumenDeLista(lista);
  const enPreparar = ui.compra.vista !== 'lista';

  return `<div class="compra-cabecera">
      <div class="section-head"><div>
        <h2>${esc(lista.nombre || `Compra del ${niceDate(lista.fecha, { weekday: 'long', day: 'numeric', month: 'long' })}`)}</h2>
        <p class="small muted">${resumen.total
          ? `${resumen.total} cosa(s) apuntadas · ${resumen.pendientes} por buscar`
          : 'Todavía no has apuntado nada.'}</p>
      </div></div>
      <div class="segmented segmented-ancho compra-vistas">
        <button type="button" data-action="compra-vista" data-vista="preparar" class="${enPreparar ? 'active' : ''}">Preparar la compra</button>
        <button type="button" data-action="compra-vista" data-vista="lista" class="${enPreparar ? '' : 'active'}">Mi lista${resumen.total ? ` · ${resumen.total}` : ''}</button>
      </div>
    </div>
    ${enPreparar ? vistaPreparar(ctx, lista) : vistaLista(ctx, lista)}
    ${historial(ctx)}`;
}

function sinListaAbierta(ctx) {
  const cerradas = listasCerradas(ctx.state);
  return `${empty('canasta', 'No tienes ninguna compra abierta',
    'Una lista es una salida concreta al supermercado. Ábrela cuando vayas a preparar la próxima, sea la del mes, la de la quincena o una vuelta extra un martes cualquiera.',
    button('Preparar una compra', 'compra-nueva', 'btn-primary btn-grande'))}
    ${cerradas.length ? historial(ctx) : ''}`;
}

/* ── Vista 1: preparar la compra ───────────────────────────────────────── */

function vistaPreparar(ctx, lista) {
  const { state, ui } = ctx;
  const busqueda = normalizeName(ui.compra.busqueda || '');
  const yaEnLaLista = new Set(lista.lineas.map(linea => linea.productId).filter(Boolean));
  const grupos = habitualesPorRubro(state)
    .map(grupo => ({
      ...grupo,
      lineas: grupo.lineas.filter(linea => {
        if (!busqueda) return true;
        const item = product(state, linea.productId);
        return item && (normalizeName(item.name).includes(busqueda) || (item.aliases || []).some(alias => normalizeName(alias).includes(busqueda)));
      })
    }))
    .filter(grupo => grupo.lineas.length);

  const total = grupos.reduce((suma, grupo) => suma + grupo.lineas.length, 0);

  return `<p class="pantalla-intro">Toca lo que vayas a comprar <strong>esta vez</strong> y di cuánto llevas. Lo que no toques no entra en la lista: que algo esté aquí no significa que hoy haga falta.</p>

    ${habitualesPorRubro(state).length ? `<div class="setup-buscador">
      <label class="field setup-search"><span class="sr-only">Buscar un producto</span>
        <input type="search" id="compra-buscar" value="${esc(ui.compra.busqueda || '')}" placeholder="Buscar entre tus productos habituales…" autocomplete="off" aria-label="Buscar un producto habitual">
      </label>
      ${ui.compra.busqueda ? button('Ver todo', 'compra-limpiar-busqueda', 'btn-quiet') : ''}
    </div>` : ''}

    ${grupos.length ? grupos.map(grupo => bloqueDeRubro(ctx, grupo, yaEnLaLista)).join('')
      : habitualesPorRubro(state).length
        ? `<p class="muted">Nada coincide con «${esc(ui.compra.busqueda)}». Puedes añadirlo aquí abajo.</p>`
        : notice('Todavía no tienes productos habituales.',
            'Son los que tu casa compra de costumbre, y sirven para no acordarte de todo de cero cada vez. Se marcan en Mis productos habituales, o puedes apuntar aquí mismo lo de esta compra.')}

    ${bloqueOcasional(ctx)}
    ${total ? `<p class="tiny muted">${total} producto(s) habituales a la vista. No hace falta marcarlos todos: solo lo de esta compra.</p>` : ''}`;
}

function bloqueDeRubro(ctx, grupo, yaEnLaLista) {
  const { state, ui } = ctx;
  const rubro = RUBROS.find(item => item.id === grupo.rubro);
  return `<section class="compra-rubro">
    <h3 class="compra-rubro-titulo">
      <span class="compra-rubro-icono">${iconoDeCategoria(grupo.rubro, { tamano: 20 })}</span>
      ${esc(rubro?.titulo || grupo.rubro)}
    </h3>
    <div class="compra-productos">${grupo.lineas.map(linea => {
      const item = product(state, linea.productId);
      if (!item) return '';
      const puesto = yaEnLaLista.has(item.id);
      const abierto = ui.compra.poniendo === item.id;
      if (abierto) {
        return `<form data-form="compra-poner" data-id="${esc(item.id)}" class="compra-poner">
          <p class="compra-poner-nombre">${esc(item.name)}</p>
          <div class="compra-poner-campos">
            <label class="field"><span>¿Cuánto llevas esta vez?</span>
              <input name="cantidad" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 2" autofocus>
            </label>
            <label class="field"><span>Medida</span>
              <select name="unidad">${options(MEDIDAS, linea.unit || item.purchaseUnit || 'unidad')}</select>
            </label>
          </div>
          <div class="inline compra-poner-acciones">
            <button type="submit" class="btn btn-primary btn-small">Añadir a la lista</button>
            ${button('Cancelar', 'compra-cancelar-poner', 'btn-quiet btn-small')}
          </div>
          <p class="tiny muted">Puedes dejarlo en blanco: se apunta sin cantidad y decides delante del estante.</p>
        </form>`;
      }
      return `<button type="button" class="compra-producto ${puesto ? 'puesto' : ''}" data-action="compra-poner" data-id="${esc(item.id)}">
        <span class="compra-producto-nombre">${esc(item.name)}</span>
        ${puesto ? '<span class="pill">en la lista</span>' : `<span class="compra-producto-mas" aria-hidden="true">${icono('mas', { tamano: 16 })}</span>`}
      </button>`;
    }).join('')}</div>
  </section>`;
}

// Las medidas con que se compra. Son las mismas del modelo, escritas en plural
// porque es como se dicen delante del estante: «dos paquetes», no «2 paquete».
const MEDIDAS = [
  ['unidad', 'unidades'], ['lb', 'libras'], ['taza', 'tazas'], ['lata', 'latas'],
  ['paquete', 'paquetes'], ['rueda', 'ruedas'], ['rebanada', 'rebanadas']
];

/* ── Algo que no se compra siempre ─────────────────────────────────────── */

function bloqueOcasional(ctx) {
  const { ui } = ctx;
  if (!ui.compra.anadiendo) {
    return `<div class="compra-ocasional-abrir">
      ${button('+ Algo que no está en la lista', 'compra-ocasional', 'btn-secondary')}
    </div>`;
  }
  return `<form data-form="compra-ocasional" class="compra-ocasional">
    <p class="compra-ocasional-titulo">Añadir algo más</p>
    <label class="field"><span>¿Qué es?</span>
      <input name="nombre" value="${esc(ui.compra.nombreNuevo || '')}" placeholder="Ej. Papel de aluminio" autocomplete="off" maxlength="60" autofocus>
    </label>
    <div class="compra-poner-campos">
      <label class="field"><span>¿Cuánto? (opcional)</span>
        <input name="cantidad" type="number" min="0" step="any" inputmode="decimal" placeholder="Ej. 1">
      </label>
      <label class="field"><span>Medida</span>
        <select name="unidad">${options(MEDIDAS, 'unidad')}</select>
      </label>
    </div>
    <div class="field">
      <span>¿Es de esta compra, o de las que se repiten?</span>
      <div class="radio-fila">
        <label class="radio-pill"><input type="radio" name="habitual" value="" checked><span>Solo esta compra</span></label>
        <label class="radio-pill"><input type="radio" name="habitual" value="1"><span>También a mis habituales</span></label>
      </div>
      <small>«También a mis habituales» lo guarda para la próxima vez, sin cantidad: la de cada compra la dices tú.</small>
    </div>
    ${ui.compra.errorNuevo ? `<p class="setup-error" role="alert">${esc(ui.compra.errorNuevo)}</p>` : ''}
    <div class="inline">
      <button type="submit" class="btn btn-primary btn-small">Añadir</button>
      ${button('Cancelar', 'compra-cancelar-ocasional', 'btn-quiet btn-small')}
    </div>
  </form>`;
}

/* ── Vista 2: mi lista ─────────────────────────────────────────────────── */

function vistaLista(ctx, lista) {
  const { state } = ctx;
  const pendientes = lista.lineas.filter(linea => !linea.comprado);
  const tachados = lista.lineas.filter(linea => linea.comprado);

  if (!lista.lineas.length) {
    return empty('canasta', 'La lista está vacía',
      'Ve a «Preparar la compra» y toca lo que vayas a llevar. Nada entra solo.',
      button('Preparar la compra', 'compra-vista', 'btn-primary', 'data-vista="preparar"'));
  }

  return `<p class="pantalla-intro">Un toque tacha lo que ya echaste al carrito. Si trajiste menos de lo que decía, anota cuánto y el resto se queda pendiente.</p>

    ${pendientes.length
      ? `<div class="card compra-lista">${pendientes.map(linea => renglon(state, lista, linea)).join('')}</div>`
      : `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>No queda nada por buscar.</strong><span>Cuando salgas del supermercado, dale a «Terminar la compra».</span></div></div>`}

    ${tachados.length ? `<div class="section-head"><h3 class="plan-sub">Ya en el carrito · ${tachados.length}</h3></div>
      <div class="card compra-lista compra-tachados">${tachados.map(linea => renglon(state, lista, linea)).join('')}</div>` : ''}

    <div class="modal-actions compra-acciones">
      ${button('Terminar la compra', 'compra-terminar', 'btn-primary btn-grande')}
    </div>
    <p class="tiny muted">Terminar la guarda con la fecha y lo que se pidió y se trajo de cada cosa, y deja una lista nueva y vacía para la próxima salida. Tus productos habituales no se tocan.</p>`;
}

function renglon(state, lista, linea) {
  const nombre = nombreDeLinea(state, linea);
  const falta = pendienteDe(linea);
  const pedido = cuanto(linea.cantidad, linea.unidad);
  const traido = cuanto(linea.comprada, linea.unidad);
  const aMedias = !linea.comprado && linea.comprada;

  return `<div class="compra-renglon ${linea.comprado ? 'tachado' : ''} ${aMedias ? 'a-medias' : ''}">
    <button type="button" class="compra-tachar" data-action="compra-tachar" data-id="${esc(linea.id)}"
      aria-pressed="${linea.comprado}" aria-label="${linea.comprado ? 'Quitar la marca de' : 'Marcar como comprado'} ${esc(nombre)}">
      <span class="compra-tachar-caja" aria-hidden="true">${linea.comprado ? icono('visto', { tamano: 15 }) : ''}</span>
      <span class="compra-renglon-texto">
        <strong>${esc(nombre)}</strong>
        <span class="small muted">${pedido || 'sin cantidad'}${aMedias ? ` · se trajo ${esc(traido)}${falta ? `, faltan ${esc(cuanto(falta, linea.unidad))}` : ''}` : ''}${linea.nota ? ` · ${esc(linea.nota)}` : ''}</span>
      </span>
    </button>
    <div class="inline compra-renglon-acciones">
      ${linea.comprado ? '' : `<form data-form="compra-parcial" data-lista="${esc(lista.id)}" data-id="${esc(linea.id)}" class="compra-parcial">
        <label class="sr-only" for="parcial-${esc(linea.id)}">¿Cuánto trajiste de ${esc(nombre)}?</label>
        <input id="parcial-${esc(linea.id)}" name="comprada" type="number" min="0" step="any" inputmode="decimal"
          value="${linea.comprada ?? ''}" placeholder="¿cuánto?" aria-label="Cuánto trajiste">
        <button type="submit" class="btn btn-quiet btn-small">Anotar</button>
      </form>`}
      ${button('Quitar', 'compra-quitar', 'btn-quiet btn-small', `data-id="${esc(linea.id)}"`)}
    </div>
  </div>`;
}

/* ── El historial: las listas que ya se cerraron ───────────────────────── */

function historial(ctx) {
  const { state, ui } = ctx;
  const cerradas = listasCerradas(state);
  if (!cerradas.length) return '';
  const abiertas = ui.compra.verHistorial;
  return `<details class="plegable compra-historial" ${abiertas ? 'open' : ''}>
    <summary data-action="compra-ver-historial">Compras anteriores · ${cerradas.length}</summary>
    <p class="small muted">Lo que se apuntó y lo que se trajo de cada una. Es un recuerdo de lo que pasó, no una cuenta de lo que hay en casa.</p>
    ${cerradas.slice(0, 12).map(lista => {
      const resumen = resumenDeLista(lista);
      return `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(niceDate(lista.cerradaEl || lista.fecha, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <div class="list-row-sub">${resumen.comprados} de ${resumen.total} cosa(s) traídas${resumen.pendientes ? ` · ${resumen.pendientes} se quedaron sin conseguir` : ''}</div>
          <div class="list-row-sub small muted">${lista.lineas.slice(0, 6).map(linea =>
            `${esc(nombreDeLinea(state, linea))}${linea.comprada ? ` (${esc(cuanto(linea.comprada, linea.unidad))})` : ''}`).join(' · ')}${lista.lineas.length > 6 ? ` y ${lista.lineas.length - 6} más` : ''}</div>
        </div>
      </div>`;
    }).join('')}
    ${cerradas.length > 12 ? `<p class="small muted">Y ${cerradas.length - 12} más.</p>` : ''}
  </details>`;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const COMPRA_ACTIONS = {
  'compra-nueva': (el, ctx) => {
    const lista = crearLista(ctx.state, { fecha: hoy });
    ctx.ui.compra = { ...emptyCompra(), vista: 'preparar' };
    ctx.commit(`Lista abierta. Toca lo que vayas a llevar en esta salida.`);
    return lista;
  },
  'compra-vista': (el, ctx) => {
    ctx.ui.compra.vista = el.dataset.vista === 'lista' ? 'lista' : 'preparar';
    ctx.ui.compra.poniendo = '';
    ctx.render();
  },
  'compra-limpiar-busqueda': (el, ctx) => { ctx.ui.compra.busqueda = ''; ctx.render(); },

  // Abrir la casilla de «¿cuánto?» de un producto. Una cada vez.
  'compra-poner': (el, ctx) => {
    ctx.ui.compra.poniendo = el.dataset.id;
    ctx.render();
  },
  'compra-cancelar-poner': (el, ctx) => { ctx.ui.compra.poniendo = ''; ctx.render(); },

  'compra-ocasional': (el, ctx) => {
    Object.assign(ctx.ui.compra, { anadiendo: true, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
  },
  'compra-cancelar-ocasional': (el, ctx) => {
    Object.assign(ctx.ui.compra, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
  },

  // Un toque. Es lo único que se hace con el carrito en la otra mano.
  'compra-tachar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    const linea = lista?.lineas.find(row => row.id === el.dataset.id);
    if (!linea) return;
    marcarComprado(ctx.state, lista.id, linea.id, !linea.comprado);
    ctx.commit('');
  },
  'compra-quitar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    quitarDeLista(ctx.state, lista.id, el.dataset.id);
    ctx.commit('');
  },

  /* ── Terminar ───────────────────────────────────────────────────────────

     Se cierra la que estaba y se abre una vacía para la próxima salida. No se
     borra ni se toca nada de los productos habituales: esa lista es el catálogo
     de la casa y no tiene nada que ver con una salida concreta. */
  'compra-terminar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    const resumen = resumenDeLista(lista);
    if (!lista.lineas.length && !window.confirm('Esta lista está vacía. ¿Terminarla igual?')) return;
    cerrarLista(ctx.state, lista.id);
    crearLista(ctx.state, { fecha: hoy });
    ctx.ui.compra = { ...emptyCompra(), vista: 'preparar' };
    ctx.commit(`Compra guardada: ${resumen.comprados} de ${resumen.total} cosa(s).${resumen.pendientes ? ` ${resumen.pendientes} se quedaron sin conseguir y quedan anotadas.` : ''} Ya tienes lista la próxima.`);
  },

  'compra-ver-historial': (el, ctx) => { ctx.ui.compra.verHistorial = !el.closest('details').open; }
};

export const COMPRA_FORMS = {
  // Cuánto se lleva de un habitual esta vez. La cantidad puede ir en blanco:
  // hay quien la decide delante del estante.
  'compra-poner': (form, data, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) throw new Error('No hay ninguna compra abierta.');
    const item = product(ctx.state, form.dataset.id);
    if (!item) throw new Error('Ese alimento ya no existe.');
    agregarALista(ctx.state, lista.id, {
      productId: item.id,
      cantidad: data.get('cantidad'),
      unidad: data.get('unidad')
    });
    ctx.ui.compra.poniendo = '';
    ctx.commit(`${item.name} en la lista.`);
  },

  'compra-ocasional': (form, data, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) throw new Error('No hay ninguna compra abierta.');
    const nombre = String(data.get('nombre') || '').trim();
    ctx.ui.compra.nombreNuevo = nombre;
    if (nombre.length < 2) {
      ctx.ui.compra.errorNuevo = 'Escribe qué hay que comprar.';
      ctx.render();
      return;
    }
    const habitual = data.get('habitual') === '1';
    agregarOcasional(ctx.state, lista.id, {
      nombre, habitual,
      cantidad: data.get('cantidad'),
      unidad: data.get('unidad')
    });
    Object.assign(ctx.ui.compra, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    ctx.commit(habitual
      ? `«${nombre}» en la lista, y guardado en tus productos habituales para la próxima.`
      : `«${nombre}» en la lista, solo para esta compra.`);
  },

  // Lo que de verdad se trajo. Dos latas pedidas y una traída son una anotada y
  // una pendiente, no un renglón hecho ni un renglón en blanco.
  'compra-parcial': (form, data, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    const linea = anotarComprado(ctx.state, lista.id, form.dataset.id, data.get('comprada'));
    const falta = pendienteDe(linea);
    ctx.commit(linea.comprado
      ? ''
      : `Anotado. ${falta ? `Faltan ${cuanto(falta, linea.unidad)}` : 'Queda pendiente'}.`);
  }
};


