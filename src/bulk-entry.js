// Registrar los alimentos de uno en uno es lo que hace que nadie termine de
// configurar la app: cuarenta formularios para escribir lo que se dice en una
// frase. Esta pantalla recibe el párrafo entero —«compramos 30 plátanos
// maduros, 10 libras de arroz…»— y lo convierte en filas que se revisan de un
// vistazo.
//
// La regla dura, y es la única que no se negocia: nada se guarda sin que la
// persona vea la tabla y confirme. Lo que se leyó con dudas se resalta y se
// explica en español; lo que no se entendió se conserva pendiente en vez de
// descartarse, igual que hace el parser. Perder el alimento es mucho peor que
// dejar un hueco que se llena en un toque.
//
// Todo el trabajo de leer texto lo hace `parseProductText`, que es determinista
// y no sale a internet. Aquí solo se decide qué hacer con cada fila y se dibuja.
//
// Aviso para quien integre este módulo en app.js: `ctx.bulk` se modifica en
// sitio (`Object.assign`), nunca se reemplaza. Si se reasignara, la referencia
// que guarda app.js seguiría apuntando al objeto viejo y la pantalla no
// avanzaría de paso.

import { CATEGORIES, SEED_PRODUCTS } from './catalog-seed.js';
import {
  UNITS, addProduct, agregarALista, anotarComprado, cerrarLista, crearLista, findSimilarProducts, habitualLines,
  normalizeName, product, productByName, setHabitualBasket,
  todayISO, transaction, updateProduct
} from './model.js';
import { parseProductText } from './text-parse.js';
import { button, esc, measure, notice, options, productDatalist, productField } from './ui-kit.js';

// La compra de una quincena cualquiera en una casa dominicana. Se usa de
// marcador de posición y detrás del botón «Usar el ejemplo»: quien nunca ha
// visto la pantalla necesita ver el tono, no una instrucción abstracta.
export const EJEMPLO = 'Compramos 30 plátanos maduros, 10 libras de arroz, 4 paquetes de salami, 30 huevos, 6 latas de atún y detergente.';

// Por encima de esto, dos nombres son casi con seguridad el mismo alimento y la
// fila arranca marcada para unir. Por debajo, el parecido se ofrece en la lista
// pero no se elige solo: unir dos alimentos mezcla dos inventarios y eso solo
// lo puede autorizar quien tiene la casa delante.
const UMBRAL_UNIR = 0.85;
// Cuántos parecidos se ofrecen arriba del todo en el desplegable de la fila.
const MAX_PARECIDOS = 4;
// Propio, para no chocar con el `datalist` que app.js dibuja en sus formularios:
// dos elementos con el mismo id en la página se pisan.
const LISTA = 'bulk-alimentos';

// Adónde van las filas confirmadas. El texto de cada destino vive aquí y no
// repartido por la pantalla porque el botón de guardar, el aviso y el mensaje
// final tienen que decir exactamente lo mismo.
const DESTINOS = {
  habitual: {
    opcion: 'Mis productos habituales: lo que se compra de costumbre',
    titulo: 'tus productos habituales',
    explica: 'Se añaden a la lista de lo que esta casa compra de costumbre, sin cantidades: los nombres. Lo que ya estaba se queda como estaba.',
    verbo: n => `Guardar ${n} ${alimentos(n)} en mis productos habituales`
  },
  compra: {
    opcion: 'Una compra que ya hiciste',
    titulo: 'tu historial de compras',
    explica: 'Queda anotada con su fecha, sus alimentos y sus cantidades. No cambia nada más: la app no lleva la cuenta de lo que hay en tu despensa.',
    verbo: n => `Guardar ${n} ${alimentos(n)} como compra hecha`
  },
  catalogo: {
    opcion: 'Catálogo: solo registrar los alimentos',
    titulo: 'el catálogo de alimentos',
    explica: 'Solo se registran los alimentos, sin cantidades. Sirve para tener los nombres puestos antes de escribir nada más.',
    verbo: n => `Registrar ${n} ${alimentos(n)} en el catálogo`
  }
};

// Las cuatro etiquetas que puede llevar una fila. El texto es lo que manda: el
// color solo lo acompaña, porque un estado que solo se ve por el color no
// existe para quien no distingue esos dos tonos.
const ESTADOS = {
  nuevo: { texto: 'nuevo', pill: '', nota: 'Se registrará como alimento nuevo.' },
  existe: { texto: 'ya existe', pill: 'gray', nota: '' },
  pendiente: { texto: 'pendiente', pill: 'warm', nota: 'Falta la cantidad. Se puede guardar así y escribirla después.' },
  dudoso: { texto: 'dudoso', pill: 'red', nota: 'No se entendió qué alimento es. Escribe el nombre o marca la fila para ignorarla.' },
  // No está entre los cuatro que se piden, pero enseñar «nuevo» en una fila que
  // no se va a guardar sería mentir justo donde más se mira.
  ignorada: { texto: 'se ignora', pill: 'gray', nota: 'Esta fila no se guardará.' }
};
const DESTACADOS = new Set(['pendiente', 'dudoso']);

