// «Preparar mi casa»: los primeros cinco minutos.
//
// El orden viejo pedía crear cada producto, luego sus unidades, luego cuánto
// había, luego cómo se compraba, y solo entonces dejaba escribir la canasta. Se
// podía recorrer la app entera sin completar nada, porque cada pantalla exigía
// haber terminado otra. Eso no es un problema de diseño gráfico: es el orden
// invertido. Aquí va al derecho.
//
// La regla que gobierna este archivo: el usuario escribe una cosa una vez, y la
// app la reutiliza donde haga falta. Marcar «Arroz» en el catálogo inicial lo
// registra en el catálogo, lo pone en la canasta base y lo pone en la canasta
// del mes. Tres sitios, un toque.
//
// Y nada es obligatorio. Se puede salir en cualquier paso y volver después: lo
// elegido queda en `ui.setup`, y lo guardado ya está guardado.

import { CATEGORIES, SEED_PRODUCTS, seedByCategory } from './catalog-seed.js';
import { addProduct, productByName, setBaseBasket, openMonthBasket, setMonthBasket, shoppingList, todayISO, upsertPerson, baseLines, product } from './model.js';
import { button, esc, fmt, measure, monthName, notice, options } from './ui-kit.js';
import { UNITS } from './model.js';

export const PASOS = [
  { id: 1, titulo: 'La casa', corto: 'La casa' },
  { id: 2, titulo: '¿Por dónde empezamos?', corto: 'Empezar' },
  { id: 3, titulo: 'Lo que se come en tu casa', corto: 'Alimentos' },
  { id: 4, titulo: '¿Cuánto al mes?', corto: 'Cantidades' },
  { id: 5, titulo: 'Tu primera canasta', corto: 'Listo' }
];

export const emptySetup = () => ({
  paso: 1,
  adultos: 2,
  ninos: 0,
  nombres: [],
  via: 'catalogo',
  elegidos: [],
  cantidades: {},
  categoria: CATEGORIES[0].id,
  busqueda: '',
  guardado: false
});

const unitOptions = selected => options(UNITS.map(unit => [unit, unit]), selected);
const seedByName = nombre => SEED_PRODUCTS.find(item => item.name === nombre);

/* ── Dibujo ────────────────────────────────────────────────────────────── */

function barra(paso) {
  return `<div class="setup-steps" role="list" aria-label="Progreso de la configuración">
    ${PASOS.map(item => `<div class="setup-step ${item.id === paso ? 'now' : item.id < paso ? 'done' : ''}" role="listitem" ${item.id === paso ? 'aria-current="step"' : ''}>
      <span class="setup-dot" aria-hidden="true">${item.id < paso ? '✓' : item.id}</span><span class="setup-label">${esc(item.corto)}</span></div>`).join('')}
  </div><div class="progress setup-progress"><span style="width:${Math.round(paso / PASOS.length * 100)}%"></span></div>`;
}

function pasoCasa(setup) {
  const total = Number(setup.adultos) + Number(setup.ninos);
  return `<form data-form="setup-casa" class="stack">
    <p class="muted">Con saber cuántos son ya se puede calcular una compra. Los nombres y lo que cada quien evita se pueden poner ahora o después: <strong>nada de esto detiene el proceso</strong>.</p>
    <div class="form-grid">
      <label class="field"><span>Adultos</span><input name="adultos" type="number" min="0" max="20" inputmode="numeric" value="${esc(setup.adultos)}" required></label>
      <label class="field"><span>Niños</span><input name="ninos" type="number" min="0" max="20" inputmode="numeric" value="${esc(setup.ninos)}" required></label>
    </div>
    <details class="more" ${setup.nombres.length ? 'open' : ''}>
      <summary>Poner los nombres (opcional)</summary>
      <p class="small muted">Sirve para marcar quién no come en casa un día, o qué evita cada quien. Sin nombres la app funciona igual.</p>
      <div data-setup-names>${(setup.nombres.length ? setup.nombres : ['']).map((nombre, index) => filaNombre(nombre, index)).join('')}</div>
      ${button('+ Otra persona', 'setup-add-name', 'btn-secondary btn-small')}
    </details>
    <div class="modal-actions setup-actions">
      <span class="muted small">${total} persona${total === 1 ? '' : 's'} en casa</span>
      <button type="submit" class="btn btn-primary">Continuar</button>
    </div>
  </form>`;
}

