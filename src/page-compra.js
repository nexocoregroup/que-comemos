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
  actualizarLineaDeLista, agregarALista, agregarOcasional, anotarComprado, cerrarLista, crearLista,
  habitualesPorRubro, listasAbiertas, listasCerradas, marcarComprado, pendienteDe, product, quitarDeLista,
  reabrirLista, restore, resumenDeLista, snapshot, todayISO, trasladarPendientes
} from './model.js';
import { RUBROS } from './catalog-seed.js';
import {
  button, conteo, empty, esc, measure, modal, niceDate, notice, options
} from './ui-kit.js';
import { icono, iconoDeCategoria } from './icons.js';
import { normalizeName } from './nombres.js';

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
    // Qué renglón tiene abierta la casilla de corregir la cantidad pedida.
    editando: '',
    anadiendo: false,
    nombreNuevo: '',
    errorNuevo: '',
    // La foto del estado justo antes de lo último que se deshizo o se cerró.
    // Quitar un renglón y terminar una compra son las dos cosas de esta pantalla
    // que cuesta recuperar a mano, y las dos se hacen andando y con una mano.
    // Vive en `ui` y no en el estado guardado a propósito: deshacer vale para
    // este rato, no para mañana.
    deshacer: null,
    avisoDeshacer: '',
    verHistorial: false,
    // Cuántas compras cerradas se enseñan. Eran doce fijas, y debajo ponía «Y 14
    // más.» en gris y sin botón: catorce compras suyas, guardadas y ocupando
    // sitio, que no había forma de mirar. Y es el único sitio de la app donde se
    // puede contestar «¿cuándo compramos aceite la última vez?».
    cuantasCerradas: DE_DOCE_EN_DOCE
  };
}

const DE_DOCE_EN_DOCE = 12;

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
          ? `${conteo(resumen.total, 'cosa apuntada', 'cosas apuntadas')} · ${resumen.pendientes} por buscar`
          : 'Todavía no has apuntado nada.'}</p>
      </div></div>
      <div class="segmented segmented-ancho compra-vistas">
        <button type="button" data-action="compra-vista" data-vista="preparar" class="${enPreparar ? 'active' : ''}">Preparar la compra</button>
        <button type="button" data-action="compra-vista" data-vista="lista" class="${enPreparar ? '' : 'active'}">Mi lista${resumen.total ? ` · ${resumen.total}` : ''}</button>
      </div>
    </div>
    ${avisoDeDeshacer(ctx)}
    ${enPreparar ? vistaPreparar(ctx, lista) : vistaLista(ctx, lista)}
    ${historial(ctx)}`;
}

// Lo último que se deshizo, dicho en voz alta y con su botón. Mismo patrón que
// `avisoDeCambio` en page-semana.js: un renglón que desaparece sin que la
// pantalla diga nada deja a cualquiera mirando a ver qué pasó, y andando por un
// pasillo no hay forma de saber si fue un toque tuyo o un fallo de la app.
function avisoDeDeshacer(ctx) {
  const { ui } = ctx;
  if (!ui.compra.avisoDeshacer) return '';
  const boton = ui.compra.deshacer
    ? `<div class="inline" style="margin-top:10px">${button(`${icono('deshacer', { tamano: 16 })}Deshacer`, 'compra-deshacer', 'btn-quiet btn-small')}</div>`
    : '';
  return notice(ui.compra.avisoDeshacer, boton);
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

    ${bloqueOcasional(ctx)}

    ${grupos.length ? grupos.map(grupo => bloqueDeRubro(ctx, grupo, yaEnLaLista)).join('')
      : habitualesPorRubro(state).length
        ? `<p class="muted">Nada coincide con «${esc(ui.compra.busqueda)}». Puedes añadirlo aquí abajo.</p>`
        : notice('Todavía no tienes productos habituales.',
            'Son los que tu casa compra de costumbre, y sirven para no acordarte de todo de cero cada vez. Se marcan en Mis productos habituales, o puedes apuntar aquí mismo lo de esta compra.')}

    ${total ? `<p class="tiny muted">${conteo(total, 'producto habitual', 'productos habituales')} a la vista. No hace falta marcarlos todos: solo lo de esta compra.</p>` : ''}`;
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