const alimentos = n => (n === 1 ? 'alimento' : 'alimentos');
const texto = value => String(value ?? '').trim();
// Una sola letra no es el nombre de ningún alimento: el parser ya lo marca con
// confianza baja y aquí la fila no puede guardarse hasta que se corrija.
const utilizable = nombre => texto(nombre).length > 1;
const sinCantidad = fila => texto(fila.cantidad) === '';

// Índice de la semilla por nombre y por alias, construido una vez. Es lo que
// permite proponer la categoría —y la unidad cuando el texto no la trae— sin
// pedirle nada a quien escribe: «detergente» es limpieza y se cuenta en
// paquetes en cualquier casa de la isla.
const SEMILLAS = (() => {
  const mapa = new Map();
  for (const semilla of SEED_PRODUCTS) {
    for (const nombre of [semilla.name, ...(semilla.aliases || [])]) {
      const clave = normalizeName(nombre);
      if (clave && !mapa.has(clave)) mapa.set(clave, semilla);
    }
  }
  return mapa;
})();
const semillaDe = nombre => SEMILLAS.get(normalizeName(nombre)) || null;

/* ── El estado de la pantalla ──────────────────────────────────────────── */

export function emptyBulk(destino = 'habitual') {
  return {
    paso: 'escribir',
    texto: '',
    destino: destino in DESTINOS ? destino : 'habitual',
    filas: [],
    avisos: []
  };
}

// La decisión de cada fila viaja en un solo `select`, así que el valor lleva
// dentro con qué producto se une: `unir:producto-3`. Un control en vez de dos
// evita tener que volver a dibujar la tabla al cambiar de opción, que es lo que
// borraría lo que la persona acaba de escribir en las otras filas.
const leerAccion = valor => {
  const texto = String(valor || '');
  if (texto.startsWith('unir:')) return { accion: 'unir', unirCon: texto.slice(5) };
  return { accion: ['incluir', 'nuevo', 'ignorar'].includes(texto) ? texto : 'nuevo', unirCon: null };
};
const valorAccion = fila => (fila.accion === 'unir' && fila.unirCon ? `unir:${fila.unirCon}` : fila.accion);

// Qué alimento del catálogo representa esta fila, si es que representa alguno.
const productoDe = (state, fila) => (fila.accion === 'incluir' || fila.accion === 'unir' ? product(state, fila.unirCon) : null);

// El nombre escrito merece guardarse como alias cuando no es el que la ficha ya
// tiene ni uno de los que ya conoce: es lo que evita volver a preguntar lo
// mismo el mes que viene.
function alias(fila, item) {
  const clave = normalizeName(fila.nombre);
  if (!clave || clave === item.normalized) return null;
  return (item.aliases || []).some(valor => normalizeName(valor) === clave) ? null : texto(fila.nombre);
}

// Solo una compra que ya se hizo necesita cantidades: es un hecho que se está
// anotando. Lo que va a los habituales o al catálogo son nombres, y ahí una
// cantidad vacía no es nada que falte.
const pideCantidad = destino => destino === 'compra';

function estadoDe(fila, pide) {
  if (fila.accion === 'ignorar') return 'ignorada';
  if (!utilizable(fila.nombre)) return 'dudoso';
  // La cantidad que falta se enseña antes que el alimento del que se trata:
  // es lo único que la persona todavía tiene que decidir.
  if (pide && sinCantidad(fila)) return 'pendiente';
  return fila.accion === 'nuevo' ? 'nuevo' : 'existe';
}

// Lo que el catálogo ya sabe de este nombre: coincidencia exacta, parecidos
// ordenados y el más parecido si supera el umbral. Se recalcula cada vez que la
// fila se lee del formulario, porque el nombre es editable y cambiarlo puede
// convertir un alimento nuevo en uno que ya existía.
function cruzar(state, nombre) {
  if (!utilizable(nombre)) return { exacto: null, candidatos: [], parecido: null };
  const exacto = productByName(state, nombre) || null;
  const candidatos = findSimilarProducts(state, nombre, { limit: MAX_PARECIDOS })
    .filter(item => item.product.id !== exacto?.id)
    .map(item => ({ id: item.product.id, nombre: item.product.name, score: item.score }));
  const mejor = candidatos[0];
  return { exacto, candidatos, parecido: !exacto && mejor && mejor.score > UMBRAL_UNIR ? mejor : null };
}