function filaNombre(nombre = '', index = 0) {
  return `<div class="item-row setup-name-row" data-setup-name>
    <label class="field"><span class="sr-only">Nombre de la persona</span><input name="nombre" value="${esc(nombre)}" placeholder="Ej. Sofía" autocomplete="off" aria-label="Nombre de la persona ${index + 1}"></label>
    <label class="field"><span class="sr-only">Qué no come</span><input name="evita" placeholder="Qué no come (opcional)" autocomplete="off" aria-label="Alimentos que evita"></label>
    <button type="button" class="btn btn-quiet remove-item" data-action="setup-remove-name" aria-label="Quitar esta persona">✕</button>
  </div>`;
}

// Las cuatro vías del paso 2. La recomendada va primera y marcada, pero las
// cuatro están disponibles: quien tiene las facturas a mano prefiere la cámara,
// y quien sabe de memoria lo que compra prefiere dictarlo de corrido.
const VIAS = [
  ['catalogo', '🧺', 'Elegir de una lista', 'Marcas lo que se come en tu casa de un catálogo dominicano. Es lo más rápido y no hay que escribir nada.', true],
  ['texto', '🗣️', 'Dictar o escribir mi compra', 'Escribes o dictas de corrido —«30 plátanos, 10 libras de arroz, 4 paquetes de salami»— y la app lo separa en filas para que las revises.', false],
  ['factura', '📷', 'Tomar fotos de facturas', 'De los últimos meses. La app busca lo que se repite y propone tu canasta. Necesita un servicio de lectura configurado.', false],
  ['manual', '✍️', 'Empezar a mano', 'Sin catálogo ni atajos: vas creando lo tuyo uno por uno.', false]
];

function pasoVia(setup, servicios) {
  return `<p class="muted">Todas llegan al mismo sitio: una lista de lo que tu casa consume en un mes. Elige la que te resulte más cómoda.</p>
    <div class="setup-ways">${VIAS.map(([id, icono, titulo, detalle, recomendada]) => {
      const bloqueada = id === 'factura' && !servicios.vision;
      return `<button type="button" class="setup-way ${setup.via === id ? 'chosen' : ''} ${bloqueada ? 'blocked' : ''}" data-action="setup-via" data-via="${id}" ${bloqueada ? 'aria-describedby="aviso-factura"' : ''}>
        <span class="setup-way-icon" aria-hidden="true">${icono}</span>
        <span class="setup-way-text"><strong>${esc(titulo)}${recomendada ? ' <span class="pill">Recomendado</span>' : ''}</strong><span>${esc(detalle)}</span>
        ${bloqueada ? '<span class="pill warm" id="aviso-factura">Falta configurar el servicio</span>' : ''}</span></button>`;
    }).join('')}</div>
    <div class="modal-actions setup-actions">${button('Atrás', 'setup-back', 'btn-quiet')}<span class="tour-spacer"></span>${button('Continuar', 'setup-next', 'btn-primary')}</div>`;
}