// Va en las dos vistas. Estando en el colmado con la lista abierta —que es
// cuando uno se acuerda del papel de aluminio o ve el aceite en oferta— había
// que cruzar a «Preparar la compra», bajar por los ocho rubros hasta el final,
// escribir, y volver a cruzar: cinco toques y dos viajes largos para apuntar
// algo que se tiene en la mano.
function bloqueOcasional(ctx, { enLista = false } = {}) {
  const { ui } = ctx;
  if (!ui.compra.anadiendo) {
    return `<div class="compra-ocasional-abrir">
      ${button(enLista ? '+ Apuntar algo más' : '+ Algo que no está en la lista', 'compra-ocasional', 'btn-secondary')}
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

/* Aquí había dos tarjetas: lo que faltaba arriba y «Ya en el carrito» abajo.
   Sobre el papel suena ordenado; en el pasillo era lo contrario. Tachabas el
   arroz y el renglón se iba de debajo del dedo a otra tarjeta más abajo, así
   que cada marca costaba volver a encontrar por dónde ibas. Con veinticinco
   cosas son veinticinco búsquedas, y es la razón por la que se acaba marcando
   todo de golpe al llegar a casa, que es cuando ya no sirve de nada.

   Ahora el renglón se queda donde está, tachado, y lo que separa la lista son
   los rubros: el mismo dato que el modelo guarda en cada línea desde siempre y
   que esta pantalla tiraba. Un rubro es un pasillo, así que la lista se lee una
   vez por pasillo en vez de entera por cada uno. Lo que decía «Ya en el
   carrito» lo dice ahora un contador, que no mueve nada de sitio. */

function vistaLista(ctx, lista) {
  const { state, ui } = ctx;
  const editando = ui.compra.editando || '';
  const resumen = resumenDeLista(lista);

  if (!lista.lineas.length) {
    return `${empty('canasta', 'La lista está vacía',
      'Ve a «Preparar la compra» y toca lo que vayas a llevar. Nada entra solo.',
      button('Preparar la compra', 'compra-vista', 'btn-primary', 'data-vista="preparar"'))}
      ${bloqueOcasional(ctx, { enLista: true })}`;
  }

  const grupos = porRubro(lista);
  const conRubros = grupos.length > 1;

  return `<p class="pantalla-intro">Un toque tacha lo que ya echaste al carrito. Si trajiste menos de lo que decía, anota cuánto y el resto se queda pendiente.</p>

    ${bloqueOcasional(ctx, { enLista: true })}

    <p class="compra-conteo" data-conteo><strong data-pendientes>${resumen.pendientes}</strong> por buscar · <span data-comprados>${resumen.comprados}</span> ya en el carrito</p>

    ${grupos.map(grupo => `${conRubros ? cabeceraDeRubro(grupo.rubro) : ''}
      <div class="card compra-lista">${grupo.lineas.map(linea => renglon(state, lista, linea, editando)).join('')}</div>`).join('')}

    <div class="card plan-ok" data-todo-hecho ${resumen.pendientes ? 'hidden' : ''}><span class="plan-ok-icono">✓</span><div><strong>No queda nada por buscar.</strong><span>Cuando salgas del supermercado, dale a «Terminar la compra».</span></div></div>

    <div class="modal-actions compra-acciones">
      ${button('Terminar la compra', 'compra-terminar', 'btn-primary btn-grande')}
    </div>
    <p class="tiny muted">Terminar la guarda con la fecha y lo que se pidió y se trajo de cada cosa, y abre una lista nueva para la próxima salida. Si queda algo sin conseguir, te pregunta si pasa a esa lista. Tus productos habituales no se tocan.</p>`;
}

// El rubro de cada renglón viene guardado desde que se apuntó —lo pone
// `agregarALista`— y hasta ahora se tiraba. Un renglón viejo, o de un rubro que
// ya no exista, cae en «Otros» en vez de desaparecer de la lista: que un
// renglón no se vea es lo único inaceptable en esta pantalla.
function porRubro(lista) {
  const grupos = new Map(RUBROS.map(rubro => [rubro.id, []]));
  for (const linea of lista.lineas) {
    grupos.get(grupos.has(linea.rubro) ? linea.rubro : 'otros').push(linea);
  }
  return [...grupos]
    .filter(([, lineas]) => lineas.length)
    .map(([rubro, lineas]) => ({ rubro, lineas }));
}

function cabeceraDeRubro(id) {
  const rubro = RUBROS.find(item => item.id === id);
  return `<h3 class="compra-rubro-titulo compra-lista-rubro">
    <span class="compra-rubro-icono">${iconoDeCategoria(id, { tamano: 18 })}</span>
    ${esc(rubro?.titulo || id)}
  </h3>`;
}

/* ── Marcar sin repintar la pantalla ───────────────────────────────────────

   Tachar es el gesto que más se repite en toda la app y el único que se hace de
   pie, con una mano y el carrito en la otra. Pasaba por `commit()`, que repinta
   `#app` entero: la lista volvía al principio y el foco se iba al cuerpo del
   documento. `guardar()` —guardar sin repintar— existe en app.js desde hace
   tiempo para exactamente esto, y no lo usaba nadie más que el asistente
   inicial.

   El renglón se vuelve a escribir con la MISMA función que lo pintó la primera
   vez, así que no hay dos sitios que puedan acabar diciendo cosas distintas. Lo
   único que se toca aparte es el contador de arriba y el cartel de «no queda
   nada», que son los dos trozos de la pantalla que dependen del conjunto.

   Si el renglón no estuviera en el DOM —otra vista, una pantalla a medio
   pintar— se repinta entero y ya: peor sería guardar y no enseñarlo. */
function repintarRenglon(ctx, lista, linea, foco = 'tachar') {
  const fila = [...document.querySelectorAll('.compra-renglon')]
    .find(nodo => nodo.dataset.renglon === linea.id);
  if (!fila) { ctx.render(); return; }
  const molde = document.createElement('div');
  molde.innerHTML = renglon(ctx.state, lista, linea, '');
  const nueva = molde.firstElementChild;
  if (!nueva) { ctx.render(); return; }
  fila.replaceWith(nueva);
  const destino = (foco === 'parcial' ? nueva.querySelector('[name="comprada"]') : null)
    || nueva.querySelector('[data-action="compra-tachar"]');
  // Sin salto: el renglón está donde estaba y `focus()` a secas desplazaría la
  // pantalla para «enseñarlo», que es justo lo que se vino a quitar.
  destino?.focus({ preventScroll: true });
  actualizarConteo(lista);
}

function actualizarConteo(lista) {
  const resumen = resumenDeLista(lista);
  const caja = document.querySelector('[data-conteo]');
  if (caja) {
    const pendientes = caja.querySelector('[data-pendientes]');
    const comprados = caja.querySelector('[data-comprados]');
    if (pendientes) pendientes.textContent = String(resumen.pendientes);
    if (comprados) comprados.textContent = String(resumen.comprados);
  }
  const hecho = document.querySelector('[data-todo-hecho]');
  if (hecho) hecho.hidden = resumen.pendientes > 0;
}

function renglon(state, lista, linea, editando) {
  const nombre = nombreDeLinea(state, linea);
  const falta = pendienteDe(linea);
  const pedido = cuanto(linea.cantidad, linea.unidad);
  const traido = cuanto(linea.comprada, linea.unidad);
  const aMedias = !linea.comprado && linea.comprada;

  // Corregir lo que se pidió. Es el único camino para arreglar algo escrito a
  // mano: un producto de los habituales se puede volver a tocar en «Preparar»,
  // pero «papel de aluminio» no está en ninguna otra parte.
  if (editando === linea.id) {
    return `<form data-form="compra-cantidad" data-id="${esc(linea.id)}" class="compra-poner compra-editar">
      <p class="compra-poner-nombre">${esc(nombre)}</p>
      <div class="compra-poner-campos">
        <label class="field"><span>¿Cuánto hace falta?</span>
          <input name="cantidad" type="number" min="0" step="any" inputmode="decimal" value="${linea.cantidad ?? ''}" placeholder="Sin cantidad" autofocus>
        </label>
        <label class="field"><span>Medida</span>
          <select name="unidad">${options(MEDIDAS, linea.unidad || 'unidad')}</select>
        </label>
      </div>
      <div class="inline compra-poner-acciones">
        <button type="submit" class="btn btn-primary btn-small">Guardar</button>
        ${button('Cancelar', 'compra-cancelar-editar', 'btn-quiet btn-small')}
      </div>
      <p class="tiny muted">Puedes dejarla en blanco: el renglón se queda sin cantidad.</p>
    </form>`;
  }

  /* La casilla de «traje» nace con lo que se pidió.

     Estaba vacía y con un «¿cuánto?» de marcador de posición, y al lado había un
     botón llamado «Editar cantidad» que preguntaba otra cosa —cuánto hace
     falta—. Dos controles sin etiqueta visible, en el único formulario de la app
     que se rellena de pie en un pasillo, y equivocarse no era inocuo:
     confundirlos borraba lo que la lista pedía.

     Ahora la casilla trae escrito lo que se apuntó al preparar la compra, que
     es lo que casi siempre se trae, así que lo normal es no escribir nada; y
     lleva su etiqueta a la vista, «Traje», delante. El botón vecino dice lo que
     hace. El `aria-label` del campo se fue a propósito: ganaba sobre el `<label
     for>` y dejaba ochenta renglones anunciando los ochenta «Cuánto trajiste»,
     sin decir de qué.

     `data-renglon` es cómo vuelve a encontrarse esta fila para reescribirla sola
     cuando se tacha, sin repintar la pantalla. Ver `repintarRenglon`. */
  return `<div class="compra-renglon ${linea.comprado ? 'tachado' : ''} ${aMedias ? 'a-medias' : ''}" data-renglon="${esc(linea.id)}">
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
        <label class="compra-parcial-etiqueta" for="parcial-${esc(linea.id)}">Traje<span class="sr-only"> de ${esc(nombre)}</span></label>
        <input id="parcial-${esc(linea.id)}" name="comprada" type="number" min="0" step="any" inputmode="decimal"
          value="${linea.comprada ?? linea.cantidad ?? ''}">
        <button type="submit" class="btn btn-quiet btn-small">Anotar</button>
      </form>`}
      ${button('Cambiar lo pedido', 'compra-editar', 'btn-quiet btn-small', `data-id="${esc(linea.id)}" aria-label="Cambiar cuánto hace falta de ${esc(nombre)}"`)}
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
  const tope = ui.compra.cuantasCerradas || DE_DOCE_EN_DOCE;
  const faltan = Math.max(0, cerradas.length - tope);
  return `<details class="plegable compra-historial" ${abiertas ? 'open' : ''}>
    <summary data-action="compra-ver-historial">Compras anteriores · ${cerradas.length}</summary>
    <p class="small muted">Lo que se apuntó y lo que se trajo de cada una. Es un recuerdo de lo que pasó, no una cuenta de lo que hay en casa.</p>
    ${cerradas.slice(0, tope).map(lista => {
      const resumen = resumenDeLista(lista);
      return `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(niceDate(lista.cerradaEl || lista.fecha, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <div class="list-row-sub">${resumen.comprados} de ${conteo(resumen.total, 'cosa traída', 'cosas traídas')}${resumen.pendientes ? ` · ${resumen.pendientes} se quedaron sin conseguir` : ''}</div>
          <div class="list-row-sub small muted">${lista.lineas.slice(0, 6).map(linea =>
            `${esc(nombreDeLinea(state, linea))}${linea.comprada ? ` (${esc(cuanto(linea.comprada, linea.unidad))})` : ''}`).join(' · ')}${lista.lineas.length > 6 ? ` y ${lista.lineas.length - 6} más` : ''}</div>
        </div>
      </div>`;
    }).join('')}
    ${faltan ? `<div class="inline compra-historial-mas">${button(`Ver ${conteo(Math.min(DE_DOCE_EN_DOCE, faltan), 'compra anterior', 'compras anteriores')}`, 'compra-mas-historial', 'btn-quiet btn-small')}</div>` : ''}
  </details>`;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

const ACCIONES = {
  'compra-nueva': (el, ctx) => {
    const lista = crearLista(ctx.state, { fecha: todayISO() });
    ctx.ui.compra = { ...emptyCompra(), vista: 'preparar' };
    ctx.commit(`Lista abierta. Toca lo que vayas a llevar en esta salida.`);
    return lista;
  },
  'compra-vista': (el, ctx) => {
    ctx.ui.compra.vista = el.dataset.vista === 'lista' ? 'lista' : 'preparar';
    ctx.ui.compra.poniendo = '';
    ctx.ui.compra.editando = '';
    ctx.render();
  },
  'compra-limpiar-busqueda': (el, ctx) => { ctx.ui.compra.busqueda = ''; ctx.render(); },

  // Abrir la casilla de «¿cuánto?» de un producto. Una cada vez.
  'compra-poner': (el, ctx) => {
    ctx.ui.compra.poniendo = el.dataset.id;
    ctx.render();
  },
  'compra-cancelar-poner': (el, ctx) => { ctx.ui.compra.poniendo = ''; ctx.render(); },

  // Se cierra la casilla de «¿cuánto?» que hubiera abierta: los dos formularios
  // traen `autofocus`, y con los dos a la vez el cursor cae en el que esté
  // primero en la pantalla, que no es el que se acaba de pedir.
  'compra-ocasional': (el, ctx) => {
    Object.assign(ctx.ui.compra, { anadiendo: true, nombreNuevo: '', errorNuevo: '', poniendo: '', editando: '' });
    // También se llega aquí desde el «+» flotante, y entonces hay una ventana
    // abierta encima del formulario que se acaba de desplegar.
    ctx.ui.modal = null;
    ctx.render();
  },
  'compra-cancelar-ocasional': (el, ctx) => {
    Object.assign(ctx.ui.compra, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
  },

  // Un toque. Es lo único que se hace con el carrito en la otra mano, así que
  // no repinta: guarda, reescribe su propio renglón y lo dice en voz alta por
  // la región viva. Sin el anuncio, quien usa TalkBack no tenía forma de saber
  // si el toque entró —`commit('')` va sin mensaje, así que ni el aviso
  // flotante salía—.
  'compra-tachar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    const linea = lista?.lineas.find(row => row.id === el.dataset.id);
    if (!linea) return;
    marcarComprado(ctx.state, lista.id, linea.id, !linea.comprado);
    ctx.guardar();
    repintarRenglon(ctx, lista, linea);
    ctx.anunciar(`${nombreDeLinea(ctx.state, linea)}, ${linea.comprado ? 'en el carrito' : 'sin marcar'}.`);
  },
  // Quitar era la única acción destructiva de la app que no preguntaba, no
  // avisaba y no se podía deshacer: se tocaba la equis y el renglón desaparecía
  // en silencio. Y se toca andando, al lado del botón de tachar. En vez de un
  // `confirm` —que a media compra estorba diez veces por una que salva— se dice
  // qué se quitó y se deja el camino de vuelta abierto.
  'compra-quitar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    const linea = lista.lineas.find(row => row.id === el.dataset.id);
    if (!linea) return;
    const nombre = linea.texto || product(ctx.state, linea.productId)?.name || 'Eso';
    const antes = snapshot(ctx.state);
    quitarDeLista(ctx.state, lista.id, el.dataset.id);
    ctx.ui.compra.deshacer = antes;
    ctx.ui.compra.avisoDeshacer = `«${nombre}» fuera de la lista.`;
    ctx.commit('');
  },
  'compra-deshacer': (el, ctx) => {
    if (!ctx.ui.compra.deshacer) return;
    restore(ctx.state, ctx.ui.compra.deshacer);
    ctx.ui.compra.deshacer = null;
    ctx.ui.compra.avisoDeshacer = '';
    ctx.commit('Deshecho.');
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
    // Lo que no se consiguió es una decisión, no un descarte automático. Se
    // pregunta una vez, con las dos respuestas escritas enteras, y solo cuando
    // hay algo que preguntar.
    if (resumen.pendientes) { ctx.openModal('compra-pendientes', { id: lista.id }); return; }
    terminar(ctx, lista, false);
  },
  'compra-cerrar': (el, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    terminar(ctx, lista, el.dataset.trasladar === '1');
  },
  'compra-editar': (el, ctx) => { ctx.ui.compra.editando = el.dataset.id; ctx.render(); },
  'compra-cancelar-editar': (el, ctx) => { ctx.ui.compra.editando = ''; ctx.render(); },

  'compra-ver-historial': (el, ctx) => { ctx.ui.compra.verHistorial = !el.closest('details').open; },
  'compra-mas-historial': (el, ctx) => {
    ctx.ui.compra.cuantasCerradas = (ctx.ui.compra.cuantasCerradas || DE_DOCE_EN_DOCE) + DE_DOCE_EN_DOCE;
    ctx.ui.compra.verHistorial = true;
    ctx.render();
  }
};

/* ── El deshacer caduca solo ───────────────────────────────────────────────

   `restore()` devuelve el estado ENTERO, no el último cambio. Si alguien quita
   un renglón, después tacha cinco cosas y entonces toca «Deshacer», los cinco
   tachados se irían con él —y en un pasillo del colmado eso es peor que el fallo
   que vinimos a arreglar—.

   Así que la foto solo vale mientras no haya pasado nada más. Cualquier otra
   acción o formulario de esta pantalla la tira, y el aviso se va con ella. Las
   cuatro de la lista blanca son las que crean el deshacer o lo consumen.

   Va envuelto aquí y no repetido dentro de cada acción para que una acción nueva
   no pueda olvidarse de hacerlo: el olvido es justo el fallo que se está
   arreglando. */
const CONSERVAN_EL_DESHACER = new Set(['compra-quitar', 'compra-terminar', 'compra-cerrar', 'compra-deshacer']);

const caducarDeshacer = (nombre, fn) => (el, ctx) => {
  if (!CONSERVAN_EL_DESHACER.has(nombre) && ctx.ui?.compra) {
    ctx.ui.compra.deshacer = null;
    ctx.ui.compra.avisoDeshacer = '';
  }
  return fn(el, ctx);
};

export const COMPRA_ACTIONS = Object.fromEntries(
  Object.entries(ACCIONES).map(([nombre, fn]) => [nombre, caducarDeshacer(nombre, fn)])
);

/* ── Cerrar una compra y abrir la siguiente ────────────────────────────────

   La lista cerrada no se toca: es el recuerdo de esa salida, con su fecha, lo
   que se pidió y lo que se trajo. Lo que se traslada es una copia de lo que
   falta, y solo si la persona lo pidió. */

function terminar(ctx, lista, trasladar) {
  const resumen = resumenDeLista(lista);
  // Terminar es la acción más grande de la pantalla y hasta ahora no tenía
  // vuelta: cerraba, abría la siguiente y ya. El modelo sabe reabrir desde
  // siempre —`reabrirLista`, con su prueba— y hasta el mensaje de error de
  // `agregarALista` lo promete («Ábrela otra vez si quieres cambiarla»), pero no
  // lo llamaba ninguna pantalla. La foto se toma antes de tocar nada.
  const antes = snapshot(ctx.state);
  cerrarLista(ctx.state, lista.id);
  const proxima = crearLista(ctx.state, { fecha: todayISO() });
  const movidas = trasladar ? trasladarPendientes(ctx.state, lista.id, proxima.id) : 0;
  ctx.ui.compra = { ...emptyCompra(), vista: movidas ? 'lista' : 'preparar' };
  ctx.ui.compra.deshacer = antes;
  ctx.ui.compra.avisoDeshacer = 'Compra terminada.';
  ctx.closeModal?.();
  ctx.commit(`Compra guardada: ${resumen.comprados} de ${conteo(resumen.total, 'cosa', 'cosas')}.${
    movidas ? ` ${conteo(movidas, 'cosa', 'cosas')} sin conseguir ${movidas === 1 ? 'pasa' : 'pasan'} a la próxima.` : resumen.pendientes ? ` ${resumen.pendientes} se quedan solo en el historial de esta compra.` : ''
  }`);
}

/* ── La ventana de lo que no se consiguió ──────────────────────────────── */

export function modalPendientes(ctx, m) {
  const { state } = ctx;
  const lista = state.listasDeCompra.find(item => item.id === m.id);
  if (!lista) return '';
  const faltan = lista.lineas.filter(linea => !linea.comprado);
  return modal('Quedaron cosas sin conseguir', 'Esta compra se guarda igual. La pregunta es qué pasa con lo que falta.',
    `<div class="stack">
      <ul class="food-list">${faltan.slice(0, 8).map(linea => {
        const falta = pendienteDe(linea);
        return `<li>${esc(nombreDeLinea(state, linea))}${falta ? ` · faltan ${esc(cuanto(falta, linea.unidad))}` : ''}</li>`;
      }).join('')}${faltan.length > 8 ? `<li class="muted">y ${faltan.length - 8} más</li>` : ''}</ul>
      <div class="opcion-larga">
        <button type="button" class="radio-bloque" data-action="compra-cerrar" data-trasladar="1"><span><strong>Pasarlas a la próxima compra</strong>Aparecerán ya apuntadas en la lista nueva, con lo que falta de cada una.</span></button>
        <button type="button" class="radio-bloque" data-action="compra-cerrar" data-trasladar=""><span><strong>Dejarlas solo en el historial</strong>La próxima lista empieza vacía. Esta compra sigue diciendo qué no se consiguió.</span></button>
      </div>
      <div class="modal-actions">${button('Todavía no termino', 'close-modal', 'btn-quiet')}</div>
    </div>`);
}

const FORMULARIOS = {
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

  // Corregir lo que se pidió. Distinto de anotar lo que se trajo: aquí se
  // arregla la lista —«no eran dos latas, eran cuatro»—, no se cuenta lo que
  // entró en el carrito.
  'compra-cantidad': (form, data, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) throw new Error('No hay ninguna compra abierta.');
    const linea = actualizarLineaDeLista(ctx.state, lista.id, form.dataset.id, {
      cantidad: data.get('cantidad'),
      unidad: data.get('unidad')
    });
    ctx.ui.compra.editando = '';
    ctx.commit(linea.cantidad === null
      ? 'Guardado sin cantidad.'
      : `Ahora dice ${cuanto(linea.cantidad, linea.unidad)}.`);
  },

  // Lo que de verdad se trajo. Dos latas pedidas y una traída son una anotada y
  // una pendiente, no un renglón hecho ni un renglón en blanco.
  //
  // Igual que tachar: esto también se hace de pie y también repintaba la
  // pantalla entera, así que mandaba la lista al principio justo después de
  // escribir un número. Se reescribe solo su renglón.
  'compra-parcial': (form, data, ctx) => {
    const lista = listaEnCurso(ctx.state);
    if (!lista) return;
    const linea = anotarComprado(ctx.state, lista.id, form.dataset.id, data.get('comprada'));
    const falta = pendienteDe(linea);
    const dicho = linea.comprado
      ? `${nombreDeLinea(ctx.state, linea)}, completo.`
      : `Anotado. ${falta ? `Faltan ${cuanto(falta, linea.unidad)}` : 'Queda pendiente'}.`;
    ctx.guardar();
    repintarRenglon(ctx, lista, linea, 'parcial');
    ctx.anunciar(dicho);
    if (!linea.comprado) ctx.toast(dicho);
  }
};

// Los formularios también caducan el deshacer: escribir una cantidad o apuntar
// algo nuevo es un cambio como cualquier otro. Ninguno lo conserva.
export const COMPRA_FORMS = Object.fromEntries(
  Object.entries(FORMULARIOS).map(([nombre, fn]) => [nombre, (form, data, ctx) => {
    if (ctx.ui?.compra) { ctx.ui.compra.deshacer = null; ctx.ui.compra.avisoDeshacer = ''; }
    return fn(form, data, ctx);
  }])
);