// Una línea del parser convertida en fila revisable. Nada se decide en
// silencio: lo que se dedujo queda anotado para que la fila lo pueda explicar.
function construirFila(state, linea, indice) {
  const { exacto, candidatos, parecido } = cruzar(state, linea.name);
  const conocido = exacto || (parecido && product(state, parecido.id)) || null;
  const semilla = semillaDe(linea.name);
  // La unidad que se escribió manda siempre. Después, la de la ficha que ya
  // existe; después, la de la semilla. El último recurso es «unidad», y en ese
  // caso la fila lo dice: el desplegable trae algo escogible, no un dato que
  // alguien haya escrito.
  const unidad = linea.unit || conocido?.controlUnit || semilla?.controlUnit || 'unidad';
  const fila = {
    id: `fila-${indice + 1}`,
    texto: linea.raw,
    nombre: linea.name,
    cantidad: linea.quantity === null ? '' : String(linea.quantity),
    unidad,
    categoria: conocido?.category || semilla?.category || 'otros',
    accion: 'nuevo',
    unirCon: null,
    exacto: exacto?.id || null,
    candidatos,
    negada: linea.negated === true,
    confianza: linea.confidence,
    pendiente: linea.pending || [],
    aviso: linea.warning || null,
    unidadDeducida: !linea.unit,
    parecido: parecido ? parecido.nombre : null
  };
  if (exacto) { fila.accion = 'incluir'; fila.unirCon = exacto.id; }
  else if (parecido) { fila.accion = 'unir'; fila.unirCon = parecido.id; }
  // Sin nombre no hay nada que crear ni con qué unir: la fila arranca apagada,
  // pero se sigue viendo con su texto original para poder rescatarla.
  if (!utilizable(fila.nombre)) { fila.accion = 'ignorar'; fila.unirCon = null; }
  return fila;
}

function filaVacia(filas) {
  const numero = filas.reduce((mayor, fila) => Math.max(mayor, Number(String(fila.id).replace('fila-', '')) || 0), 0) + 1;
  return {
    id: `fila-${numero}`, texto: '', nombre: '', cantidad: '', unidad: 'unidad', categoria: 'otros',
    accion: 'nuevo', unirCon: null, exacto: null, candidatos: [], negada: false,
    confianza: 'alta', pendiente: [], aviso: null, unidadDeducida: false, parecido: null
  };
}

// El texto entero convertido en filas y avisos. Lo que el parser no supo leer
// no desaparece: se nombra arriba para que quien revisa pueda comprobar si le
// falta algo.
function leerTexto(state, valor) {
  const { lines, ignored } = parseProductText(valor);
  const avisos = [];
  if (!lines.length) avisos.push('No se reconoció ningún alimento en ese texto. Prueba a separar cada uno con una coma.');
  if (ignored.length) avisos.push(`Esto no nombraba ningún alimento y quedó fuera: ${ignored.map(item => `«${item}»`).join(', ')}.`);
  const filas = lines.map((linea, indice) => construirFila(state, linea, indice));
  const negadas = filas.filter(fila => fila.negada).length;
  if (negadas) avisos.push(`${negadas} ${negadas === 1 ? 'línea se entendió' : 'líneas se entendieron'} como «no comprar esto». ${negadas === 1 ? 'Está' : 'Están'} abajo, aparte, y no se ${negadas === 1 ? 'guardará' : 'guardarán'}.`);
  return { filas, avisos };
}

/* ── Leer la tabla de vuelta ───────────────────────────────────────────── */

// Cada acción de la pantalla vuelve a dibujarlo todo desde `ctx.bulk`, así que
// antes de tocar nada hay que recoger lo que la persona lleva escrito en la
// tabla. Sin esto, añadir una fila borraría las correcciones de las demás.
function leerFilas(state, form, filas) {
  const leidas = new Map();
  for (const tr of form.querySelectorAll('[data-bulk-row]')) {
    const id = tr.dataset.fila;
    const previa = filas.find(fila => fila.id === id);
    if (!previa) continue;
    const nombre = tr.querySelector('[data-bulk-nombre]')?.value ?? previa.nombre;
    const { accion, unirCon } = leerAccion(tr.querySelector('[data-bulk-accion]')?.value);
    const { exacto, candidatos } = cruzar(state, nombre);
    leidas.set(id, {
      ...previa,
      nombre,
      cantidad: tr.querySelector('[data-bulk-cantidad]')?.value ?? previa.cantidad,
      unidad: tr.querySelector('[data-bulk-unidad]')?.value || previa.unidad,
      categoria: tr.querySelector('[data-bulk-categoria]')?.value || previa.categoria,
      // Si el nombre se corrigió y ya no coincide con nada, «usarlo tal cual»
      // dejaría de tener sentido: pasa a crear uno nuevo.
      accion: accion === 'incluir' && !exacto ? 'nuevo' : accion,
      unirCon: accion === 'incluir' ? exacto?.id || null : unirCon,
      exacto: exacto?.id || null,
      candidatos
    });
  }
  // Las negadas no están en la tabla: se enseñan aparte y se conservan tal cual.
  return filas.map(fila => leidas.get(fila.id) || fila);
}

function sincronizar(el, ctx) {
  const form = el.closest?.('[data-form="bulk-revision"]');
  if (form) ctx.bulk.filas = leerFilas(ctx.state, form, ctx.bulk.filas);
  return ctx.bulk.filas;
}

/* ── Los dos resúmenes que tienen que decir la verdad ──────────────────── */