function pasoCatalogo(setup) {
  const elegidos = new Set(setup.elegidos);
  const busqueda = String(setup.busqueda || '').trim().toLocaleLowerCase('es');
  const lista = busqueda
    ? SEED_PRODUCTS.filter(item => item.name.toLocaleLowerCase('es').includes(busqueda) || item.aliases.some(alias => alias.includes(busqueda)))
    : seedByCategory(setup.categoria);
  const habituales = seedByCategory(setup.categoria).filter(item => item.common);
  return `<p class="muted">Marca lo que de verdad se come en tu casa. Nada se marca solo: <strong>esto no llena tu despensa</strong>, solo te ahorra escribir los nombres.</p>
    <label class="field setup-search"><span class="sr-only">Buscar un alimento</span>
      <input type="search" id="setup-buscar" value="${esc(setup.busqueda)}" placeholder="Buscar en las ${SEED_PRODUCTS.length} opciones…" autocomplete="off" aria-label="Buscar un alimento">
    </label>
    ${busqueda ? '' : `<div class="setup-cats" role="tablist" aria-label="Categorías">${CATEGORIES.map(cat => `<button type="button" role="tab" aria-selected="${cat.id === setup.categoria}" class="setup-cat ${cat.id === setup.categoria ? 'active' : ''}" data-action="setup-cat" data-cat="${cat.id}"><span aria-hidden="true">${cat.emoji}</span> ${esc(cat.label)}<span class="setup-cat-count">${seedByCategory(cat.id).filter(item => elegidos.has(item.name)).length || ''}</span></button>`).join('')}</div>`}
    ${busqueda || !habituales.length ? '' : `<div class="inline setup-bulk">${button(`Marcar los ${habituales.length} más habituales`, 'setup-mark-common', 'btn-secondary btn-small')}</div>`}
    <div class="setup-chips">${lista.map(item => `<label class="check-chip setup-chip ${elegidos.has(item.name) ? 'on' : ''}">
      <input type="checkbox" data-action="setup-toggle" data-name="${esc(item.name)}" ${elegidos.has(item.name) ? 'checked' : ''}>
      <span>${esc(item.name)}<span class="muted tiny">${esc(item.controlUnit)}</span></span></label>`).join('') || '<p class="muted">Nada coincide con esa búsqueda. Puedes escribirlo a mano en el paso siguiente.</p>'}</div>
    <div class="modal-actions setup-actions">${button('Atrás', 'setup-back', 'btn-quiet')}<span class="tour-spacer"></span><span class="pill">${setup.elegidos.length} marcado${setup.elegidos.length === 1 ? '' : 's'}</span>${button('Continuar', 'setup-next', 'btn-primary', setup.elegidos.length ? '' : 'disabled')}</div>`;
}

// Todo en una sola pantalla editable. Abrir un formulario por alimento para
// veinte alimentos es exactamente lo que hacía que nadie terminara.
function pasoCantidades(setup) {
  const filas = setup.elegidos.map(nombre => {
    const semilla = seedByName(nombre);
    const guardada = setup.cantidades[nombre] || {};
    return { nombre, unidad: guardada.unidad || semilla?.controlUnit || 'unidad', cantidad: guardada.cantidad ?? '' };
  });
  const pendientes = filas.filter(fila => fila.cantidad === '' || fila.cantidad === null).length;
  return `<form data-form="setup-cantidades">
    <p class="muted">Cuánto se consume en un <strong>mes completo</strong>. Si no lo sabes, déjalo vacío: el alimento se guarda igual y la cantidad queda pendiente. Al comprar por quincena la app pide la mitad.</p>
    <div class="setup-amounts" data-setup-amounts>${filas.map(fila => filaCantidad(fila)).join('')}</div>
    <div class="inline" style="margin-top:12px">${button('+ Añadir otro alimento', 'setup-add-amount', 'btn-secondary btn-small')}</div>
    ${pendientes ? notice(`${pendientes} sin cantidad.`, 'Se guardan igual y se pueden completar cuando lo sepas. Mientras tanto no entran en el cálculo de la compra.') : ''}
    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-back', 'btn-quiet')}<span class="tour-spacer"></span>
      <button type="submit" name="intent" value="later" class="btn btn-secondary">Guardar y seguir después</button>
      <button type="submit" name="intent" value="done" class="btn btn-primary">Guardar ${filas.length} alimento${filas.length === 1 ? '' : 's'}</button>
    </div>
  </form>`;
}