function textoCuenta(filas, pide) {
  const vivas = filas.filter(fila => fila.accion !== 'ignorar');
  const nuevos = vivas.filter(fila => fila.accion === 'nuevo' && utilizable(fila.nombre)).length;
  const pendientes = pide ? vivas.filter(fila => sinCantidad(fila) && utilizable(fila.nombre)).length : 0;
  const dudosos = vivas.filter(fila => !utilizable(fila.nombre)).length;
  const ignoradas = filas.length - vivas.length;
  const partes = [`${filas.length} ${filas.length === 1 ? 'producto leído' : 'productos leídos'}`];
  if (nuevos) partes.push(`${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}`);
  if (pendientes) partes.push(`${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'} de cantidad`);
  if (dudosos) partes.push(`${dudosos} sin nombre claro`);
  if (ignoradas) partes.push(`${ignoradas} que se ${ignoradas === 1 ? 'ignora' : 'ignoran'}`);
  return partes.join(' · ');
}

// Lo que se va a guardar de verdad: ni las ignoradas, ni las filas en blanco
// que quedaron de pulsar «Añadir otra fila».
const guardables = filas => filas.filter(fila => fila.accion !== 'ignorar' && (texto(fila.nombre) || texto(fila.cantidad)));

function textoGuardar(filas, destino) {
  const vivas = guardables(filas);
  // En el catálogo solo se registra lo que todavía no existe; decir «guardar 6»
  // cuando cuatro ya estaban sería prometer un trabajo que no se va a hacer.
  const cuenta = destino === 'catalogo' ? vivas.filter(fila => fila.accion === 'nuevo').length : vivas.length;
  return (DESTINOS[destino] || DESTINOS.habitual).verbo(cuenta);
}

/* ── Dibujo ────────────────────────────────────────────────────────────── */

export function renderBulk(ctx) {
  const bulk = ctx.bulk || emptyBulk();
  return bulk.paso === 'revisar' ? pasoRevisar(ctx, bulk) : pasoEscribir(bulk);
}

function pasoEscribir(bulk) {
  return `<form data-form="bulk-texto" class="stack bulk">
    <div class="card stack">
      <h2>Escríbelo como lo dirías</h2>
      <p class="muted">Un párrafo con todo lo de la vuelta del mes. Se convierte en una tabla que revisas antes de que se guarde nada.</p>
      <label class="field">
        <span>Lo que compraste o lo que la casa consume</span>
        <textarea name="texto" class="bulk-texto" rows="6" autocapitalize="sentences" spellcheck="true" enterkeyhint="done" placeholder="${esc(EJEMPLO)}" required>${esc(bulk.texto)}</textarea>
      </label>
      <div class="bulk-destino">
        <label class="field">
          <span>Adónde van estas filas</span>
          <select name="destino">${options(Object.entries(DESTINOS).map(([id, item]) => [id, item.opcion]), bulk.destino)}</select>
        </label>
      </div>
      <div class="hint">
        <strong>Qué entiende:</strong>
        <ul class="bulk-entiende tiny">
          <li>Cantidades en número o en palabras: «30 plátanos», «media docena de huevos», «dos y medio».</li>
          <li>Medidas de aquí: libras, paquetes, fundas, latas, ruedas, tazas, rebanadas. Los kilos y los gramos se pasan a libras y la fila lo avisa.</li>
          <li>Separadores: la coma, el punto y coma, el punto y la «y». «Arroz y habichuelas» no se parte en dos; «atún y detergente» sí.</li>
          <li>Lo que pidas quitar —«sin atún», «este mes no compramos salami»— se aparta y se explica, no se guarda.</li>
          <li><strong>Lo que no sepa lo deja a medias</strong>, con el nombre puesto, en vez de perderlo.</li>
        </ul>
      </div>
      ${notice('Nada se guarda todavía', 'Al revisar verás una tabla con una fila por alimento. Ahí puedes corregir los nombres y decidir qué hacer con cada una.')}
      <div class="modal-actions">
        ${button('Usar el ejemplo', 'bulk-ejemplo', 'btn-quiet')}
        <button type="submit" class="btn btn-primary">Revisar</button>
      </div>
    </div>
  </form>`;
}

function pasoRevisar(ctx, bulk) {
  const { state } = ctx;
  const destino = DESTINOS[bulk.destino] || DESTINOS.habitual;
  const tabla = bulk.filas.filter(fila => !fila.negada);
  const negadas = bulk.filas.filter(fila => fila.negada);
  const pide = pideCantidad(bulk.destino);
  return `<form data-form="bulk-revision" class="stack bulk" data-destino="${esc(bulk.destino)}">
    ${productDatalist(state.products, LISTA)}
    <div class="card stack">
      <div class="section-head bulk-head">
        <div>
          <h2>Revisa antes de guardar</h2>
          <p data-bulk-cuenta>${esc(textoCuenta(tabla, pide))}</p>
        </div>
        <div class="inline">
          ${button('Volver a escribir', 'bulk-escribir', 'btn-quiet')}
          ${button('Añadir otra fila a mano', 'bulk-fila-nueva')}
        </div>
      </div>
      ${bulk.avisos.map(aviso => notice('De la lectura del texto', esc(aviso), 'warn')).join('')}
      ${notice(esc(`Van a ${destino.titulo}`), esc(destino.explica), bulk.destino === 'compra' ? 'warn' : '')}
      ${bulk.destino === 'compra' ? notice('Una compra necesita cantidades', 'Las filas sin cantidad no pueden entrar en una compra: escribe cuánto compraste o márcalas para ignorar.', 'warn') : ''}
      ${tabla.length ? tablaFilas(ctx, bulk, tabla) : `<p class="muted">No queda ninguna fila. Vuelve a escribir el texto o añade una a mano.</p>`}
      ${negadas.length ? bloqueNegadas(negadas) : ''}
      ${bulk.destino === 'compra' ? `<label class="bulk-confirma"><input type="checkbox" name="confirmo" value="si" required> Sí: esta compra ya se hizo y quiero que quede en el historial.</label>` : ''}
      <div class="modal-actions">
        ${button('Volver a escribir', 'bulk-escribir', 'btn-quiet')}
        <button type="submit" class="btn btn-primary" data-bulk-guardar>${esc(textoGuardar(tabla, bulk.destino))}</button>
      </div>
    </div>
  </form>`;
}