function filaCantidad({ nombre = '', unidad = 'unidad', cantidad = '' } = {}) {
  return `<div class="item-row setup-amount-row" data-setup-amount>
    <label class="field setup-amount-name"><span class="sr-only">Alimento</span>
      <input name="nombre" list="lista-de-semillas" value="${esc(nombre)}" placeholder="Ej. Arroz" autocomplete="off" required aria-label="Nombre del alimento"></label>
    <label class="field"><span class="sr-only">Cantidad al mes</span>
      <input name="cantidad" type="number" min="0" step="any" inputmode="decimal" value="${esc(cantidad)}" placeholder="Al mes" aria-label="Cantidad de ${esc(nombre)} al mes"></label>
    <label class="field"><span class="sr-only">Unidad</span><select name="unidad" aria-label="Unidad de ${esc(nombre)}">${unitOptions(unidad)}</select></label>
    <button type="button" class="btn btn-quiet remove-item" data-action="setup-remove-amount" aria-label="Quitar ${esc(nombre)}">✕</button>
  </div>`;
}

function pasoResultado(state, setup) {
  const mes = todayISO().slice(0, 7);
  const lineas = baseLines(state);
  const conCantidad = lineas.filter(line => line.quantity !== null);
  let lista = null;
  try { lista = shoppingList(state, `${mes}-01`, `${mes}-15`, 'mensual'); } catch { lista = null; }
  const porComprar = lista ? lista.lines.filter(line => line.shortfall > 0) : [];
  return `<div class="setup-done">
    <span class="setup-done-mark" aria-hidden="true">✓</span>
    <h3>Tu casa ya está preparada</h3>
    <p class="muted">${lineas.length} alimento${lineas.length === 1 ? '' : 's'} en tu canasta base${conCantidad.length < lineas.length ? `, ${lineas.length - conCantidad.length} con la cantidad pendiente` : ''}. Esto se escribe una vez: los meses siguientes salen de aquí.</p>
  </div>
  ${lineas.length ? `<div class="card table-wrap"><table class="data-table"><thead><tr><th>Alimento</th><th class="num">Al mes</th></tr></thead><tbody>${lineas.map(line => `<tr><td>${esc(product(state, line.productId)?.name || '')}</td><td class="num strong">${line.quantity === null ? '<span class="pill gray">pendiente</span>' : measure(line.quantity, line.unit)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${porComprar.length ? `<div class="section-head"><div><h3>Y esta sería la compra de la primera quincena de ${esc(monthName(mes))}</h3><p>La mitad de la canasta, menos lo que ya tengas en casa.</p></div></div>
    <div class="card table-wrap"><table class="data-table"><thead><tr><th>Alimento</th><th class="num">Por comprar</th></tr></thead><tbody>${porComprar.slice(0, 12).map(line => `<tr><td>${esc(product(state, line.productId)?.name || '')}</td><td class="num strong">${line.purchaseQuantity === null ? '—' : measure(line.purchaseQuantity, line.purchaseUnit)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${notice('Lo demás es opcional.', 'El menú día por día, las preparaciones y las personas están ahí cuando los quieras, pero no hacen falta para comprar. Puedes usar la app solo con la canasta.')}
  <div class="modal-actions setup-actions">${button('Ver mi compra', 'setup-finish', 'btn-primary', 'data-goto="compras"')}${button('Ver el recorrido', 'setup-tour', 'btn-secondary')}</div>`;
}

export function renderSetup(ctx) {
  const { state, ui } = ctx;
  const setup = ui.setup;
  const servicios = ctx.servicios || { vision: false, chat: false, transcribe: false };
  const cuerpo = setup.paso === 1 ? pasoCasa(setup)
    : setup.paso === 2 ? pasoVia(setup, servicios)
    : setup.paso === 3 ? pasoCatalogo(setup)
    : setup.paso === 4 ? pasoCantidades(setup)
    : pasoResultado(state, setup);
  return `<section class="setup">
    <div class="setup-head">
      <div><p class="eyebrow">Paso ${setup.paso} de ${PASOS.length}</p><h2>${esc(PASOS[setup.paso - 1].titulo)}</h2></div>
      ${setup.paso < 5 ? button('Salir', 'setup-exit', 'btn-quiet btn-small') : ''}
    </div>
    ${barra(setup.paso)}
    <datalist id="lista-de-semillas">${SEED_PRODUCTS.map(item => `<option value="${esc(item.name)}"></option>`).join('')}</datalist>
    <div class="setup-body">${cuerpo}</div>
  </section>`;
}

/* ── Guardado ──────────────────────────────────────────────────────────── */

// Un alimento elegido entra en tres sitios de una vez: el catálogo, la canasta
// base y la canasta del mes corriente. Es literalmente la regla del encargo —una
// información se escribe una vez— hecha código.
export function aplicarSeleccion(state, filas) {
  const mes = todayISO().slice(0, 7);
  const lineas = [];
  for (const fila of filas) {
    const nombre = String(fila.nombre || '').trim();
    if (!nombre) continue;
    const semilla = seedByName(nombre);
    let item = productByName(state, nombre);
    if (!item) {
      item = addProduct(state, {
        name: nombre,
        controlUnit: fila.unidad || semilla?.controlUnit || 'unidad',
        purchaseUnit: semilla?.purchaseUnit || fila.unidad || 'unidad',
        category: semilla?.category || 'otros',
        aliases: semilla?.aliases || [],
        origin: semilla ? 'catalogo' : 'manual'
      });
    }
    lineas.push({ id: undefined, productId: item.id, quantity: fila.cantidad === '' || fila.cantidad === undefined ? null : fila.cantidad, unit: fila.unidad || item.controlUnit, priority: semilla?.common ? 'obligatorio' : 'frecuente' });
  }
  // Se añade a lo que ya hubiera: quien vuelve al asistente para agregar cuatro
  // cosas no debería perder las veinte de la vez pasada.
  const previas = baseLines(state).filter(line => !lineas.some(nueva => nueva.productId === line.productId));
  setBaseBasket(state, [...previas, ...lineas]);
  openMonthBasket(state, mes);
  setMonthBasket(state, mes, baseLines(state).map(line => ({ ...line, id: undefined })));
  return lineas.length;
}

export function aplicarPersonas(state, personas) {
  let creadas = 0;
  for (const persona of personas) {
    const nombre = String(persona.nombre || '').trim();
    if (!nombre) continue;
    if (state.people.some(item => item.name === nombre)) continue;
    // Lo que evita se guarda por nombre aunque el alimento todavía no exista:
    // se enlaza solo en cuanto aparezca. Bloquear aquí sería volver al orden
    // invertido que estamos arreglando.
    const evita = String(persona.evita || '').split(/[,;]/).map(text => text.trim()).filter(Boolean);
    upsertPerson(state, { name: nombre, restrictions: [], pendingRestrictions: evita, habitual: [] });
    creadas++;
  }
  return creadas;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

const leerFilas = (selector, campos) => [...document.querySelectorAll(selector)].map(row =>
  Object.fromEntries(campos.map(campo => [campo, row.querySelector(`[name="${campo}"]`)?.value ?? ''])));

export const SETUP_ACTIONS = {
  'setup-open': (el, ctx) => { ctx.ui.setup = ctx.ui.setup || emptySetup(); ctx.ui.page = 'setup'; ctx.ui.modal = null; ctx.render(); },
  'setup-exit': (el, ctx) => { ctx.ui.page = 'hoy'; ctx.render(); ctx.toast('Puedes retomarlo cuando quieras desde Hoy.'); },
  'setup-back': (el, ctx) => { ctx.ui.setup.paso = Math.max(1, ctx.ui.setup.paso - 1); ctx.render(); },
  'setup-next': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (setup.paso === 2) {
      // Las vías que no son el catálogo salen del asistente a su propia
      // pantalla: no tiene sentido envolver una cámara en cinco pasos.
      if (setup.via === 'texto') { ctx.ui.page = 'compras'; ctx.openModal('bulk', { destino: 'base', desdeSetup: true }); return; }
      if (setup.via === 'factura') { ctx.ui.page = 'compras'; ctx.openModal('invoice', { desdeSetup: true }); return; }
      if (setup.via === 'manual') { ctx.ui.page = 'compras'; ctx.openModal('basket'); return; }
    }
    setup.paso = Math.min(PASOS.length, setup.paso + 1);
    ctx.render();
  },
  'setup-via': (el, ctx) => { ctx.ui.setup.via = el.dataset.via; ctx.render(); },
  'setup-cat': (el, ctx) => { ctx.ui.setup.categoria = el.dataset.cat; ctx.ui.setup.busqueda = ''; ctx.render(); },
  'setup-toggle': (el, ctx) => {
    const setup = ctx.ui.setup, nombre = el.dataset.name;
    setup.elegidos = el.checked ? [...new Set([...setup.elegidos, nombre])] : setup.elegidos.filter(item => item !== nombre);
    // Sin redibujar: marcar veinte casillas no debe repintar la pantalla veinte
    // veces ni perder el sitio del desplazamiento. Solo se actualiza el contador.
    el.closest('.setup-chip')?.classList.toggle('on', el.checked);
    const contador = document.querySelector('.setup-actions .pill');
    if (contador) contador.textContent = `${setup.elegidos.length} marcado${setup.elegidos.length === 1 ? '' : 's'}`;
    const seguir = document.querySelector('.setup-actions [data-action="setup-next"]');
    if (seguir) seguir.disabled = !setup.elegidos.length;
  },
  'setup-mark-common': (el, ctx) => {
    const setup = ctx.ui.setup;
    const nombres = seedByCategory(setup.categoria).filter(item => item.common).map(item => item.name);
    setup.elegidos = [...new Set([...setup.elegidos, ...nombres])];
    ctx.render();
    ctx.toast(`${nombres.length} alimento(s) marcados. Quita los que no apliquen.`);
  },
  'setup-add-name': (el, ctx) => el.closest('details')?.querySelector('[data-setup-names]')?.insertAdjacentHTML('beforeend', filaNombre()),
  'setup-remove-name': el => el.closest('[data-setup-name]')?.remove(),
  'setup-add-amount': (el, ctx) => {
    const lista = el.closest('form').querySelector('[data-setup-amounts]');
    lista.insertAdjacentHTML('beforeend', filaCantidad());
    lista.lastElementChild.querySelector('input')?.focus();
  },
  'setup-remove-amount': el => el.closest('[data-setup-amount]')?.remove(),
  'setup-finish': (el, ctx) => { ctx.ui.page = el.dataset.goto || 'compras'; ctx.ui.shopBasis = 'mensual'; ctx.ui.setup = null; ctx.render(); },
  'setup-tour': (el, ctx) => { ctx.ui.setup = null; ctx.startTour(); }
};

export const SETUP_FORMS = {
  'setup-casa': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    setup.adultos = Math.max(0, Number(data.get('adultos')) || 0);
    setup.ninos = Math.max(0, Number(data.get('ninos')) || 0);
    setup.nombres = leerFilas('[data-setup-name]', ['nombre', 'evita']).filter(fila => fila.nombre.trim());
    const creadas = aplicarPersonas(ctx.state, setup.nombres);
    setup.paso = 2;
    ctx.commit(creadas ? `${creadas} persona(s) registradas.` : '');
  },
  'setup-cantidades': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    const filas = leerFilas('[data-setup-amount]', ['nombre', 'cantidad', 'unidad']).filter(fila => fila.nombre.trim());
    if (!filas.length) throw new Error('Marca al menos un alimento antes de guardar.');
    setup.cantidades = Object.fromEntries(filas.map(fila => [fila.nombre, { cantidad: fila.cantidad, unidad: fila.unidad }]));
    setup.elegidos = filas.map(fila => fila.nombre);
    const guardados = aplicarSeleccion(ctx.state, filas.map(fila => ({ nombre: fila.nombre, cantidad: fila.cantidad, unidad: fila.unidad })));
    setup.guardado = true;
    if (data.get('intent') === 'later') {
      ctx.ui.page = 'compras';
      ctx.ui.setup = null;
      ctx.commit(`${guardados} alimento(s) guardados. Puedes seguir cuando quieras.`);
      return;
    }
    setup.paso = 5;
    ctx.commit(`${guardados} alimento(s) guardados en tu canasta.`);
  }
};