function tablaFilas(ctx, bulk, filas) {
  const pide = pideCantidad(bulk.destino);
  return `<div class="table-wrap bulk-wrap">
    <table class="data-table bulk-table">
      <caption class="bulk-caption">Una fila por alimento leído. Todo es editable; nada se guarda hasta que pulses el botón de abajo.</caption>
      <thead><tr>
        <th scope="col">Alimento</th>
        ${pide ? '<th scope="col">Cantidad</th><th scope="col">Unidad</th>' : ''}
        <th scope="col">Categoría</th>
        <th scope="col">Qué se hará con ella</th>
        <th scope="col">Estado</th>
        <th scope="col"><span class="bulk-oculto">Quitar la fila</span></th>
      </tr></thead>
      <tbody>${filas.map(fila => filaHTML(ctx, bulk, fila)).join('')}</tbody>
    </table>
  </div>`;
}

function filaHTML(ctx, bulk, fila) {
  const pide = pideCantidad(bulk.destino);
  const estado = estadoDe(fila, pide);
  const nombre = texto(fila.nombre) || fila.texto || 'esta fila';
  return `<tr data-bulk-row data-fila="${esc(fila.id)}" data-estado="${estado}" class="bulk-fila ${DESTACADOS.has(estado) ? 'bulk-destacada' : ''}">
    <td class="bulk-celda-nombre">
      ${productField(fila.nombre, { name: `nombre-${fila.id}`, label: 'Alimento', required: false, listId: LISTA, placeholder: 'Ej. Arroz', extra: 'data-bulk-nombre' })}
      ${notasHTML(ctx, bulk, fila)}
    </td>
    ${pide ? `<td class="bulk-celda-cantidad">
      <label class="field"><span>Cantidad</span>
        <input type="number" name="cantidad-${esc(fila.id)}" value="${esc(fila.cantidad)}" min="0" step="any" inputmode="decimal" placeholder="Pendiente" data-bulk-cantidad aria-describedby="${esc(fila.id)}-pista">
      </label>
      <span id="${esc(fila.id)}-pista" class="bulk-oculto">Déjala vacía si todavía no sabes cuánto: la fila se guarda igual y queda pendiente.</span>
    </td>
    <td class="bulk-celda-unidad">
      <label class="field"><span>Unidad</span>
        <select name="unidad-${esc(fila.id)}" data-bulk-unidad>${options(UNITS.map(unidad => [unidad, unidad]), fila.unidad)}</select>
      </label>
    </td>` : ''}
    <td class="bulk-celda-categoria">
      <label class="field"><span>Categoría</span>
        <select name="categoria-${esc(fila.id)}" data-bulk-categoria>${options(CATEGORIES.map(item => [item.id, item.label]), fila.categoria)}</select>
      </label>
    </td>
    <td class="bulk-celda-accion">
      <label class="field"><span>Qué se hará con ella</span>
        <select name="accion-${esc(fila.id)}" data-bulk-accion>${opcionesAccion(ctx.state, fila)}</select>
      </label>
    </td>
    <td class="bulk-celda-estado">
      <span class="pill ${ESTADOS[estado].pill}" data-bulk-estado>${esc(ESTADOS[estado].texto)}</span>
    </td>
    <td class="bulk-celda-quitar">
      ${button('Quitar', 'bulk-quitar-fila', 'btn-quiet bulk-quitar', `data-fila="${esc(fila.id)}" aria-label="Quitar ${esc(nombre)} de la lista"`)}
    </td>
  </tr>`;
}

// El desplegable lleva dentro con qué producto se une, así que cambiarlo no
// obliga a volver a dibujar la tabla. Los parecidos van arriba con su nombre a
// la vista —«Unir con “Plátano maduro”»— y el catálogo entero debajo, porque el
// parecido que hace falta no siempre es el que la máquina propone.
function opcionesAccion(state, fila) {
  const nombre = texto(fila.nombre) || 'este alimento';
  const sugeridos = fila.candidatos || [];
  const vistos = new Set([...sugeridos.map(item => item.id), fila.exacto].filter(Boolean));
  const resto = state.products.filter(item => !item.archived && !vistos.has(item.id));
  const seleccion = valorAccion(fila);
  const opcion = (valor, etiqueta) => `<option value="${esc(valor)}" ${valor === seleccion ? 'selected' : ''}>${esc(etiqueta)}</option>`;
  const partes = [];
  if (fila.exacto) partes.push(opcion('incluir', `Usar «${product(state, fila.exacto)?.name || nombre}», que ya existe`));
  partes.push(opcion('nuevo', `Crear «${nombre}» como alimento nuevo`));
  if (sugeridos.length) partes.push(`<optgroup label="Se parecen a este nombre">${sugeridos.map(item => opcion(`unir:${item.id}`, `Unir con «${item.nombre}»`)).join('')}</optgroup>`);
  if (resto.length) partes.push(`<optgroup label="Unir con otro alimento del catálogo">${resto.map(item => opcion(`unir:${item.id}`, `Unir con «${item.name}»`)).join('')}</optgroup>`);
  partes.push(opcion('ignorar', 'Ignorar esta línea'));
  return partes.join('');
}

// Todo lo que la fila tiene que explicar, en una sola nota bajo el nombre: es
// la columna más ancha y es donde mira quien está corrigiendo.
function notasHTML(ctx, bulk, fila) {
  const notas = [];
  const elegido = productoDe(ctx.state, fila);
  if (fila.accion === 'unir' && elegido) {
    notas.push(fila.parecido === elegido.name
      ? `Encontramos un producto parecido: «${elegido.name}». ¿Quieres usarlo o crear uno diferente?`
      : `Se unirá con «${elegido.name}», que ya está en el catálogo.`);
    if (alias(fila, elegido)) notas.push(`«${texto(fila.nombre)}» quedará guardado como otra forma de llamarlo, para no volver a preguntarlo.`);
  }
  if (fila.aviso) notas.push(fila.aviso);
  if (fila.unidadDeducida && utilizable(fila.nombre)) notas.push(`No se escribió la unidad: se propone «${fila.unidad}». Cámbiala si no es esa.`);
  const previa = lineaPrevia(ctx, bulk, fila);
  if (previa) notas.push(`Ya está en ${DESTINOS[bulk.destino].titulo} con ${previa.quantity === null ? 'la cantidad pendiente' : measure(previa.quantity, previa.unit)}: se quedará con lo que escribas aquí.`);
  const estado = estadoDe(fila);
  if (ESTADOS[estado].nota) notas.push(ESTADOS[estado].nota);
  if (fila.texto && texto(fila.nombre).toLowerCase() !== fila.texto.toLowerCase()) notas.push(`Se leyó de: «${fila.texto}».`);
  return notas.length ? `<p class="bulk-nota tiny">${notas.map(esc).join(' ')}</p>` : '';
}

// La línea que este alimento ya tiene en la canasta de destino, si la tiene.
// Se avisa porque dos líneas del mismo alimento en una canasta contarían dos
// veces el mismo arroz en la lista de compra.
function lineaPrevia(ctx, bulk, fila) {
  const productId = productoDe(ctx.state, fila)?.id;
  if (!productId) return null;
  if (bulk.destino === 'habitual') return habitualLines(ctx.state).find(linea => linea.productId === productId) || null;
  return null;
}

function bloqueNegadas(negadas) {
  return `<div class="card soft stack bulk-negadas">
    <h3>Lo que pediste no comprar</h3>
    <p class="muted small">Se entendió como «no comprar esto», así que no se guardará. Si en realidad sí lo querías, tráelo a la tabla.</p>
    <ul class="bulk-negadas-lista">${negadas.map(fila => `<li>
      <div>
        <strong>${esc(texto(fila.nombre) || fila.texto)}</strong>
        <span class="tiny muted">Se leyó de: «${esc(fila.texto)}».</span>
      </div>
      ${button('Sí lo quiero', 'bulk-recuperar-fila', 'btn-secondary', `data-fila="${esc(fila.id)}" aria-label="Traer ${esc(texto(fila.nombre) || fila.texto)} a la tabla"`)}
    </li>`).join('')}</ul>
  </div>`;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

// Las acciones y los formularios avisan por su cuenta en vez de dejar escapar
// el error: así el mensaje llega igual aunque quien integre el módulo no los
// envuelva en su propio try/catch.
const intentar = (ctx, fn) => {
  try { fn(); } catch (error) { ctx.toast(error.message, true); }
};

// El paso 1 se vuelve a dibujar entero en cada cambio, así que lo escrito y lo
// elegido se guardan en el estado antes de cualquier redibujo: lo que no esté
// ahí se pierde, y perder el párrafo que alguien acaba de escribir es
// imperdonable.
function guardarLoEscrito(el, ctx) {
  const form = el?.closest('[data-form="bulk-texto"]') || globalThis.document?.querySelector('[data-form="bulk-texto"]');
  if (!form) return;
  ctx.bulk.texto = form.querySelector('[name="texto"]')?.value ?? ctx.bulk.texto;
  ctx.bulk.destino = form.querySelector('[name="destino"]')?.value || ctx.bulk.destino;
}

export const BULK_ACTIONS = {
  // Rellena el cuadro con el ejemplo, conservando el destino ya elegido.
  'bulk-ejemplo': (el, ctx) => intentar(ctx, () => {
    guardarLoEscrito(el, ctx);
    ctx.bulk.texto = EJEMPLO;
    ctx.render();
  }),
  // Vuelve al paso 1 con el texto intacto: corregir el párrafo entero es a
  // veces más rápido que corregir seis filas.
  'bulk-escribir': (el, ctx) => intentar(ctx, () => {
    Object.assign(ctx.bulk, { paso: 'escribir' });
    ctx.render();
  }),
  'bulk-fila-nueva': (el, ctx) => intentar(ctx, () => {
    const filas = sincronizar(el, ctx);
    ctx.bulk.filas = [...filas, filaVacia(filas)];
    ctx.render();
  }),
  'bulk-quitar-fila': (el, ctx) => intentar(ctx, () => {
    const filas = sincronizar(el, ctx);
    ctx.bulk.filas = filas.filter(fila => fila.id !== el.dataset.fila);
    ctx.render();
  }),
  // Una negación mal entendida —«sin sal» en vez de «sal sin yodo»— no puede
  // costar el alimento: se trae a la tabla sin volver a leer el texto.
  'bulk-recuperar-fila': (el, ctx) => intentar(ctx, () => {
    const filas = sincronizar(el, ctx);
    ctx.bulk.filas = filas.map(fila => (fila.id === el.dataset.fila ? { ...fila, negada: false } : fila));
    ctx.render();
  })
};

/* ── Formularios ───────────────────────────────────────────────────────── */

export const BULK_FORMS = {
  'bulk-texto': (form, data, ctx) => intentar(ctx, () => {
    const valor = String(data.get('texto') || '');
    if (!texto(valor)) throw new Error('Escribe qué se compró antes de revisar.');
    const destino = String(data.get('destino') || ctx.bulk.destino);
    const { filas, avisos } = leerTexto(ctx.state, valor);
    if (!filas.length) throw new Error('No se reconoció ningún alimento en ese texto. Prueba a separar cada uno con una coma.');
    Object.assign(ctx.bulk, {
      paso: 'revisar',
      texto: valor,
      destino: destino in DESTINOS ? destino : 'habitual',
      filas,
      avisos
    });
    ctx.render();
  }),

  'bulk-revision': (form, data, ctx) => intentar(ctx, () => {
    ctx.bulk.filas = leerFilas(ctx.state, form, ctx.bulk.filas);
    const mensaje = guardar(ctx, data);
    const { destino } = ctx.bulk;
    Object.assign(ctx.bulk, emptyBulk(destino));
    ctx.closeModal?.();
    ctx.commit(mensaje);
  })
};

/* ── Guardar ───────────────────────────────────────────────────────────── */

function guardar(ctx, data) {
  const { state, bulk } = ctx;
  const filas = guardables(bulk.filas.filter(fila => !fila.negada));
  if (!filas.length) throw new Error('No queda ninguna fila por guardar.');
  for (const fila of filas) {
    if (!utilizable(fila.nombre)) throw new Error(`No se entendió qué alimento es «${fila.texto || fila.id}». Escribe el nombre o marca esa fila para ignorarla.`);
    if (!UNITS.includes(fila.unidad)) throw new Error(`Elige la unidad de «${fila.nombre}».`);
    if (!sinCantidad(fila) && !(Number(fila.cantidad) > 0)) throw new Error(`La cantidad de «${fila.nombre}» tiene que ser mayor que cero, o déjala vacía para dejarla pendiente.`);
  }
  if (bulk.destino === 'compra') {
    if (data.get('confirmo') !== 'si') throw new Error('Marca la casilla de confirmación: esto guarda una compra en tu historial.');
    const faltan = filas.filter(sinCantidad);
    if (faltan.length) throw new Error(`Una compra necesita cantidades. Escribe cuánto compraste de ${faltan.map(fila => `«${fila.nombre}»`).join(', ')} o marca esas filas para ignorar.`);
  }

  // O entran todas o no entra ninguna: media canasta guardada con la otra mitad
  // perdida es imposible de arreglar a mano después.
  return transaction(state, () => {
    const ids = new Map();
    let creados = 0;
    for (const fila of filas) {
      if (fila.accion === 'nuevo') {
        const item = addProduct(state, {
          name: texto(fila.nombre),
          category: fila.categoria,
          controlUnit: fila.unidad,
          purchaseUnit: fila.unidad,
          origin: 'texto',
          opening: ''
        });
        ids.set(fila.id, item.id);
        creados += 1;
        continue;
      }
      const existente = productoDe(state, fila);
      if (!existente) throw new Error(`El alimento con el que se iba a unir «${fila.nombre}» ya no existe. Elige otro o créalo nuevo.`);
      // Unir «mantequila» con «Mantequilla» una vez y volver a preguntarlo el
      // mes que viene sería hacerle repetir el mismo trabajo. El nombre escrito
      // se guarda como otra forma de llamarlo, y a partir de ahí el texto lo
      // reconoce solo. La fila lo avisa antes de guardar; no pasa en silencio.
      if (alias(fila, existente)) updateProduct(state, existente.id, { aliases: [...existente.aliases, texto(fila.nombre)] });
      ids.set(fila.id, existente.id);
    }
    if (bulk.destino === 'catalogo') {
      const yaEstaban = filas.length - creados;
      if (!creados) throw new Error('Todos estos alimentos ya estaban en el catálogo: no hay nada nuevo que registrar.');
      return `${creados} ${alimentos(creados)} ${creados === 1 ? 'registrado' : 'registrados'} en el catálogo.${yaEstaban ? ` ${yaEstaban} ya ${yaEstaban === 1 ? 'estaba' : 'estaban'}.` : ''}`;
    }
    // Una compra que ya se hizo se guarda como lista cerrada, igual que la que
    // se termina desde la pantalla de la compra. Antes escribía en `purchases` y
    // subía el inventario; ya no hay inventario que subir, y dos formas de
    // anotar la misma compra tenían que acabar en el mismo sitio.
    if (bulk.destino === 'compra') {
      const lista = crearLista(state, { fecha: todayISO(), nombre: 'Anotada por escrito' });
      for (const fila of filas) {
        const linea = agregarALista(state, lista.id, { productId: ids.get(fila.id), cantidad: fila.cantidad, unidad: fila.unidad });
        // Se anota como traída: quien escribe «compré» cuenta lo que ya metió en
        // casa, no lo que piensa buscar.
        anotarComprado(state, lista.id, linea.id, fila.cantidad);
      }
      cerrarLista(state, lista.id);
      return `Compra guardada en el historial con ${filas.length} ${alimentos(filas.length)}.${creados ? ` ${creados} se ${creados === 1 ? 'registró' : 'registraron'} por primera vez.` : ''}`;
    }
    setHabitualBasket(state, anadirLineas(state, bulk, filas, ids), { origin: 'texto' });
    return `Productos habituales: ${filas.length} ${alimentos(filas.length)} ${filas.length === 1 ? 'añadido' : 'añadidos'}.${creados ? ` ${creados} se ${creados === 1 ? 'registró' : 'registraron'} por primera vez.` : ''}`;
  });
}

// Las líneas nuevas se suman a las que ya estaban; la canasta no se reemplaza.
// El alimento que ya tenía línea no se duplica —dos líneas del mismo arroz
// saldrían dos veces en la compra— y conserva lo que tuviera escrito: quien
// vuelve a nombrarlo está diciendo «esto lo compro siempre», no «olvida lo de
// antes». Lo nuevo nace sin cantidad, porque aquí ya no se pregunta ninguna.
function anadirLineas(state, bulk, filas, ids) {
  const previas = habitualLines(state);
  const lineas = previas.map(linea => ({ id: linea.id, productId: linea.productId, quantity: linea.quantity, unit: linea.unit, priority: linea.priority }));
  for (const fila of filas) {
    const productId = ids.get(fila.id);
    const indice = lineas.findIndex(linea => linea.productId === productId);
    if (indice >= 0) continue;
    lineas.push({ productId, quantity: null, unit: fila.unidad, priority: 'frecuente' });
  }
  return lineas;
}

/* ── El resumen en vivo ────────────────────────────────────────────────── */

// El contador y el botón dicen un número, y un número que miente es peor que no
// tenerlo: si alguien marca una fila para ignorar, el botón tiene que dejar de
// prometer que la guardará. Se actualizan leyendo el propio formulario, sin
// tocar el estado ni volver a dibujar, que es lo que borraría lo ya escrito.
function refrescarResumen(form) {
  const pide = pideCantidad(form.dataset.destino);
  const filas = [...form.querySelectorAll('[data-bulk-row]')].map(tr => ({
    tr,
    nombre: tr.querySelector('[data-bulk-nombre]')?.value || '',
    cantidad: tr.querySelector('[data-bulk-cantidad]')?.value || '',
    ...leerAccion(tr.querySelector('[data-bulk-accion]')?.value)
  }));
  for (const fila of filas) {
    const estado = estadoDe(fila, pide);
    fila.tr.dataset.estado = estado;
    fila.tr.classList.toggle('bulk-destacada', DESTACADOS.has(estado));
    const etiqueta = fila.tr.querySelector('[data-bulk-estado]');
    if (etiqueta) {
      etiqueta.textContent = ESTADOS[estado].texto;
      etiqueta.className = `pill ${ESTADOS[estado].pill}`;
    }
  }
  const cuenta = form.querySelector('[data-bulk-cuenta]');
  if (cuenta) cuenta.textContent = textoCuenta(filas, pide);
  const boton = form.querySelector('[data-bulk-guardar]');
  if (boton) boton.textContent = textoGuardar(filas, form.dataset.destino);
}

// Se engancha al importar y solo reacciona dentro de esta tabla, para no pedirle
// a app.js que conozca los detalles de la pantalla. El guardia de `document`
// existe porque el mismo módulo se importa desde las pruebas, donde no hay DOM.
if (typeof document !== 'undefined') {
  const vigilar = event => {
    const form = event.target?.closest?.('[data-form="bulk-revision"]');
    if (form) refrescarResumen(form);
  };
  document.addEventListener('input', vigilar);
  document.addEventListener('change', vigilar);
}
