import { containsWords, normalizeName, similarity } from './nombres.js';
import { CLASES_DE_PERSONA, MOTIVOS_DE_RESTRICCION, RUBROS_IDS, SCHEMA_VERSION, migrate, rubroDeCategoria } from './migrate.js';

export { normalizeName, SCHEMA_VERSION, CLASES_DE_PERSONA, MOTIVOS_DE_RESTRICCION, RUBROS_IDS, rubroDeCategoria };

/* ── Los momentos del día ──────────────────────────────────────────────────

   Hay dos listas parecidas y conviene no confundirlas nunca:

   · `MOMENTOS` son los momentos en que una preparación **suele comerse**. Son
     cinco, porque una casa merienda, y el mangú con salami es de desayuno y de
     cena a la vez. Es una etiqueta de la preparación, no una casilla del día.

   · `SLOTS` son las casillas que el **calendario** tiene por día. Son las
     mismas cinco, y se derivan de `MOMENTOS` para que no puedan separarse por
     olvido: un momento en el que se puede comer algo es un momento que el
     calendario tiene que poder guardar.

   Lo que separa a las dos listas no es cuántas son, sino qué se cuenta. Ver
   `SLOTS_PRINCIPALES`. */

export const MOMENTOS = [
  { id: 'desayuno',        etiqueta: 'Desayuno',           corto: 'Desayuno',  plural: 'Desayunos',           opcional: false },
  { id: 'merienda-manana', etiqueta: 'Merienda de mañana', corto: 'Merienda',  plural: 'Meriendas de mañana', opcional: true },
  { id: 'almuerzo',        etiqueta: 'Almuerzo',           corto: 'Almuerzo',  plural: 'Almuerzos',           opcional: false },
  { id: 'merienda-tarde',  etiqueta: 'Merienda de tarde',  corto: 'Merienda',  plural: 'Meriendas de tarde',  opcional: true },
  { id: 'cena',            etiqueta: 'Cena',               corto: 'Cena',      plural: 'Cenas',               opcional: false }
];
export const MOMENTOS_IDS = MOMENTOS.map(item => item.id);
export const momentoDe = id => MOMENTOS.find(item => item.id === id) || null;
export const etiquetaDeMomento = id => momentoDe(id)?.etiqueta || id;
export const esOpcional = id => Boolean(momentoDe(id)?.opcional);

export const SLOTS = MOMENTOS.map(item => item.id);

// Los días de la semana en ISO: 1 lunes … 7 domingo. El calendario empieza en
// lunes, así que el domingo —que en JavaScript es el 0— se manda al final.
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Los tres momentos que una casa espera resolver todos los días. Las meriendas
// no están: hay casas que no meriendan, y contar un día como incompleto porque
// nadie anotó la merienda de las diez es reprocharle a la gente algo que no
// hace. Se usan para todo lo que cuenta huecos —el progreso de Hoy, el del mes,
// los avisos de la compra por menú— y nunca para limitar lo que se puede poner.
export const SLOTS_PRINCIPALES = MOMENTOS.filter(item => !item.opcional).map(item => item.id);
export const UNITS = ['unidad', 'lb', 'taza', 'lata', 'paquete', 'rueda', 'rebanada'];
// Una «rueda» no mide lo mismo en dos casas: quien corta fino saca el doble de
// ruedas del mismo salami. El grosor no convierte nada por sí solo —para eso
// está la equivalencia—, pero deja escrito qué significa una rueda aquí, que es
// justo lo que hace comparable el conteo de una semana con el de la siguiente.
export const SLICEABLE = ['rueda', 'rebanada'];
export const SLICE_STYLES = [
  { id: 'fina', label: 'Fina', range: '2–3 mm' },
  { id: 'media', label: 'Mediana', range: '4–5 mm' },
  { id: 'gruesa', label: 'Gruesa', range: '6–8 mm' }
];
export const sliceStyle = id => SLICE_STYLES.find(item => item.id === id) || null;
// Un alimento de la canasta puede ser de los que nunca faltan, de los que casi
// siempre están, o de los que aparecen de vez en cuando. Sirve para ordenar la
// lista y para decidir qué proponer, nunca para calcular cantidades.
export const PRIORITIES = ['obligatorio', 'frecuente', 'ocasional'];
// De dónde salió un producto. Se guarda para poder explicarle al usuario por
// qué existe algo que él no recuerda haber escrito.
export const ORIGINS = ['manual', 'catalogo', 'factura', 'asistente', 'compra', 'canasta', 'texto'];
const EPS = 1e-8;
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (date, count) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + count);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const validDate = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const d = new Date(`${date}T12:00:00`);
  return Number.isFinite(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === date;
};
export const validMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '');
export const monthBounds = month => ({ start: `${month}-01`, end: addDays(`${month}-01`, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() - 1) });
// El lunes de la semana en que cae una fecha. La semana empieza en lunes
// porque así se lee un calendario en esta casa, y porque «el fin de semana»
// tiene que caer junto al final y no partido entre dos filas.
export const weekStart = date => addDays(date, -(weekdayOf(date) - 1));

// Qué día de la semana es una fecha, en ISO: 1 lunes … 7 domingo.
//
// Mediodía y no medianoche: a las 00:00 un cambio de horario de verano puede
// devolver el día anterior, y entonces un lunes pasaría a contarse como domingo.
export const weekdayOf = date => {
  if (!validDate(date)) throw new Error('Elige una fecha válida.');
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
};
export const dateRange = (start, end) => {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Selecciona fechas válidas y en orden.');
  if (new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`) > 366 * 86400000) throw new Error('El período no puede superar un año.');
  const dates = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
};
export const createEmptyState = () => ({
  version: SCHEMA_VERSION, seq: 0, demo: false,
  products: [], people: [], recipes: [], plans: [], absences: [],
  opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
  // La canasta habitual es lo que la casa consume en un mes corriente. Cada mes
  // guarda solo aquello en lo que se aparta de ella: comprar algo
  // extraordinario en septiembre no debe reescribir el hábito.
  habitualBasket: { lines: [], updatedAt: null, history: [] },
  monthOverrides: {},
  // Las rutinas son las comidas que se repiten solas: «los domingos comemos
  // fuera», «los lunes mangú». Un mes abierto es un mes al que ya se le
  // aplicaron.
  mealRoutines: [], monthPlans: {},
  // La fotografía de cada período que se cerró cuando la app calculaba la
  // compra. No se producen nuevas —no hay cuenta que congelar— y las guardadas
  // no se tocan: son lo que se compró en su día, y se leen desde el historial.
  closedPeriods: [],
  // Las listas de compra. Una lista es una salida concreta al supermercado: lo
  // que se va a buscar, cuánto decidió llevar quien la escribió, y qué se fue
  // tachando por el pasillo. No es un inventario y no descuenta nada de nada.
  // Ver `crearLista`.
  listasDeCompra: [],
  // `hogar` guarda por dónde va la configuración guiada de la casa. Va en el
  // estado y no en la interfaz a propósito: quien cierra la app a mitad de la
  // tercera ficha tiene que encontrarla abierta por la tercera ficha, y quien
  // cambia de teléfono también. Los respaldos viejos no lo traen, así que todo
  // lo que lo lee lo lee con `hogarDe()`, que devuelve el valor de fábrica.
  // `compra` guarda cada cuánto se hace la compra —como una lista de tramos con
  // fecha de vigencia, no como un interruptor— y cómo se parte el mes entre las
  // dos quincenas. Los respaldos viejos no lo traen: sin él todo es mensual,
  // que es como se comportaba la app antes.
  settings: { reviewWeekday: 5, onboarded: false, hogar: null, canasta: null, compra: null },
  activity: []
});
export function nextId(state, prefix) { state.seq += 1; return `${prefix}-${state.seq}`; }
export function quantity(value, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error('Escribe una cantidad mayor que cero.');
  return round(n);
}
// En la canasta la cantidad puede quedar pendiente: alguien sabe que compra
// arroz todos los meses mucho antes de saber cuántas libras. Perder el alimento
// por no saber el número sería el peor de los dos males.
export function optionalQuantity(value) {
  if (value === '' || value === undefined || value === null) return null;
  return quantity(value);
}

// Deshacer a mano un cambio a medias es imposible de hacer bien: hay que
// recordar qué tocó cada función. Un clon antes y una restauración en sitio
// después lo resuelven de una vez para todos los casos —y es lo que permite
// que el asistente ejecute varias acciones sabiendo que, o entran todas, o no
// entra ninguna.
export function snapshot(state) { return structuredClone(state); }
export function restore(state, saved) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, structuredClone(saved));
  return state;
}
export function transaction(state, fn) {
  const saved = snapshot(state);
  try {
    const result = fn(state);
    if (balances(state).problems.length) throw new Error('El cambio dejaría existencias negativas en alguna fecha.');
    return result;
  } catch (error) {
    restore(state, saved);
    throw error;
  }
}

/* ── Catálogo de alimentos ─────────────────────────────────────────────── */

export function product(state, id) { return state.products.find(item => item.id === id); }
export function activeProducts(state) { return state.products.filter(item => !item.archived); }
export function productByName(state, name) {
  const key = normalizeName(name);
  return key ? state.products.find(item => item.normalized === key || (item.aliases || []).some(alias => normalizeName(alias) === key)) : undefined;
}
// Antes de crear un alimento nuevo conviene enseñar lo que ya se le parece.
// Devuelve candidatos ordenados, nunca decide: unir dos alimentos mezcla dos
// inventarios, y eso solo lo puede autorizar quien tiene la casa delante.
export function findSimilarProducts(state, name, { limit = 3, threshold = 0.72, exclude = null } = {}) {
  const key = normalizeName(name);
  if (!key) return [];
  return state.products
    .filter(item => item.id !== exclude)
    .map(item => {
      const alias = (item.aliases || []).reduce((best, value) => Math.max(best, similarity(name, value)), 0);
      const score = Math.max(similarity(name, item.name), alias);
      if (score >= 0.995) return { product: item, score: 1, reason: 'igual' };
      if (score >= threshold) return { product: item, score, reason: 'parecido' };
      if (containsWords(name, item.name)) return { product: item, score: 0.7, reason: 'contenido' };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
export function addProduct(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre del producto.');
  if (!UNITS.includes(fields.controlUnit) || !UNITS.includes(fields.purchaseUnit)) throw new Error('Selecciona unidades válidas.');
  const date = todayISO();
  const item = {
    id: nextId(state, 'producto'), name, normalized: normalizeName(name),
    aliases: [...new Set((fields.aliases || []).map(alias => String(alias).trim()).filter(Boolean))],
    // La categoría se guarda tal cual la mande quien llama. El modelo no tiene
    // una lista cerrada a propósito: quien la enseña es la interfaz, y una
    // categoría inventada aquí sería una etiqueta que el usuario nunca eligió.
    category: String(fields.category || 'otros'),
    controlUnit: fields.controlUnit, purchaseUnit: fields.purchaseUnit,
    equivalences: {}, slice: null, archived: false,
    origin: ORIGINS.includes(fields.origin) ? fields.origin : 'manual',
    createdAt: date, updatedAt: date
  };
  state.products.push(item);
  setSlice(state, item.id, fields.slice);
  if (fields.purchaseUnit !== fields.controlUnit && fields.factor) setEquivalence(state, item.id, fields.purchaseUnit, fields.factor);
  // Lo que ya hay en casa al registrar el producto. Es la apertura del saldo:
  // se fija una sola vez, aquí, porque después el inventario solo se mueve con
  // compras, revisiones y correcciones.
  state.opening[item.id] = fields.opening === '' || fields.opening === undefined || fields.opening === null ? 0 : quantity(fields.opening, true);
  return item;
}
export function updateProduct(state, id, fields) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  if ('name' in fields) {
    const name = String(fields.name || '').trim();
    if (!name) throw new Error('Escribe el nombre del producto.');
    item.name = name;
    item.normalized = normalizeName(name);
  }
  if ('purchaseUnit' in fields) {
    if (!UNITS.includes(fields.purchaseUnit)) throw new Error('Selecciona una unidad de compra válida.');
    item.purchaseUnit = fields.purchaseUnit;
  }
  if ('category' in fields) item.category = String(fields.category || 'otros');
  if ('aliases' in fields) item.aliases = [...new Set((fields.aliases || []).map(alias => String(alias).trim()).filter(Boolean))];
  if ('slice' in fields) setSlice(state, id, fields.slice);
  item.updatedAt = todayISO();
  return item;
}
// Archivar esconde el alimento de los selectores sin borrar su historial: las
// compras y revisiones donde aparece siguen siendo ciertas, y el saldo que
// tuviera sigue contando. Borrarlo falsearía el pasado.
export function archiveProduct(state, id) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  item.archived = true;
  item.updatedAt = todayISO();
  return item;
}
export function restoreProduct(state, id) {
  const item = product(state, id);
  if (!item) throw new Error('Selecciona un producto.');
  item.archived = false;
  item.updatedAt = todayISO();
  return item;
}
// Unir dos alimentos es irreversible y mezcla dos inventarios, así que exige
// que se cuenten en la misma unidad: sumar libras con unidades daría un número
// sin significado, y quedaría escrito en el saldo como si fuera cierto.
export function mergeProducts(state, keepId, dropId) {
  return transaction(state, () => {
    const keep = product(state, keepId), drop = product(state, dropId);
    if (!keep || !drop || keepId === dropId) throw new Error('Selecciona dos alimentos distintos.');
    if (keep.controlUnit !== drop.controlUnit) throw new Error(`No se pueden unir: «${keep.name}» se cuenta en ${keep.controlUnit} y «${drop.name}» en ${drop.controlUnit}.`);
    const swap = id => (id === dropId ? keepId : id);
    state.opening[keepId] = round(Number(state.opening[keepId] || 0) + Number(state.opening[dropId] || 0));
    delete state.opening[dropId];
    for (const purchase of state.purchases) for (const line of purchase.lines) line.productId = swap(line.productId);
    for (const correction of state.corrections) correction.productId = swap(correction.productId);
    for (const review of state.reviews) {
      review.productIds = [...new Set(review.productIds.map(swap))];
      if (review.consumed[dropId] !== undefined) {
        review.consumed[keepId] = round((review.consumed[keepId] || 0) + review.consumed[dropId]);
        delete review.consumed[dropId];
      }
      if (review.remaining?.[dropId] !== undefined) delete review.remaining[dropId];
    }
    for (const recipe of state.recipes) for (const line of recipe.items) line.productId = swap(line.productId);
    for (const plan of state.plans) for (const line of plan.items) line.productId = swap(line.productId);
    for (const person of state.people) {
      // Si los dos alimentos que se unen estaban los dos restringidos, después
      // de la unión son la misma restricción. `linkPendingRestrictions` junta
      // las dos filas y conserva el motivo que alguna de ellas tuviera.
      person.restricciones = restriccionesDe(person).map(fila => ({ ...fila, productId: fila.productId ? swap(fila.productId) : null }));
      linkPendingRestrictions(state, person);
      person.habitual = person.habitual.map(row => ({ ...row, productId: swap(row.productId) }));
    }
    state.habitualBasket.lines = mergeBasketLines(state.habitualBasket.lines.map(line => ({ ...line, productId: swap(line.productId) })));
    // Un mes puede tener un cambio escrito para cada uno de los dos alimentos
    // que se unen; después de la unión serían dos cambios del mismo alimento, y
    // la regla es uno por mes.
    for (const override of Object.values(state.monthOverrides)) {
      override.changes = mergeBasketLines(override.changes.map(change => ({ ...change, productId: swap(change.productId) })));
    }
    keep.aliases = [...new Set([...keep.aliases, drop.name, ...drop.aliases])];
    keep.updatedAt = todayISO();
    state.products = state.products.filter(item => item.id !== dropId);
    return keep;
  });
}
/* ── Dos líneas del mismo alimento, tras unir dos alimentos en uno ─────────

   Cada una trae su historia, así que no basta con sumar dos cantidades: hay que
   sumar dos historias. Se miran los meses en que alguna de las dos cambia
   —fuera de esos, nada cambia— y se decide en cada uno.

   Dentro de un mes, la regla es la de siempre: si las dos dicen algo y comparten
   unidad se suman; si no, manda la primera. Convertir aquí sería adivinar una
   equivalencia que nadie ha escrito. */

function fundirTramos(unos, otros) {
  const fechas = [...new Set([...unos, ...otros].map(tramo => tramo.desde ?? null))]
    .sort((a, b) => String(a || '').localeCompare(String(b || '')));
  return fechas.map(desde => {
    const mes = desde || '0000-00';
    const vivos = [tramoEn({ tramos: unos }, mes), tramoEn({ tramos: otros }, mes)].filter(tramo => tramo && !tramo.fuera);
    if (!vivos.length) return { desde, fuera: true };
    const [base, otro] = vivos;
    const suman = otro && otro.unit === base.unit;
    return {
      desde,
      quantity: !suman ? base.quantity
        : (base.quantity === null || otro.quantity === null ? base.quantity ?? otro.quantity : round(base.quantity + otro.quantity)),
      unit: base.unit,
      priority: base.priority
    };
  });
}

function mergeBasketLines(lines) {
  const out = [];
  for (const line of lines.map(conTramos)) {
    const twin = out.find(row => row.productId === line.productId);
    if (!twin) { out.push(line); continue; }
    twin.tramos = fundirTramos(twin.tramos, line.tramos);
  }
  return out;
}
export function convert(state, productId, amount, unit) {
  const item = product(state, productId);
  if (!item) throw new Error('El producto ya no existe.');
  if (unit === item.controlUnit) return round(Number(amount));
  const factor = item.equivalences?.[unit];
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return round(Number(amount) * factor);
}
// El grosor solo tiene sentido en lo que se corta en ruedas o rebanadas. En
// cualquier otra unidad se guarda en null en vez de rechazarse: el formulario
// puede mandar el valor de un radio que quedó oculto al cambiar de unidad.
export function setSlice(state, productId, value) {
  const item = product(state, productId);
  if (!item) throw new Error('Selecciona un producto.');
  item.slice = SLICEABLE.includes(item.controlUnit) && sliceStyle(value) ? value : null;
  return item.slice;
}
export function setEquivalence(state, productId, unit, factor) {
  const item = product(state, productId);
  if (!item || !UNITS.includes(unit) || unit === item.controlUnit) throw new Error('Selecciona un producto y una unidad distinta de su unidad de control.');
  item.equivalences[unit] = quantity(factor);
  item.updatedAt = todayISO();
}

/* ── Canasta habitual y cambios de cada mes ────────────────────────────── */

// La canasta habitual es el hábito: lo que la casa consume en un mes corriente,
// escrito una sola vez. Un mes no guarda una copia de esa lista, sino solo
// aquello en lo que se aparta de ella: «este mes no compro atún», «este mes 45
// libras de arroz en vez de 30», «este mes, además, pollo».
//
// Guardar diferencias en vez de copias es lo que permite corregir el hábito sin
// repasar los meses ya escritos, y que un mes sin excepciones no ocupe nada ni
// haya que abrirlo para calcular la compra: si no hay cambios, la canasta de ese
// mes es exactamente la habitual.

/* ── Los tramos de una línea ───────────────────────────────────────────────

   Una línea de la canasta no guarda una cantidad: guarda su historia. «Noventa
   tazas de arroz desde julio, ciento veinte desde septiembre» son dos tramos de
   la misma línea, y cada mes lee el que le tocaba.

   Antes había una sola cantidad y una fecha de entrada. La fecha decía desde
   cuándo el alimento estaba en la canasta, pero la cantidad no tenía fecha
   ninguna: corregirla hoy cambiaba también lo que la app decía de julio. Y julio
   ya se compró. La pantalla que existe para acordarte de lo que hiciste distinto
   —«Y en la compra cambia esto»— era precisamente la que no podía verlo, porque
   al recalcular el mes anterior con la cantidad de hoy los dos meses salían
   iguales.

   Un tramo con `fuera` dice que desde ese mes el alimento ya no está en la
   canasta. Quitar algo tampoco puede reescribir los meses en que sí se compró.

   `desde: null` es «desde siempre», y es lo que traen las canastas escritas
   antes de que existiera la fecha: eran la canasta de la casa durante aquellos
   meses, y ponerles una fecha ahora sería inventar un día en que empezaron. */

const porFecha = (a, b) => String(a.desde || '').localeCompare(String(b.desde || ''));

// Una línea de antes de los tramos, convertida donde está. La migración las
// convierte todas al cargar, así que esto es para lo que llegue por otro camino
// —un respaldo pegado a mano, una prueba, código viejo—. Sin ella, una línea así
// no tendría ningún tramo que leer y el alimento desaparecería de la canasta sin
// que nada avisara, que es peor que cualquier error.
function conTramos(line) {
  if (!Array.isArray(line.tramos)) {
    line.tramos = [{ desde: line.desde ?? null, quantity: line.quantity ?? null, unit: line.unit, priority: line.priority || 'frecuente' }];
  }
  return line;
}

// El tramo que vale en un mes: el último que empezó en ese mes o antes. Devuelve
// `null` si el alimento todavía no había entrado en la canasta.
export function tramoEn(line, month) {
  let vale = null;
  for (const tramo of line.tramos || []) {
    if (tramo.desde && tramo.desde > month) break;
    vale = tramo;
  }
  return vale;
}

/* ── Las dos formas de preguntar por la canasta ────────────────────────────

   Con un mes: cómo era ese mes, y solo eso. Lo que todavía no había entrado no
   estaba, y lo dado de baja tampoco. Es lo que hay que mirar para calcular una
   compra o para contar lo que pasó.

   Sin mes: la canasta tal como está puesta hoy, que es lo que enseña la
   pantalla. Aquí sí entra lo que empieza más adelante, porque está en la
   canasta: alguien lo escribió para que empiece. Ascender un cambio de octubre
   estando en septiembre lo habría hecho desaparecer de la pantalla hasta
   octubre, y el alimento que acabas de guardar no puede esfumarse.

   Se calcula en vez de guardarse. Tener la cantidad de hoy escrita junto a los
   tramos serían dos verdades sobre lo mismo, y la que se arregla nunca es la
   que alguien está leyendo. */

function tramoDeLectura(line, mes, estricto) {
  const vigente = tramoEn(line, mes);
  if (vigente && !vigente.fuera) return vigente;
  if (estricto) return null;
  return (line.tramos || []).find(tramo => !tramo.fuera && tramo.desde && tramo.desde > mes) || null;
}

export function habitualLines(state, month = null) {
  const mes = month || mesEnCurso();
  const out = [];
  for (const line of state.habitualBasket.lines.map(conTramos)) {
    const tramo = tramoDeLectura(line, mes, Boolean(month));
    if (!tramo) continue;
    out.push({
      id: line.id,
      productId: line.productId,
      quantity: tramo.quantity,
      unit: tramo.unit,
      priority: tramo.priority,
      // Desde cuándo está en la canasta, que no es lo mismo que desde cuándo
      // vale esta cantidad.
      desde: line.tramos[0]?.desde ?? null,
      // Desde cuándo vale lo que se está leyendo.
      vigenteDesde: tramo.desde ?? null,
      // Lo que ya está escrito para más adelante, si lo hay. Sin esto, ascender
      // un cambio de octubre estando en septiembre dejaría la pantalla diciendo
      // la cantidad de septiembre y ni una palabra de que cambia el mes que
      // viene, y quien acaba de escribirlo pensaría que no se guardó.
      proximo: (line.tramos || []).find(otro => otro !== tramo && otro.desde && otro.desde > mes) || null,
      tramos: line.tramos
    });
  }
  return out;
}

// La línea guardada, con sus tramos, esté dentro de la canasta este mes o no.
// Lo necesitan las pocas cosas que tienen que mirar la historia entera.
export function lineaDeLaCanasta(state, productId) {
  const line = state.habitualBasket.lines.find(row => row.productId === productId);
  return line ? conTramos(line) : null;
}

/* ── Lo que una línea hereda de la que ya estaba ───────────────────────────

   La pantalla de la canasta solo pinta la cantidad y la unidad de cada
   alimento. Al pulsar Guardar reenvía todas sus líneas —también las que nadie
   ha tocado— sin fecha de vigencia y sin prioridad, y tomárselo al pie de la
   letra borraba las dos cosas por haber corregido unas libras de arroz.

   Así que lo que no venga escrito se hereda de la línea que ya estaba, y esta
   es la única regla; vale para los seis sitios desde los que algo entra en la
   canasta: la pantalla de la canasta, la ficha del alimento, el dictado, el
   asistente, los cambios del mes y el asistente de entrada.

   La fecha, además, decide qué meses ven el alimento. Añadir cangrejo hoy
   quiere decir que esta casa come cangrejo desde hoy, no que lo comiera en
   junio; sin fecha, una línea nueva aparecía hacia atrás en todos los meses ya
   pasados, y la compra de un mes que ya se hizo decía otra cosa de la que dijo
   el día que se hizo. Por eso:

    · La fecha escrita manda. Es alguien diciendo explícitamente desde cuándo,
      como hace «Añadir a mis habituales».
    · Una línea que ya estaba conserva la suya, aunque sea «desde siempre».
    · Una línea nueva nace fechada en el mes en curso.

   Las canastas escritas antes de esto siguen sin fecha, que es «desde siempre»,
   y así se quedan: eran la canasta de la casa durante aquellos meses, y ponerles
   una fecha ahora sería inventar un día en que empezaron. */

const mesEnCurso = () => todayISO().slice(0, 7);

/* ── Escribir en una línea ────────────────────────────────────────────────

   Escribir no pisa lo que había: abre un tramo desde el mes en curso y deja
   quieto lo anterior. Corregir el arroz hoy dice qué se come ahora, no qué se
   comía en julio.

   `corregir` es la otra intención, la que hay que poder decir también: no es
   que haya cambiado el consumo, es que estaba mal escrito. Entonces sí se
   reescribe el tramo que estaba vigente, que es como decir «desde que empezó
   esto, la cantidad buena era esta otra». No toca los tramos anteriores, porque
   aquellos eran correctos.

   Y si lo que llega es igual a lo que ya valía, no se abre ningún tramo. Hace
   falta: la pantalla de la canasta reenvía todas sus líneas al guardar, también
   las que nadie tocó, y sin esto cada Guardar le añadiría un tramo idéntico a
   cada alimento hasta convertir la historia en ruido. */

function escribirTramo(state, productId, { quantity, unit, priority, desde, corregir = false, fuera = false }) {
  const lines = state.habitualBasket.lines;
  let line = lines.find(row => row.productId === productId);
  if (line) conTramos(line);
  const mes = validMonth(desde) ? desde : mesEnCurso();

  if (!line) {
    if (fuera) return null;   // Quitar algo que nunca estuvo no escribe nada.
    // El rubro sale de la categoría del alimento y no se pregunta: quien
    // escribe «arroz» ya dijo que es un grano. Se guarda en la línea y no se
    // deduce al leer para que se pueda mover de rubro sin recategorizar el
    // alimento, que es otra cosa y se usa en otro sitio.
    line = { id: nextId(state, 'canasta'), productId, rubro: rubroDeCategoria(product(state, productId)?.category), nota: '', tramos: [] };
    lines.push(line);
  }

  const vigente = tramoEn(line, mes);
  const tramo = fuera
    ? { desde: mes, fuera: true }
    : {
      desde: mes,
      quantity,
      unit,
      // Corregir unas libras de arroz no puede degradar lo que estaba marcado
      // como obligatorio, ni cambiar su unidad sin que nadie lo pida.
      priority: PRIORITIES.includes(priority) ? priority : (vigente?.priority || 'frecuente')
    };

  const igualQueAntes = vigente && !vigente.fuera === !tramo.fuera
    && vigente.quantity === tramo.quantity && vigente.unit === tramo.unit && vigente.priority === tramo.priority;
  if (igualQueAntes && !corregir) return line;

  if (corregir && vigente) {
    // Se reescribe donde estaba, conservando su fecha: la corrección alcanza
    // hacia atrás justo hasta donde empezó el dato equivocado.
    line.tramos[line.tramos.indexOf(vigente)] = { ...tramo, desde: vigente.desde ?? null };
  } else {
    // Un solo tramo por mes: volver a escribir en el mismo mes corrige el que ya
    // había en vez de apilar dos verdades sobre el mismo alimento.
    const mismoMes = line.tramos.findIndex(row => (row.desde ?? null) === mes);
    if (mismoMes >= 0) line.tramos[mismoMes] = tramo;
    else line.tramos.push(tramo);
  }
  line.tramos.sort(porFecha);
  state.habitualBasket.updatedAt = todayISO();
  return line;
}

function normalizeBasketLines(state, lines, { origin = 'canasta' } = {}) {
  const rows = (lines || []).map(line => {
    const name = String(line.name || '').trim();
    const existing = name ? productByName(state, name) : product(state, line.productId);
    if (!existing && !name) throw new Error('Escribe el nombre del alimento.');
    if (!UNITS.includes(line.unit)) throw new Error('Elige la unidad de cada alimento.');
    return {
      id: line.id, existing, name,
      quantity: optionalQuantity(line.quantity),
      unit: line.unit,
      priority: line.priority,
      desde: line.desde
    };
  });
  // Los alimentos que faltan se crean solo después de validarlo todo: si una
  // línea estuviera mal, media canasta habría quedado registrada a medias.
  const nuevos = new Map();
  return rows.map(row => {
    const key = normalizeName(row.name);
    const item = row.existing || nuevos.get(key) || addProduct(state, { name: row.name, controlUnit: row.unit, purchaseUnit: row.unit, origin });
    if (!row.existing && key) nuevos.set(key, item);
    return { productId: item.id, quantity: row.quantity, unit: row.unit, priority: row.priority, desde: row.desde };
  });
}

// La canasta entera de una vez, como la manda la pantalla al guardar. Lo que
// viene se escribe, y lo que estaba y ya no viene se da de baja con fecha: los
// meses en que sí se compraba siguen diciendo que se compraba.
export function setHabitualBasket(state, lines, options = {}) {
  const filas = normalizeBasketLines(state, lines, options);
  const date = todayISO();
  const antes = habitualLines(state);
  if (antes.length) {
    state.habitualBasket.history = [...(state.habitualBasket.history || []), { date, count: antes.length }].slice(-24);
  }
  for (const fila of filas) escribirTramo(state, fila.productId, fila);
  const vienen = new Set(filas.map(fila => fila.productId));
  for (const linea of antes) if (!vienen.has(linea.productId)) removeHabitualLine(state, linea.productId);
  state.habitualBasket.updatedAt = date;
  return habitualLines(state);
}

// Escribe la línea sin interpretar la cantidad. `setHabitualLine` sí entiende el
// vacío como una baja; ascender un cambio del mes no puede hacerlo, porque
// «todavía no sé cuánto» es una cantidad legítima y borrar el alimento por eso
// sería perder justo lo que acaban de pedir conservar.
function writeHabitualLine(state, { productId, quantity: amount, unit, priority, desde, corregir = false }) {
  return escribirTramo(state, productId, { quantity: amount, unit, priority, desde, corregir });
}

// El consumo mensual de un solo alimento, para poder escribirlo desde su propia
// ficha. La canasta y la ficha del producto son la misma lista vista de dos
// formas. Vacío o cero borra la línea en vez de guardar un consumo de cero, que
// no significa nada.
// `desde` solo hace falta cuando quien escribe está parado en un mes concreto:
// añadir algo «para siempre» desde los cambios de octubre lo estrena en octubre,
// no hoy. Sin decir nada, una línea nueva nace en el mes en curso.
// `corregir` distingue las dos intenciones que se parecen al escribir y no son
// la misma: «ahora comemos más» abre un tramo desde este mes, «lo escribí mal»
// arregla el tramo que estaba vigente y con él los meses que cubría.
export function setHabitualLine(state, productId, amount, unit, priority, desde = null, { corregir = false } = {}) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  if (amount === '' || amount === undefined || amount === null || Number(amount) === 0) {
    removeHabitualLine(state, productId, { desde });
    return null;
  }
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  return writeHabitualLine(state, { productId, quantity: quantity(amount), unit, priority, desde, corregir });
}

// Quitar algo de la canasta es dejar de comprarlo desde ahora, no haber dejado
// de comprarlo siempre. Se escribe un tramo de baja y los meses anteriores
// siguen diciendo la verdad de lo que fueron.
//
// La excepción es lo que nunca llegó a estar en ningún mes pasado: un alimento
// añadido hoy y quitado hoy no deja historia que proteger, y guardarle una línea
// de baja sería dejar basura con forma de dato.
export function removeHabitualLine(state, productId, { desde = null } = {}) {
  const line = lineaDeLaCanasta(state, productId);
  if (!line) return false;
  const mes = validMonth(desde) ? desde : mesEnCurso();
  const vigente = tramoEn(line, mes);
  if (!vigente || vigente.fuera) return false;

  escribirTramo(state, productId, { fuera: true, desde: mes });
  const quedaHistoria = line.tramos.some(tramo => !tramo.fuera);
  if (!quedaHistoria) state.habitualBasket.lines = state.habitualBasket.lines.filter(row => row.productId !== productId);
  state.habitualBasket.updatedAt = todayISO();
  return true;
}

/* ── Productos habituales ──────────────────────────────────────────────────

   Lo que la familia suele comprar, agrupado por rubros. Es la misma lista que
   antes se llamaba «productos habituales», y sigue guardada en el mismo sitio
   —`habitualBasket.lines`, con sus tramos y sus fechas— por una razón que no es
   pereza: esas cantidades son con las que se calcularon las compras de meses
   que ya se cerraron, y moverlas de sitio o tirarlas dejaría el historial
   diciendo otra cosa.

   Lo que cambia es para qué sirve. Antes era un presupuesto: cuánto consume la
   casa al mes, para restarle la despensa y sacar cuánto falta comprar. Ahora es
   una lista de la que uno se acuerda: lo que nunca falta en esta casa, para que
   al escribir la lista del supermercado no haya que recordarlo todo de cero.

   Por eso la cantidad deja de ser obligatoria. Quien sabe que compra arroz
   todos los meses no tiene por qué saber cuántas libras, y ya no hace falta que
   lo sepa. La que hay escrita se conserva y se sigue leyendo; la que no, no se
   inventa. */

// El rubro de un alimento. La línea manda —se puede mover de rubro sin
// recategorizar el alimento— y, si no dice nada, sale de su categoría.
export function rubroDe(state, productId) {
  const line = state.habitualBasket.lines.find(row => row.productId === productId);
  if (line && RUBROS_IDS.includes(line.rubro)) return line.rubro;
  return rubroDeCategoria(product(state, productId)?.category);
}

// Registrar un alimento como habitual, con cantidad o sin ella. Es el camino
// que usa quien está llenando la lista por primera vez: nombre y poco más.
//
// Acepta un alimento que ya existe (`productId`) o un nombre suelto, que se
// registra en el catálogo al vuelo —igual que hace la canasta al guardarse—
// para que nadie tenga que dar de alta un producto antes de poder decir que lo
// compra siempre.
export function agregarHabitual(state, fields = {}) {
  const nombre = String(fields.name || '').trim();
  const existente = nombre ? productByName(state, nombre) : product(state, fields.productId);
  if (!existente && !nombre) throw new Error('Escribe el nombre del alimento.');
  // La unidad no es una cantidad: dice cómo se cuenta eso en esta casa, y sin
  // ella la lista del supermercado no sabría si son libras o unidades. Si no
  // viene, se hereda del alimento, que ya lo sabe.
  const unidad = UNITS.includes(fields.unit) ? fields.unit : (existente?.controlUnit || 'unidad');
  const item = existente || addProduct(state, {
    name: nombre, controlUnit: unidad, purchaseUnit: unidad,
    category: fields.category || 'otros', origin: fields.origin || 'canasta'
  });
  const cantidad = optionalQuantity(fields.quantity);
  // Volver a anotar algo que ya está en la lista no le borra la cantidad que
  // tuviera escrita. Quien lo apunta otra vez está diciendo «esto lo compro
  // siempre», no «ya no sé cuánto», y tomárselo al pie de la letra reescribiría
  // un dato que nadie pidió cambiar.
  const yaEstaba = state.habitualBasket.lines.some(row => row.productId === item.id);
  if (!yaEstaba || cantidad !== null) {
    escribirTramo(state, item.id, { quantity: cantidad, unit: unidad, priority: fields.priority, desde: fields.desde });
  }
  return actualizarHabitual(state, item.id, {
    rubro: fields.rubro,
    ...(fields.nota === undefined ? {} : { nota: fields.nota })
  });
}

// El rubro y la nota de un habitual. La nota es para quien hace la compra —«el
// de la bolsa azul», «el grande»—, no para quien cocina: esa va en la
// preparación.
export function actualizarHabitual(state, productId, fields = {}) {
  const line = state.habitualBasket.lines.find(row => row.productId === productId);
  if (!line) return null;
  if ('rubro' in fields && RUBROS_IDS.includes(fields.rubro)) line.rubro = fields.rubro;
  if (!RUBROS_IDS.includes(line.rubro)) line.rubro = rubroDeCategoria(product(state, productId)?.category);
  if ('nota' in fields) line.nota = String(fields.nota || '').trim();
  state.habitualBasket.updatedAt = todayISO();
  return line;
}

// Los habituales agrupados por rubro, en el orden en que se preguntan y sin los
// rubros que estén vacíos. Es lo que necesita cualquier pantalla que los
// enseñe, y así no hay dos agrupaciones distintas dando vueltas.
export function habitualesPorRubro(state, month = null) {
  const grupos = new Map(RUBROS_IDS.map(id => [id, []]));
  const guardadas = new Map(state.habitualBasket.lines.map(row => [row.productId, row]));
  for (const linea of habitualLines(state, month)) {
    const guardada = guardadas.get(linea.productId);
    const rubro = RUBROS_IDS.includes(guardada?.rubro) ? guardada.rubro : rubroDeCategoria(product(state, linea.productId)?.category);
    grupos.get(rubro).push({ ...linea, rubro, nota: guardada?.nota || '' });
  }
  return [...grupos]
    .filter(([, lineas]) => lineas.length)
    .map(([rubro, lineas]) => ({
      rubro,
      lineas: lineas.sort((a, b) => (product(state, a.productId)?.name || '').localeCompare(product(state, b.productId)?.name || ''))
    }));
}

// Preguntar por un mes no puede abrirlo. Si leer noviembre lo creara, la app
// acabaría con doce meses «tocados» que nadie tocó, y ya no se podría distinguir
// un mes con excepciones de un mes que simplemente se miró.
export function monthChanges(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  return state.monthOverrides[month] || { month, changes: [] };
}

export function openMonthChanges(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (!state.monthOverrides[month]) {
    const date = todayISO();
    state.monthOverrides[month] = { month, changes: [], createdAt: date, updatedAt: date };
  }
  return state.monthOverrides[month];
}

// La canasta real de un mes: el hábito con sus excepciones ya aplicadas. Es lo
// único que hay que mirar para calcular una compra, y de dónde sale cada línea
// queda escrito para poder explicárselo a quien pregunte por qué está ahí.
export function effectiveBasket(state, month) {
  const changes = monthChanges(state, month).changes;
  const byProduct = new Map(changes.map(change => [change.productId, change]));
  // La canasta tal como era ese mes: cada línea con el tramo que le tocaba, sin
  // las que todavía no habían entrado ni las que ya se habían dado de baja. Es
  // lo que permite decir «el pollo entra en mi canasta desde noviembre» sin que
  // octubre, que ya pasó, aparezca comprando pollo, y «ahora son 120 tazas» sin
  // que julio diga que también lo eran.
  const vigentes = habitualLines(state, month);
  const habituales = new Set(vigentes.map(line => line.productId));
  const out = [];
  for (const line of vigentes) {
    const change = byProduct.get(line.productId);
    if (!change) { out.push({ productId: line.productId, quantity: line.quantity, unit: line.unit, priority: line.priority, source: 'habitual' }); continue; }
    if (change.removed) continue;
    out.push({ productId: change.productId, quantity: change.quantity, unit: change.unit, priority: change.priority, source: 'cambio' });
  }
  // Lo que no está en el hábito solo vive en este mes. Se mira la pertenencia y
  // no la marca guardada porque un alimento puede haber salido del hábito
  // después de escrito el cambio, y entonces la marca mentiría.
  for (const change of changes) {
    if (habituales.has(change.productId) || change.removed) continue;
    out.push({ productId: change.productId, quantity: change.quantity, unit: change.unit, priority: change.priority, source: 'extra' });
  }
  return out;
}

export function setMonthChange(state, month, productId, fields = {}) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const override = openMonthChanges(state, month);
  const habitual = habitualLines(state, month).find(line => line.productId === productId) || null;
  const previous = override.changes.find(change => change.productId === productId) || null;
  const unit = fields.unit ?? previous?.unit ?? habitual?.unit;
  if (!UNITS.includes(unit)) throw new Error('Elige la unidad del consumo del mes.');
  const change = {
    id: previous?.id || nextId(state, 'cambio'),
    productId,
    quantity: 'quantity' in fields ? optionalQuantity(fields.quantity) : previous?.quantity ?? habitual?.quantity ?? null,
    unit,
    priority: PRIORITIES.includes(fields.priority) ? fields.priority : previous?.priority || habitual?.priority || 'frecuente',
    removed: 'removed' in fields ? Boolean(fields.removed) : Boolean(previous?.removed),
    extra: !habitual,
    note: 'note' in fields ? String(fields.note || '').trim() : previous?.note || '',
    createdAt: previous?.createdAt || todayISO()
  };
  // Como mucho un cambio por producto y mes: volver a cambiarlo corrige el que
  // ya había en vez de apilar dos verdades sobre el mismo alimento.
  if (previous) override.changes[override.changes.indexOf(previous)] = change;
  else override.changes.push(change);
  override.updatedAt = todayISO();
  return change;
}

export function removeMonthChange(state, month, productId) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const override = state.monthOverrides[month];
  if (!override) return false;
  const before = override.changes.length;
  override.changes = override.changes.filter(change => change.productId !== productId);
  if (before === override.changes.length) return false;
  override.updatedAt = todayISO();
  return true;
}

// Pasar un cambio al hábito es siempre explícito y alimento por alimento: es lo
// que separa «este mes compré más pollo» de «en esta casa ahora se come más
// pollo». Confundirlos reescribiría la costumbre sin que nadie lo pidiera.
export function promoteToHabitual(state, month, productIds, desde = null) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (desde !== null && !validMonth(desde)) throw new Error('Elige desde qué mes entra en tus productos habituales.');
  const wanted = [...new Set(productIds || [])];
  if (!wanted.length) throw new Error('Selecciona qué alimentos pasan a los productos habituales.');
  const override = state.monthOverrides[month];
  if (!override || !override.changes.length) throw new Error('Ese mes no tiene cambios que pasar a los productos habituales.');
  let applied = 0;
  for (const id of wanted) {
    const change = override.changes.find(row => row.productId === id);
    if (!change) continue;
    if (change.removed) removeHabitualLine(state, id);
    // Desde qué mes cuenta. Sin decir nada cuenta desde el mes del cambio, que
    // es donde la casa lo compró por primera vez; nunca desde el principio de
    // los tiempos, que reescribiría meses que ya pasaron.
    else writeHabitualLine(state, { ...change, desde: desde || month });
    // La excepción del mes solo se retira cuando la norma nueva ya cubre ese
    // mes. Con vigencia a partir de noviembre, octubre sigue necesitando su
    // excepción: si se quitara, octubre se quedaría sin un alimento que sí
    // compró, y eso es reescribir un mes que ya pasó.
    const vigenteAqui = !desde || desde <= month;
    if (vigenteAqui) override.changes = override.changes.filter(row => row.productId !== id);
    applied++;
  }
  if (applied) override.updatedAt = todayISO();
  return applied;
}

export function monthExtras(state, month) {
  const habituales = new Set(habitualLines(state, month).map(line => line.productId));
  return monthChanges(state, month).changes.filter(change => !habituales.has(change.productId) && !change.removed);
}

export function monthBasketSummary(state, month) {
  const basket = effectiveBasket(state, month);
  const habituales = new Set(habitualLines(state, month).map(line => line.productId));
  return {
    habituales: basket.filter(line => line.source === 'habitual').length,
    cambiados: basket.filter(line => line.source === 'cambio').length,
    quitados: monthChanges(state, month).changes.filter(change => change.removed && habituales.has(change.productId)).length,
    extras: basket.filter(line => line.source === 'extra').length
  };
}


/* ── Personas, preparaciones y menú ────────────────────────────────────── */

// Una restricción es una fila con tres cosas: qué alimento, escrito cómo, y por
// qué se evita. El «por qué» es lo único que cambia lo que hace quien cocina:
// un maní que mata no se trata igual que una berenjena que no gusta.
//
// `motivo` puede ser `null`, y significa exactamente «todavía no se ha dicho».
// No se rellena solo: inventar un motivo es lo único que esta parte de la app no
// puede permitirse. Mientras esté sin decir, la app avisa igual que siempre.
export const restriccionesDe = person => (Array.isArray(person?.restricciones) ? person.restricciones : []);
export const alimentosProhibidos = person => new Set(restriccionesDe(person).filter(fila => fila.productId).map(fila => fila.productId));
export const restriccionDe = (person, productId) => restriccionesDe(person).find(fila => fila.productId === productId) || null;

// Quién vive hoy en la casa. Una persona dada de baja no desaparece —su nombre
// tiene que seguir leyéndose en las comidas de marzo— pero deja de contar para
// lo que se va a cocinar a partir de ahora.
export const esActiva = person => person?.activo !== false;
export const personasActivas = state => state.people.filter(esActiva);

const claveDeTexto = texto => normalizeName(String(texto || ''));

// Deja la lista en su forma buena: sin repetidos, sin filas vacías, sin
// identificadores de alimentos que ya no existen y sin motivos inventados.
function normalizarRestricciones(state, filas) {
  const salida = [];
  const vistas = new Set();
  for (const fila of filas || []) {
    const enlazado = fila?.productId && product(state, fila.productId) ? fila.productId : null;
    const texto = String(fila?.texto || '').trim();
    if (!enlazado && !texto) continue;
    const llave = enlazado ? `id:${enlazado}` : `txt:${claveDeTexto(texto)}`;
    if (vistas.has(llave)) continue;
    vistas.add(llave);
    salida.push({
      productId: enlazado,
      texto: enlazado ? '' : texto,
      motivo: MOTIVOS_DE_RESTRICCION.includes(fila?.motivo) ? fila.motivo : null
    });
  }
  return salida;
}

// De dónde salen las restricciones que se van a guardar. Hay tres casos y los
// tres importan:
//
//  · Viene `restricciones`: es la forma de hoy y manda, aunque venga vacía —
//    vaciarla es una orden legítima—.
//  · Vienen las dos listas viejas: se convierten, y el motivo que ya tuviera
//    cada línea se conserva. Guardar desde una pantalla que todavía no pregunta
//    el motivo no puede borrar el que alguien escribió en otra.
//  · No viene ninguna: se deja lo que la persona ya tenía.
function restriccionesDesdeCampos(fields, person) {
  if (Array.isArray(fields.restricciones)) return fields.restricciones;
  if (!Array.isArray(fields.restrictions) && !Array.isArray(fields.pendingRestrictions)) return restriccionesDe(person);
  const previas = restriccionesDe(person);
  const motivoPrevio = (productId, texto) => previas.find(fila =>
    productId ? fila.productId === productId : claveDeTexto(fila.texto) === claveDeTexto(texto))?.motivo ?? null;
  return [
    ...(fields.restrictions || []).map(productId => ({ productId, texto: '', motivo: motivoPrevio(productId, '') })),
    ...(fields.pendingRestrictions || []).map(texto => ({ productId: null, texto, motivo: motivoPrevio(null, texto) }))
  ];
}

export function upsertPerson(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la persona.');
  let person = state.people.find(item => item.id === fields.id);
  if (!person) { person = { id: nextId(state, 'persona') }; state.people.push(person); }
  person.name = name;
  person.kind = CLASES_DE_PERSONA.includes(fields.kind) ? fields.kind : person.kind || 'adulto';
  person.activo = 'activo' in fields ? fields.activo !== false : esActiva(person);
  person.restricciones = normalizarRestricciones(state, restriccionesDesdeCampos(fields, person));
  person.habitual = (fields.habitual || []).map(item => ({ productId: item.productId, quantity: quantity(item.quantity), unit: item.unit }));
  // Una restricción escrita por nombre cuando el alimento todavía no existe no
  // se pierde: se guarda como texto y se enlaza en cuanto el alimento aparezca.
  // Bloquear a quien registra su casa por un producto que aún no creó sería
  // justo el orden invertido que hace que nadie termine de configurar nada.
  linkPendingRestrictions(state, person);
  return person;
}

// Dar de baja no es borrar. La persona se queda en la casa con su nombre, sus
// restricciones y su sitio en todas las comidas que ya se cocinaron; lo único
// que cambia es que a partir de ahora no cuenta para lo que se va a preparar.
// Por eso aquí no se toca ni un plan, ni una ausencia, ni una preparación: el
// historial de marzo tiene que seguir diciendo lo que decía en marzo.
export function setPersonActive(state, personId, activo) {
  const person = state.people.find(item => item.id === personId);
  if (!person) throw new Error('Esa persona ya no está en la casa.');
  person.activo = activo !== false;
  return person;
}

export function linkPendingRestrictions(state, person) {
  const porProducto = new Map();
  const filas = [];
  for (const fila of restriccionesDe(person)) {
    const id = fila.productId || productByName(state, fila.texto)?.id || null;
    if (!id) { filas.push(fila); continue; }
    const previa = porProducto.get(id);
    // El mismo alimento escrito dos veces —una por nombre y otra de la lista—
    // es una sola restricción. Si una de las dos traía motivo, ese se queda.
    if (previa) { if (!previa.motivo && fila.motivo) previa.motivo = fila.motivo; continue; }
    const nueva = { productId: id, texto: '', motivo: fila.motivo || null };
    porProducto.set(id, nueva);
    filas.push(nueva);
  }
  person.restricciones = filas;
  return person;
}
/* Marcar que alguien no come en casa no cambia lo que se cocina.

   Antes sí: quitaba a la persona de la comida, borraba los alimentos que
   llevaran su nombre y, si se quedaba sin nadie, convertía la comida en «fuera
   de casa» o la borraba del todo. Una olla de arroz no se encoge porque un hijo
   avise a las seis de que come fuera, y desde luego la cena de la casa no se
   cancela por eso.

   Así que aquí solo se anota la ausencia. Sirve para no marcar a esa persona en
   las comidas que se creen después, y para decirlo en la pantalla del día. Lo
   que ya estaba puesto se queda exactamente como estaba. */
export function setAbsence(state, date, slot, personId, absent) {
  state.absences = state.absences.filter(item => !(item.date === date && item.slot === slot && item.personId === personId));
  if (absent) state.absences.push({ date, slot, personId });
}
export const isAbsent = (state, date, slot, personId) => state.absences.some(item => item.date === date && item.slot === slot && item.personId === personId);
export function upsertRecipe(state, fields) {
  const name = String(fields.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la preparación.');
  // Los momentos se guardan en el orden del día, no en el que se fueron
  // tocando: «desayuno y cena» se lee mejor que «cena y desayuno».
  const marcados = new Set(fields.uses || []);
  const uses = MOMENTOS_IDS.filter(id => marcados.has(id));
  if (!uses.length) throw new Error('Selecciona en cuáles momentos suelen comerla.');
  // Los alimentos que lleva son opcionales, y su cantidad también. Una casa
  // apunta «locrio: arroz, pollo, aceitunas» mucho antes de saber cuántas
  // tazas, y perder la preparación entera por no saber el número sería el peor
  // de los dos males. Sin cantidad no se guarda unidad: «3 de nada» no dice
  // nada, y dejarla escrita haría creer que hay una medida donde no la hay.
  const items = (fields.items || []).map(item => {
    if (!product(state, item.productId)) throw new Error('Selecciona un alimento de la lista.');
    const cantidad = optionalQuantity(item.quantity);
    if (cantidad !== null && !UNITS.includes(item.unit)) throw new Error('Elige la unidad de los alimentos que lleven cantidad.');
    return { productId: item.productId, quantity: cantidad, unit: cantidad === null ? null : item.unit, personId: item.personId || null };
  });
  // Una preparación se guarda con el nombre y poco más. Exigir un alimento
  // convertía «mangú con salami» en un formulario de inventario antes de dejar
  // apuntar la idea, y en una casa las cantidades se afinan después —o nunca—.
  // Sin alimentos, la preparación sirve igual para llenar el calendario; lo
  // único que no hace es aportar nada a la compra calculada desde el menú, y la
  // compra ya avisa de eso por su cuenta.
  let recipe = state.recipes.find(item => item.id === fields.id);
  if (!recipe) { recipe = { id: nextId(state, 'preparacion') }; state.recipes.push(recipe); }
  // Una preparación es de la casa. No guarda a quién le toca: preguntarlo aquí
  // era pedir dos veces lo mismo —una en la preparación y otra al ponerla en el
  // calendario— y la respuesta de la preparación casi nunca era la buena, porque
  // quién come depende del día y no del plato. Si un día come solo una parte de
  // la casa, eso se marca ese día, que es cuando se sabe.
  Object.assign(recipe, {
    name, uses, items,
    servings: fields.servings === '' || fields.servings === undefined || fields.servings === null ? null : quantity(fields.servings),
    note: String(fields.note || '').trim()
  });
  delete recipe.covers;
  return recipe;
}
export function deleteRecipe(state, id) {
  state.recipes = state.recipes.filter(item => item.id !== id);
  // Calendar entries keep their own quantities and title.
}
export function planFor(state, date, slot) { return state.plans.find(item => item.date === date && item.slot === slot); }
// Sin decir nada, una comida es para toda la casa. Solo quien esté dado de baja
// o marcado fuera ese día se queda fuera de la cuenta.
export function effectiveParticipants(state, recipe, date, slot, selected) {
  // Una preparación es familiar mientras nadie diga lo contrario ese día. Antes
  // la preparación traía su propia lista de personas y ganaba por encima de la
  // casa; ahora la excepción se marca donde se sabe, que es en el calendario.
  const ids = selected || state.people.map(item => item.id);
  return ids.filter(id => {
    const person = state.people.find(item => item.id === id);
    if (!person) return false;
    // Una selección explícita manda —editar una comida de antes no puede
    // expulsar a quien ya figuraba en ella—; el reparto automático, no.
    if (!selected && !esActiva(person)) return false;
    return !isAbsent(state, date, slot, id);
  });
}

/* ── Avisar, no prohibir ───────────────────────────────────────────────────

   Antes, poner una comida con un alimento que alguien evita lanzaba un error y
   no se guardaba. Eso está mal por dos motivos.

   El primero es que la app no sabe lo suficiente para prohibir: en una casa
   real se cocina el mismo arroz con leche y a la niña se le hace otra cosa, y
   eso es exactamente lo que estaba pasando cuando la app decía que no.

   El segundo es que prohibirlo todo por igual borra la diferencia que importa.
   Un maní que manda al hospital y una berenjena que no gusta no son el mismo
   aviso, y cuando las dos cosas bloquean igual, la gente aprende a esquivar el
   bloqueo y deja de leer los dos.

   Así que ahora se avisa, con la gravedad que toca, y se deja decidir. Quien
   mira el aviso tiene las tres salidas: cambiar la preparación, cambiar quién
   come, o guardarla igual porque va a cocinar otra cosa para esa persona. */

export const GRAVEDADES = { alergia: 3, intolerancia: 2, preferencia: 1 };
export const gravedadDe = motivo => GRAVEDADES[motivo] ?? 2;
// La peor gravedad de una comida entera: es la que decide el color del aviso y
// si se lee como una alerta o como una nota al pie.
export const gravedadDeLaComida = choques => choques.reduce((peor, choque) => Math.max(peor, choque.gravedad), 0);

// Los choques de una comida, uno por cada pareja de alimento y persona, con el
// motivo que esa persona tenía anotado. Ordenados por gravedad: lo que puede
// hacer daño se lee primero.
export function choquesDeLaComida(state, items, participants) {
  const choques = [];
  for (const item of items) {
    for (const id of participants) {
      const person = state.people.find(p => p.id === id);
      if (!person || !alimentosProhibidos(person).has(item.productId)) continue;
      if (item.personId && item.personId !== id) continue;
      const fila = restriccionDe(person, item.productId);
      choques.push({
        productId: item.productId,
        producto: product(state, item.productId)?.name || 'Alimento eliminado',
        personId: id,
        persona: person.name,
        motivo: fila?.motivo ?? null,
        gravedad: gravedadDe(fila?.motivo)
      });
    }
  }
  return choques.sort((a, b) => b.gravedad - a.gravedad || a.persona.localeCompare(b.persona));
}

// La gravedad de la comida entera: la del peor de sus choques.
/* ── De dónde salió cada comida ────────────────────────────────────────────

   Un calendario lleno no dice quién lo llenó, y eso frena a quien lo mira:
   delante del martes con mangú no se sabe si lo puso él, si vino de «los martes
   mangú», si se arrastró del mes pasado o si fue el arreglo del jueves que vino
   su madre. Sin saberlo nadie se atreve a tocarlo.

   Se guarda en la comida porque casi nada de esto se deduce después:
   `routineId` delata a la rutina, pero nada distingue una comida traída del mes
   pasado de una escrita a mano esta mañana. */

// De dónde salió cada comida del calendario.
//
// Tres de las cinco ya no las produce nadie. Eran de cuando la app llenaba el
// calendario sola: «rutina» la ponía una costumbre guardada, «mes anterior» una
// copia del mes de antes, y «sugerida» el relleno automático, que elegía el
// plato por ti. Hoy las comidas las pone una persona, y por eso la app solo
// escribe «cambio manual» y «excepción».
//
// Las tres se quedan en la lista porque hay comidas guardadas con ellas en
// teléfonos reales. Borrarlas dejaría a esas comidas sin poder decir de dónde
// vinieron, que es exactamente lo que esta lista promete.
export const ORIGENES = [
  { id: 'rutina', etiqueta: 'Rutina', detalle: 'Venía de una costumbre que guardaste' },
  { id: 'mes-anterior', etiqueta: 'Mes anterior', detalle: 'Se trajo del mes pasado' },
  { id: 'excepcion', etiqueta: 'Excepción', detalle: 'Ese día se sale de lo normal' },
  { id: 'manual', etiqueta: 'Cambio manual', detalle: 'La pusiste tú, ese día' },
  { id: 'sugerida', etiqueta: 'Sugerida', detalle: 'La eligió la app cuando rellenaba el mes sola' }
];
export const ORIGENES_IDS = ORIGENES.map(item => item.id);
export const etiquetaDeOrigen = id => ORIGENES.find(item => item.id === id)?.etiqueta || 'Cambio manual';
export const detalleDeOrigen = id => ORIGENES.find(item => item.id === id)?.detalle || '';

// Una comida guardada antes de que esto existiera no se inventa: se deduce lo
// que se puede —la rutina deja marca, y un «fuera de casa» es una excepción por
// definición— y lo demás fue un cambio a mano, que es lo que era.
export function origenDe(plan) {
  if (!plan) return null;
  if (ORIGENES_IDS.includes(plan.origen)) return plan.origen;
  if (plan.routineId) return 'rutina';
  if (plan.kind === 'outside' || plan.kind === 'order') return 'excepcion';
  return 'manual';
}

// Un origen que no se dice se deduce de lo que se sabe en ese momento.
const normalizarOrigen = (origen, routineId, kind) => {
  if (ORIGENES_IDS.includes(origen)) return origen;
  if (routineId) return 'rutina';
  return kind === 'outside' || kind === 'order' ? 'excepcion' : 'manual';
};

// `routineId` deja escrito que esta comida la puso una rutina y no una persona.
// Sin esa marca no se podría deshacer «los domingos fuera» sin borrar también
// los domingos que alguien decidió a mano.
export function makeRecipePlan(state, recipeId, date, slot, selected, routineId = null, origen = null) {
  const recipe = state.recipes.find(item => item.id === recipeId);
  if (!recipe || !recipe.uses.includes(slot)) throw new Error('Esta preparación no está disponible para esa comida.');
  if (planFor(state, date, slot)) throw new Error('Esa comida ya tiene un plan.');
  const participants = effectiveParticipants(state, recipe, date, slot, selected);
  if (personasActivas(state).length && !participants.length) throw new Error('Selecciona al menos una persona que comerá en casa.');
  const rawItems = recipe.items.filter(item => !item.personId || participants.includes(item.personId));
  // Un alimento que alguien evita ya no impide guardar la comida: se avisa en
  // la pantalla, con la gravedad que toca, y decide quien cocina.
  const plan = { id: nextId(state, 'comida'), date, slot, kind: 'recipe', recipeId, routineId: routineId || null, origen: normalizarOrigen(origen, routineId, 'recipe'), title: recipe.name, note: recipe.note, servings: recipe.servings, participants, items: rawItems.map(item => ({ ...item, id: nextId(state, 'alimento') })) };
  state.plans.push(plan);
  return plan;
}
/* ── Los seis estados de una comida ────────────────────────────────────────

   · `recipe`    — una preparación guardada del catálogo de la casa.
   · `suelta`    — una comida escrita a mano, ese día y solo ese día. No
                   entra en el catálogo: no se va a repetir.
   · `linked`    — lo que sobró de otra comida, comido otro día.
   · `outside`   — se come fuera.
   · `order`     — se pide.
   · `unplanned` — se dejó dicho que todavía no se sabe. No es lo mismo que
                   un hueco: un hueco es que nadie lo ha mirado.

   `ESTADOS_SIN_COMIDA` son los tres que no nombran ningún plato, y son los
   únicos que `setStatusPlan` sabe escribir. */
export const ESTADOS_SIN_COMIDA = ['outside', 'order', 'unplanned'];
export const CLASES_DE_COMIDA = ['recipe', 'suelta', 'linked', ...ESTADOS_SIN_COMIDA];

export function setStatusPlan(state, date, slot, kind, routineId = null, origen = null) {
  if (!ESTADOS_SIN_COMIDA.includes(kind)) throw new Error('Estado de comida no válido.');
  if (planFor(state, date, slot)) throw new Error('Elimina o cambia primero el plan existente.');
  const plan = { id: nextId(state, 'comida'), date, slot, kind, routineId: routineId || null, origen: normalizarOrigen(origen, routineId, kind), participants: [], items: [] };
  state.plans.push(plan);
  return plan;
}
/* ── Una comida escrita a mano ─────────────────────────────────────────────

   Lo único obligatorio es el nombre. Ni alimentos, ni cantidades, ni
   momentos en los que suele comerse: nada de eso hace falta para decir lo
   que se cena el jueves, y pedirlo convertiría una frase en un formulario.

   No se guarda en `state.recipes` a propósito. El catálogo es lo que esta
   casa **sabe preparar**; una comida suelta es lo que pasó un día. Mezclarlas
   llenaría el catálogo de cosas que nadie va a volver a elegir, y la lista de
   preparaciones es justo la que tiene que poder leerse entera. */
export function anotarComidaSuelta(state, date, slot, fields = {}) {
  if (!validDate(date)) throw new Error('Elige una fecha válida.');
  if (!SLOTS.includes(slot)) throw new Error('Elige en qué comida del día.');
  const title = String(fields.titulo ?? fields.title ?? '').trim();
  if (!title) throw new Error('Escribe qué se come.');
  if (planFor(state, date, slot)) throw new Error('Esa comida ya tiene un plan.');
  const participants = fields.participants || personasActivas(state).map(persona => persona.id);
  const plan = {
    id: nextId(state, 'comida'), date, slot, kind: 'suelta',
    recipeId: null, routineId: null, origen: 'manual',
    title, note: String(fields.nota ?? fields.note ?? '').trim(),
    participants: participants.filter(id => !isAbsent(state, date, slot, id)),
    items: []
  };
  state.plans.push(plan);
  return plan;
}

export function dependents(state, sourceId) { return state.plans.filter(plan => plan.kind === 'linked' && plan.sourceId === sourceId); }
export function reservedQuantity(state, sourceId, itemId) {
  return round(dependents(state, sourceId).flatMap(plan => plan.reservedItems || []).filter(item => item.sourceItemId === itemId).reduce((sum, item) => sum + item.quantity, 0));
}
/* ── Usar lo que sobró ─────────────────────────────────────────────────────

   Se elige una comida que ya está puesta y se pone otra vez en otro momento.
   No se pregunta cuánto: la app no sabe cuánto sobró, quien cocinó sí, y
   pedirle un número que va a inventar para poder seguir es pedirle que
   mienta.

   Queda enlazada a la de origen —`sourceId`— y eso sirve para dos cosas: el
   calendario puede decir de dónde sale, y borrar la de origen avisa antes
   en vez de dejar una comida colgando de algo que ya no existe.

   Las comidas vinculadas de antes llevaban `reservedItems` con las cantidades
   apartadas de cada alimento. Se siguen leyendo y se siguen pintando; las
   nuevas nacen con esa lista vacía, que es lo que significa «lo que sobre». */
export function reutilizarComida(state, sourceId, date, slot, participants = null) {
  const source = state.plans.find(item => item.id === sourceId);
  if (!source || !['recipe', 'suelta'].includes(source.kind)) throw new Error('Elige una comida del calendario.');
  if (!validDate(date) || !SLOTS.includes(slot)) throw new Error('Elige cuándo se come.');
  if (date < source.date || (date === source.date && SLOTS.indexOf(slot) <= SLOTS.indexOf(source.slot))) throw new Error('Lo que sobra se come después, no antes.');
  if (planFor(state, date, slot)) throw new Error('Esa comida ya tiene un plan.');
  const gente = (participants || personasActivas(state).map(persona => persona.id)).filter(id => !isAbsent(state, date, slot, id));
  const plan = {
    id: nextId(state, 'comida'), date, slot, kind: 'linked', sourceId,
    routineId: null, origen: 'manual', title: source.title, note: source.note || '',
    participants: gente, reservedItems: [], items: []
  };
  state.plans.push(plan);
  return plan;
}

export function updatePlan(state, planId, fields) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan || !['recipe', 'suelta', 'linked'].includes(plan.kind)) throw new Error('Comida no encontrada.');
  // Opcional, igual que en la preparación de la que salió: una comida puede
  // llevar un alimento del que todavía no se sabe cuánto.
  const items = fields.items.map(item => ({ ...item, quantity: optionalQuantity(item.quantity) }));
  if (plan.kind === 'recipe') {
    for (const old of plan.items) {
      const replacement = items.find(item => item.id === old.id);
      const reserved = reservedQuantity(state, plan.id, old.id);
      if (reserved > (replacement?.quantity || 0) + EPS) throw new Error('La cantidad preparada no puede ser menor que la parte reservada.');
      if (reserved && (replacement.productId !== old.productId || replacement.unit !== old.unit || replacement.personId !== old.personId)) throw new Error('Una comida vinculada depende de ese alimento. Quita o cambia primero la reserva.');
    }
  }
  const participants = fields.participants || plan.participants;
  if (participants.some(id => isAbsent(state, plan.date, plan.slot, id))) throw new Error('Una de las personas seleccionadas está marcada fuera de casa.');

  plan.items = items;
  plan.participants = participants;
  plan.note = String(fields.note || '').trim();
  plan.title = String(fields.title || plan.title).trim();
  // Quien rehace una comida a mano deja de tener delante lo que puso la rutina,
  // y la pantalla tiene que decirlo: si no, «viene de la rutina» acabaría
  // describiendo comidas que ya no se parecen en nada a ella.
  plan.origen = 'manual';
}
export function deletePlan(state, id, cascade = false) {
  const children = dependents(state, id);
  if (children.length && !cascade) throw new Error(`Esta preparación tiene ${children.length} comida(s) que dependen de ella.`);
  const ids = new Set([id, ...children.map(item => item.id)]);
  state.plans = state.plans.filter(item => !ids.has(item.id));
  return children.length;
}
export function movePlan(state, id, date, slot) {
  const plan = state.plans.find(item => item.id === id);
  if (!plan || (planFor(state, date, slot) && planFor(state, date, slot).id !== id)) throw new Error('El destino ya está ocupado.');
  if (plan.kind === 'linked' && date <= state.plans.find(item => item.id === plan.sourceId)?.date) throw new Error('La comida reservada debe quedar después de su preparación.');
  if (dependents(state, id).some(item => item.date <= date)) throw new Error('La preparación debe quedar antes de las comidas que dependen de ella.');
  if (plan.participants.some(personId => isAbsent(state, date, slot, personId))) throw new Error('Una persona de esta comida está marcada fuera de casa en el destino. Ajusta los participantes antes de moverla.');
  plan.date = date; plan.slot = slot;
}
export function copyPlan(state, id, date, slot) {
  const source = state.plans.find(item => item.id === id);
  if (!source || planFor(state, date, slot)) throw new Error('El destino ya está ocupado.');
  if (source.kind === 'linked') throw new Error('Copia la preparación original y vincula de nuevo la parte reservada.');
  const copy = structuredClone(source);
  copy.id = nextId(state, 'comida'); copy.date = date; copy.slot = slot;
  // La copia la pidió una persona, no la rutina que puso el original: heredar la
  // marca haría que deshacer la rutina se llevara por delante una comida que
  // alguien colocó a mano.
  copy.routineId = null;
  copy.origen = 'manual';
  copy.participants = copy.participants.filter(personId => !isAbsent(state, date, slot, personId));
  if (personasActivas(state).length && source.participants.length && !copy.participants.length) throw new Error('No hay participantes disponibles para esa comida.');
  copy.items = copy.items.filter(item => !item.personId || copy.participants.includes(item.personId)).map(item => ({ ...item, id: nextId(state, 'alimento') }));

  state.plans.push(copy);
  return copy;
}


/* ── Cuánto hay decidido ───────────────────────────────────────────────────

   Contar no es proponer. Esta función mira unos días y dice cuántas comidas
   están decididas y cuántas no; no elige ninguna, no rellena ninguna y no
   sugiere nada.

   Cuenta las tres de todos los días. Las meriendas suman cuando están
   puestas, pero no restan cuando no lo están: un día sin merienda está
   completo, porque hay casas que no meriendan y no les falta nada.

   Una comida fuera o pedida está decidida: no es un hueco. Contarla como
   pendiente empujaría a planificar un almuerzo que ya se sabe que nadie va a
   cocinar. */
export function comidasDecididas(state, dias) {
  const huecos = dias.length * SLOTS_PRINCIPALES.length;
  let encasa = 0, fuera = 0, pedido = 0, pendientes = 0, meriendas = 0;
  for (const date of dias) for (const slot of SLOTS) {
    const plan = planFor(state, date, slot);
    const opcional = !SLOTS_PRINCIPALES.includes(slot);
    if (!plan || plan.kind === 'unplanned') { if (!opcional) pendientes += 1; continue; }
    if (opcional) { meriendas += 1; continue; }
    if (plan.kind === 'outside') { fuera += 1; continue; }
    if (plan.kind === 'order') { pedido += 1; continue; }
    encasa += 1;
  }
  return { dias: dias.length, huecos, encasa, fuera, pedido, pendientes, meriendas, decididas: huecos - pendientes };
}

/* ── Inventario: compras, revisiones y correcciones ────────────────────── */

function eventList(state) {
  return [
    ...state.purchases.map(item => ({ kind: 'purchase', item })),
    ...state.reviews.filter(item => item.status === 'confirmed').map(item => ({ kind: 'review', item })),
    ...state.corrections.map(item => ({ kind: 'correction', item }))
  ].sort((a, b) => a.item.date.localeCompare(b.item.date) || a.item.seq - b.item.seq);
}
export function balances(state, cutoff = null) {
  const result = Object.fromEntries(state.products.map(item => [item.id, Number(state.opening[item.id] || 0)]));
  const problems = [];
  for (const event of eventList(state)) {
    if (cutoff && (event.item.date > cutoff.date || (event.item.date === cutoff.date && event.item.seq >= cutoff.seq))) break;
    if (event.kind === 'purchase') for (const line of event.item.lines) result[line.productId] = round((result[line.productId] || 0) + line.controlQuantity);
    if (event.kind === 'review') for (const [id, amount] of Object.entries(event.item.consumed)) result[id] = round((result[id] || 0) - Number(amount || 0));
    if (event.kind === 'correction') result[event.item.productId] = round((result[event.item.productId] || 0) + event.item.delta);
    for (const [id, amount] of Object.entries(result)) if (amount < -EPS) problems.push({ event: event.item.id, productId: id, amount });
  }
  return { values: result, problems };
}
export const inventoryNow = state => balances(state, { date: addDays(todayISO(), 1), seq: -Infinity }).values;
export function addPurchase(state, fields) {
  const lines = (fields.lines || []).filter(line => Number(line.quantity) > 0).map(line => {
    const amount = quantity(line.quantity);
    if (line.unit === 'paquete' && !Number.isInteger(amount)) throw new Error('Los paquetes comprados deben ser completos.');
    const controlQuantity = convert(state, line.productId, amount, line.unit);
    if (controlQuantity === null) throw new Error(`Configura la equivalencia de ${product(state, line.productId)?.name || 'este producto'} antes de confirmar.`);
    return { productId: line.productId, quantity: amount, unit: line.unit, controlQuantity };
  });
  if (!lines.length) throw new Error('Agrega al menos un producto a la compra.');
  // Queda escrito con qué base se calculó. Sin eso, una compra que salió de la
  // canasta y otra que salió del menú son indistinguibles al mirarlas después,
  // y no se puede explicar por qué se pidió esa cantidad.
  const purchase = { id: nextId(state, 'compra'), seq: state.seq, date: fields.date || todayISO(), period: fields.period || null, basis: fields.basis || null, lines };
  state.purchases.push(purchase);
  return purchase;
}
// La última compra anotada antes de una fecha. Es de donde sale la lista de
// una revisión: lo que se revisa es lo que se trajo, no el catálogo entero.
export function ultimaCompra(state, hasta = todayISO()) {
  return [...state.purchases].filter(compra => compra.date <= hasta).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq).pop() || null;
}

/* ── De qué se pregunta en una revisión ────────────────────────────────────

   Antes se preguntaba por todo lo que tuviera existencias: cuarenta alimentos,
   incluidos los que nadie ha tocado desde marzo. Revisar cuarenta cosas de
   corrido es exactamente donde se abandona una revisión.

   Ahora se parte de la compra anterior —lo que se trajo es lo que se está
   gastando, y es lo que hay que contar antes de volver al colmado— y el resto
   sigue estando a un toque, para quien quiera repasar la despensa entera. */

export const ORIGENES_DE_REVISION = ['compra', 'todo'];

export function createReview(state, date = todayISO(), mode = 'restante', origen = 'compra') {
  const compra = ultimaCompra(state, date);
  const review = {
    id: nextId(state, 'revision'), seq: state.seq, date, status: 'draft',
    mode: mode === 'consumido' ? 'consumido' : 'restante',
    // Sin ninguna compra anotada no hay «lo de la compra anterior» que enseñar,
    // así que se cae a la despensa entera en vez de a una lista vacía.
    origen: ORIGENES_DE_REVISION.includes(origen) && compra ? origen : 'todo',
    purchaseId: compra?.id || null,
    productIds: [], consumed: {}, remaining: {}
  };
  state.reviews.push(review);
  syncReviewProducts(state, review);
  return review;
}
export function reviewAvailability(state, review) { return balances(state, { date: review.date, seq: review.seq }).values; }

// Qué alimentos entran en la revisión. Lo ya contestado no se cae nunca, ni
// siquiera al cambiar de alcance: sería tirar trabajo que alguien ya hizo.
export function syncReviewProducts(state, review) {
  const available = reviewAvailability(state, review);
  const conExistencias = Object.keys(available).filter(id => available[id] > EPS);
  const contestados = Object.keys(review.consumed || {});
  if (review.origen === 'compra' && review.purchaseId) {
    const compra = state.purchases.find(item => item.id === review.purchaseId);
    const suyos = (compra?.lines || []).map(linea => linea.productId);
    review.productIds = [...new Set([...suyos, ...contestados])];
    return;
  }
  review.productIds = [...new Set([...review.productIds, ...conExistencias, ...contestados])];
}

// Cambiar entre «lo de la última compra» y «toda la despensa» sin perder nada.
export function setReviewScope(state, reviewId, origen) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status === 'confirmed') throw new Error('Esta revisión ya está terminada.');
  review.origen = ORIGENES_DE_REVISION.includes(origen) ? origen : 'todo';
  if (review.origen === 'compra' && !review.purchaseId) review.purchaseId = ultimaCompra(state, review.date)?.id || null;
  if (review.origen === 'compra' && !review.purchaseId) review.origen = 'todo';
  syncReviewProducts(state, review);
  return review;
}
// Preguntar «¿cuánto queda?» en vez de «¿cuánto se consumió?» es la diferencia
// entre mirar la nevera y hacer una resta de memoria. Lo que se guarda sigue
// siendo el consumo —es lo que mueve el saldo—, pero se deduce de lo que quedó.
export function remainingToConsumed(available, remaining) {
  const left = quantity(remaining, true);
  if (left > available + EPS) return { consumed: null, excess: round(left - available) };
  return { consumed: round(Math.max(0, available - left)), excess: 0 };
}
export function saveReview(state, reviewId, inputs, confirm = false, mode = null) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status === 'confirmed') throw new Error('Para cambiar una revisión confirmada, usa Corregir revisión.');
  syncReviewProducts(state, review);
  if (mode) review.mode = mode === 'consumido' ? 'consumido' : 'restante';
  const available = reviewAvailability(state, review);
  const consumed = {}, remaining = {};
  for (const id of review.productIds) {
    const input = inputs[id];
    // Un campo vacío es «todavía no lo he mirado», no «no queda nada». Son dos
    // cosas distintas y confundirlas descontaría existencias que sí están.
    if (input === '' || input === null || input === undefined) continue;
    if (review.mode === 'restante') {
      const { consumed: used, excess } = remainingToConsumed(available[id] || 0, input);
      if (excess > 0) throw new Error(`Dices que quedan más ${product(state, id)?.name || 'unidades'} de las que la app tiene contadas (sobran ${excess}). Usa «Corregir existencias» para registrar la diferencia.`);
      remaining[id] = quantity(input, true);
      consumed[id] = used;
    } else {
      const amount = quantity(input, true);
      if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera las existencias. Usa Corregir existencias si hace falta.`);
      consumed[id] = amount;
      remaining[id] = round(Math.max(0, (available[id] || 0) - amount));
    }
  }
  if (confirm && review.productIds.some(id => consumed[id] === undefined)) throw new Error('Hay productos pendientes de revisar. Escribe 0 si no queda nada.');
  const previous = { status: review.status, consumed: review.consumed, remaining: review.remaining };
  review.consumed = consumed;
  review.remaining = remaining;
  if (confirm) review.status = 'confirmed';
  if (balances(state).problems.length) { Object.assign(review, previous); throw new Error('Esta revisión dejaría un saldo negativo en una fecha posterior. Corrige las existencias primero.'); }
  return review;
}
export function correctReview(state, reviewId, inputs) {
  const review = state.reviews.find(item => item.id === reviewId);
  if (!review || review.status !== 'confirmed') throw new Error('Revisión confirmada no encontrada.');
  const available = reviewAvailability(state, review);
  const consumed = {}, remaining = {};
  for (const id of review.productIds) {
    if (inputs[id] === '' || inputs[id] === undefined || inputs[id] === null) throw new Error('Completa todos los productos de la revisión.');
    if (review.mode === 'restante') {
      const { consumed: used, excess } = remainingToConsumed(available[id] || 0, inputs[id]);
      if (excess > 0) throw new Error(`Quedan más ${product(state, id)?.name || 'unidades'} de las que había disponibles antes de esa revisión.`);
      consumed[id] = used;
      remaining[id] = quantity(inputs[id], true);
    } else {
      const amount = quantity(inputs[id], true);
      if (amount > (available[id] || 0) + EPS) throw new Error(`El consumo de ${product(state, id)?.name || 'un producto'} supera lo disponible antes de esa revisión.`);
      consumed[id] = amount;
      remaining[id] = round(Math.max(0, (available[id] || 0) - amount));
    }
  }
  const previous = { consumed: review.consumed, remaining: review.remaining };
  review.consumed = consumed;
  review.remaining = remaining;
  if (balances(state).problems.length) { Object.assign(review, previous); throw new Error('La corrección dejaría un saldo negativo en una revisión posterior.'); }
  return review;
}
export function correctStock(state, productId, actual, reason) {
  if (!product(state, productId)) throw new Error('Selecciona un producto.');
  const amount = quantity(actual, true);
  const current = inventoryNow(state)[productId] || 0;
  const correction = { id: nextId(state, 'ajuste'), seq: state.seq, date: todayISO(), productId, delta: round(amount - current), actual: amount, reason: String(reason || '').trim() };
  state.corrections.push(correction);
  if (balances(state).problems.length) { state.corrections.pop(); throw new Error('Esta corrección dejaría un saldo negativo en una revisión posterior.'); }
  return correction;
}
export function lastStockReview(state) {
  return [...state.reviews.filter(item => item.status === 'confirmed'), ...state.corrections].sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)[0]?.date || null;
}


/* ── La lista de una salida al supermercado ────────────────────────────────

   Una lista pertenece a una salida concreta: la del sábado, la de fin de mes.
   Tiene lo que se va a buscar, cuánto decidió llevar quien la escribió, y qué
   se fue tachando por el pasillo. Nada más.

   No es un inventario, y la diferencia importa. Un inventario dice cuánto hay
   en la casa y se equivoca solo: nadie anota el arroz que se le cayó, ni las
   dos tazas que se llevó la vecina, y a los tres meses la cuenta no se parece a
   la despensa. Una lista no puede equivocarse porque no afirma nada sobre la
   casa: afirma lo que alguien decidió comprar. Por eso cerrarla no descuenta,
   no suma y no toca las existencias.

   Y es manual. La escribe una persona. Lo único que hace la app es acordarse
   por ella de lo que esta casa siempre compra —ver `habitualesPorRubro`—, que
   es la ayuda que se pidió y no más que esa. */

export const listaDeCompra = (state, id) => state.listasDeCompra.find(item => item.id === id) || null;
export const listasAbiertas = state => state.listasDeCompra.filter(item => item.estado === 'abierta');

function exigirListaAbierta(state, listaId) {
  const lista = listaDeCompra(state, listaId);
  if (!lista) throw new Error('Esa lista de compra no existe.');
  if (lista.estado !== 'abierta') throw new Error('Esa lista ya se cerró. Ábrela otra vez si quieres cambiarla.');
  return lista;
}

export function crearLista(state, fields = {}) {
  const fecha = fields.fecha || todayISO();
  if (!validDate(fecha)) throw new Error('Elige una fecha válida para la salida.');
  const date = todayISO();
  // El nombre es opcional: «la compra del sábado» no hace falta escribirla, la
  // fecha ya lo dice. Quien quiera distinguir dos salidas del mismo día le pone
  // nombre.
  const lista = {
    id: nextId(state, 'lista'), nombre: String(fields.nombre || '').trim(), fecha,
    estado: 'abierta', lineas: [],
    // Y cuándo se cerró. Una lista cerrada ES el historial de esa compra: no se
    // copia a ningún otro sitio. Aquí hubo un `compraId` esperando a que
    // alguien uniera las listas con el registro de compras del inventario; esa
    // unión se decidió que no, porque el inventario se retiró, así que el campo
    // se fue con ella.
    createdAt: date, updatedAt: date, cerradaEl: null
  };
  state.listasDeCompra.push(lista);
  return lista;
}

// Apuntar algo. O es un alimento del catálogo —lo normal, viene de los
// habituales— o es texto suelto: «servilletas», «lo del cumpleaños». El texto
// no crea un alimento nuevo, a propósito: una lista se llenaría el catálogo de
// cosas de una sola vez y después habría que limpiarlo a mano.
export function agregarALista(state, listaId, fields = {}) {
  const lista = exigirListaAbierta(state, listaId);
  const item = fields.productId ? product(state, fields.productId) : null;
  if (fields.productId && !item) throw new Error('Ese alimento ya no existe.');
  const texto = String(fields.texto || '').trim();
  if (!item && !texto) throw new Error('Escribe qué hay que comprar.');

  const cantidad = optionalQuantity(fields.cantidad);
  const unidad = UNITS.includes(fields.unidad) ? fields.unidad : (item?.purchaseUnit || null);
  // Tocar dos veces el mismo alimento de los habituales es lo que pasa cuando
  // se va apuntando con el teléfono en una mano. Se actualiza el renglón que ya
  // estaba en vez de dejar el arroz dos veces en la misma lista.
  const repetido = item ? lista.lineas.find(linea => linea.productId === item.id) : null;
  if (repetido) {
    if (cantidad !== null) repetido.cantidad = cantidad;
    if (unidad) repetido.unidad = unidad;
    if ('nota' in fields) repetido.nota = String(fields.nota || '').trim();
    lista.updatedAt = todayISO();
    return repetido;
  }

  const linea = {
    id: nextId(state, 'renglon'),
    productId: item?.id || null,
    texto: item ? '' : texto,
    cantidad, unidad,
    rubro: item ? rubroDe(state, item.id) : (RUBROS_IDS.includes(fields.rubro) ? fields.rubro : 'otros'),
    nota: String(fields.nota || '').trim(),
    // `cantidad` es lo que se pidió y `comprada` lo que se trajo. Son dos datos
    // y no uno: la lista decía dos latas, se encontró una, y eso no es «hecho»
    // ni es «nada». Sin los dos separados no hay forma de dejar una lata
    // pendiente sin borrar el recuerdo de que se compró la otra.
    comprada: null,
    comprado: false
  };
  lista.lineas.push(linea);
  lista.updatedAt = todayISO();
  return linea;
}

/* ── Algo que no se compra siempre ─────────────────────────────────────────

   Una casa compra papel de aluminio dos veces al año. Meterlo en los productos
   habituales llenaría esa lista de cosas que no son habituales; dejarlo solo
   como texto suelto obliga a escribirlo otra vez dentro de seis meses.

   Por eso se pregunta, y se pregunta una vez: ¿esto es de esta compra, o es de
   las que se repiten? Las dos respuestas son legítimas y ninguna es la de por
   defecto. */
export function agregarOcasional(state, listaId, fields = {}) {
  const nombre = String(fields.nombre || '').trim();
  if (!nombre) throw new Error('Escribe qué hay que comprar.');
  if (!fields.habitual) {
    return agregarALista(state, listaId, {
      texto: nombre, cantidad: fields.cantidad, unidad: fields.unidad, rubro: fields.rubro, nota: fields.nota
    });
  }
  // También a los habituales: se registra allí —sin cantidad, que es lo que
  // esa lista guarda— y se apunta en esta compra con la de esta vez.
  const linea = agregarHabitual(state, { name: nombre, rubro: fields.rubro, unit: fields.unidad, category: fields.category });
  return agregarALista(state, listaId, {
    productId: linea.productId, cantidad: fields.cantidad, unidad: fields.unidad, nota: fields.nota
  });
}

export function actualizarLineaDeLista(state, listaId, lineaId, fields = {}) {
  const lista = exigirListaAbierta(state, listaId);
  const linea = lista.lineas.find(row => row.id === lineaId);
  if (!linea) throw new Error('Ese renglón ya no está en la lista.');
  if ('cantidad' in fields) linea.cantidad = optionalQuantity(fields.cantidad);
  if ('unidad' in fields) linea.unidad = UNITS.includes(fields.unidad) ? fields.unidad : null;
  if ('nota' in fields) linea.nota = String(fields.nota || '').trim();
  if ('rubro' in fields && RUBROS_IDS.includes(fields.rubro)) linea.rubro = fields.rubro;
  if ('texto' in fields && !linea.productId) {
    const texto = String(fields.texto || '').trim();
    if (!texto) throw new Error('Escribe qué hay que comprar.');
    linea.texto = texto;
  }
  lista.updatedAt = todayISO();
  return linea;
}

/* ── Tachar, destachar, y lo que se trajo a medias ─────────────────────────

   Un toque tacha el renglón entero: es lo único que se toca dentro del
   supermercado, con una mano y el carrito en la otra, así que no exige nada
   más y no puede fallar por otra cosa. Destacharlo lo devuelve tal cual.

   Y después está lo que pasa de verdad: la lista decía dos latas y solo había
   una. Eso no es «hecho» ni es «nada». `anotarComprado` guarda lo que se trajo
   y deja el resto pendiente, que es lo que hay que poder hacer sin tener que
   elegir entre mentir en un sentido o en el otro. */

export function marcarComprado(state, listaId, lineaId, comprado = true) {
  const lista = exigirListaAbierta(state, listaId);
  const linea = lista.lineas.find(row => row.id === lineaId);
  if (!linea) throw new Error('Ese renglón ya no está en la lista.');
  linea.comprado = Boolean(comprado);
  // Tachar de un toque es decir «lo traje todo»; destachar, «al final no».
  linea.comprada = comprado ? linea.cantidad : null;
  lista.updatedAt = todayISO();
  return linea;
}

export function anotarComprado(state, listaId, lineaId, cuanto) {
  const lista = exigirListaAbierta(state, listaId);
  const linea = lista.lineas.find(row => row.id === lineaId);
  if (!linea) throw new Error('Ese renglón ya no está en la lista.');
  const traido = optionalQuantity(cuanto);
  linea.comprada = traido;
  // Se da por completo cuando alcanza lo que se pidió. Si no se había pedido
  // una cantidad, cualquier cosa anotada lo completa: no hay contra qué
  // compararla, y dejarlo pendiente para siempre sería un renglón que nunca
  // se puede terminar.
  linea.comprado = traido !== null && (linea.cantidad === null || traido >= linea.cantidad);
  lista.updatedAt = todayISO();
  return linea;
}

// Lo que falta de un renglón. `null` cuando no hay nada que restar —porque no
// se pidió cantidad—: no es cero, es «no se sabe», y son cosas distintas.
export const pendienteDe = linea => {
  if (linea?.comprado) return 0;
  if (linea?.cantidad === null || linea?.cantidad === undefined) return null;
  return Math.max(0, round(linea.cantidad - (linea.comprada || 0)));
};

export function quitarDeLista(state, listaId, lineaId) {
  const lista = exigirListaAbierta(state, listaId);
  const antes = lista.lineas.length;
  lista.lineas = lista.lineas.filter(row => row.id !== lineaId);
  lista.updatedAt = todayISO();
  return lista.lineas.length < antes;
}

// Cerrar una lista es decir «ya volví del supermercado». No descuenta, no suma
// y no toca las existencias: una lista no afirma nada sobre lo que hay en la
// casa. Lo que quedó sin tachar se queda sin tachar, que es la verdad de lo que
// pasó —no se consiguió, se olvidó— y no un error que corregir.
export function cerrarLista(state, listaId) {
  const lista = exigirListaAbierta(state, listaId);
  lista.estado = 'cerrada';
  lista.cerradaEl = todayISO();
  lista.updatedAt = lista.cerradaEl;
  return lista;
}

export function reabrirLista(state, listaId) {
  const lista = listaDeCompra(state, listaId);
  if (!lista) throw new Error('Esa lista de compra no existe.');
  lista.estado = 'abierta';
  lista.cerradaEl = null;
  lista.updatedAt = todayISO();
  return lista;
}

export const resumenDeLista = lista => {
  const lineas = lista?.lineas || [];
  const comprados = lineas.filter(linea => linea.comprado).length;
  // Los que se trajeron a medias no son ni lo uno ni lo otro, y contarlos como
  // pendientes a secas escondería que ya se trajo parte.
  const aMedias = lineas.filter(linea => !linea.comprado && linea.comprada).length;
  return { total: lineas.length, comprados, aMedias, pendientes: lineas.length - comprados };
};

/* ── El historial de compras es la lista cerrada ───────────────────────────

   No hay un segundo sitio donde apuntar lo que se compró. Una lista cerrada ya
   dice la fecha, qué se llevaba apuntado, cuánto se pidió de cada cosa y cuánto
   se trajo: eso es el historial, y guardarlo otra vez en otro formato sería
   tener dos versiones de lo mismo y una de ellas equivocada.

   Y no descuenta nada de nada. La app no lleva la cuenta de lo que hay en la
   casa —nadie anota el arroz que se cayó ni las dos tazas que se llevó la
   vecina— y fingir que sí es lo que hacía que la cuenta no se pareciera a la
   despensa a los tres meses. */
export const listasCerradas = state =>
  (state.listasDeCompra || [])
    .filter(lista => lista.estado === 'cerrada')
    .sort((a, b) => String(b.cerradaEl || b.fecha).localeCompare(String(a.cerradaEl || a.fecha)));


/* ── Un período cerrado no se vuelve a calcular ────────────────────────────

   La app decía «los meses ya cerrados no cambian» y no era verdad. Nada estaba
   congelado: la lista de marzo se recalculaba cada vez que alguien la miraba,
   contra la canasta de hoy. Subir el arroz de 10 a 15 libras en septiembre
   reescribía en silencio lo que marzo decía haber necesitado, y el historial
   dejaba de ser un historial para ser una proyección hacia atrás.

   Cerrar un período guarda una fotografía de todo lo que hizo falta para
   calcularlo: la canasta que se usó, las excepciones de ese mes, la frecuencia
   vigente, lo que se compró, lo que se declaró que quedaba, la lista final y
   —si se calculó desde el menú— las comidas que la produjeron. Desde entonces
   la app lee la fotografía y no vuelve a sumar nada.

   También se guardan los nombres de los alimentos. Un producto archivado o
   renombrado dos años después no puede convertir una compra de marzo en una
   lista de «Alimento eliminado». */



export const cierresDe = (state, month) =>
  (state.closedPeriods || []).filter(cierre => cierre.month === month).sort((a, b) => a.start.localeCompare(b.start));


// El nombre que tenía un alimento cuando se cerró el período. Si la fotografía
// no lo trae —un respaldo viejo— se cae al nombre de hoy, que es lo único que
// hay.
export const nombreEnElCierre = (state, cierre, productId) =>
  cierre?.nombres?.[productId] || product(state, productId)?.name || 'Alimento eliminado';

/* ── Cada cuánto se hace la compra ─────────────────────────────────────────

   Hay casas que compran una vez al mes y casas que compran cada quincena, y no
   es una preferencia de pantalla: cambia en cuántas veces se parte la lista.

   Lo que no puede pasar es que cambiar hoy la frecuencia reescriba lo que pasó
   en marzo. Si en marzo se compró una vez al mes, marzo se compró una vez al
   mes, y el historial tiene que seguir diciendo eso dentro de dos años. Por eso
   la frecuencia no es un interruptor: es una lista de tramos con fecha de
   vigencia, y cada mes pregunta cuál le tocaba a él.

       [{ desde: '2026-01', tipo: 'mensual' }, { desde: '2026-10', tipo: 'quincenal' }]

   Eso se lee «mensual hasta septiembre de 2026, quincenal desde octubre». Los
   meses anteriores al primer tramo son mensuales, que es como se comportaba la
   app antes de que esto existiera: quien ya la usaba no ve ningún cambio.

   Las quincenas son del 1 al 15 y del 16 al último día real del mes. No son
   ventanas de catorce días: en un mes de 31 la segunda quincena tiene dieciséis
   días y en febrero tiene trece, porque es cuando la casa come. */

export const FRECUENCIAS = ['mensual', 'quincenal'];
export const FRECUENCIA_POR_DEFECTO = 'mensual';
const frecuenciaValida = tipo => (FRECUENCIAS.includes(tipo) ? tipo : null);

const compraDe = state => (state?.settings?.compra && typeof state.settings.compra === 'object' ? state.settings.compra : {});

// Los tramos en orden, sin basura y sin repetidos por mes.
export function historialDeFrecuencia(state) {
  const filas = Array.isArray(compraDe(state).frecuencia) ? compraDe(state).frecuencia : [];
  const porMes = new Map();
  for (const fila of filas) {
    const tipo = frecuenciaValida(fila?.tipo);
    if (!tipo || !validMonth(fila?.desde)) continue;
    porMes.set(fila.desde, { desde: fila.desde, tipo });
  }
  return [...porMes.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

export function frecuenciaDe(state, mes) {
  if (!validMonth(mes)) return FRECUENCIA_POR_DEFECTO;
  let tipo = FRECUENCIA_POR_DEFECTO;
  for (const fila of historialDeFrecuencia(state)) {
    if (fila.desde > mes) break;
    tipo = fila.tipo;
  }
  return tipo;
}

// Cambiar la frecuencia a partir de un mes. Lo anterior a ese mes no se toca:
// ni este dato, ni las compras, ni las revisiones, ni nada.
export function ponerFrecuencia(state, tipo, desde) {
  const valido = frecuenciaValida(tipo);
  if (!valido) throw new Error('Elige si la compra es mensual o quincenal.');
  if (!validMonth(desde)) throw new Error('Elige desde qué mes entra en vigencia.');
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (!state.settings.compra || typeof state.settings.compra !== 'object') state.settings.compra = {};
  const filas = historialDeFrecuencia(state).filter(fila => fila.desde !== desde);
  filas.push({ desde, tipo: valido });
  filas.sort((a, b) => a.desde.localeCompare(b.desde));
  // Dos tramos seguidos que dicen lo mismo no son dos tramos: sobraría uno, y
  // el historial que se le enseña al usuario se llenaría de líneas sin cambio.
  const limpias = filas.filter((fila, indice) => indice === 0 || fila.tipo !== filas[indice - 1].tipo);
  state.settings.compra.frecuencia = limpias;
  return limpias;
}

// Los períodos de compra de un mes: uno si es mensual, dos si es quincenal.
export function periodosDelMes(state, mes) {
  if (!validMonth(mes)) throw new Error('Ese mes no es válido.');
  const { start, end } = monthBounds(mes);
  const dias = (desde, hasta) => dateRange(desde, hasta).length;
  if (frecuenciaDe(state, mes) !== 'quincenal') {
    return [{ id: 'mes', etiqueta: 'Todo el mes', start, end, dias: dias(start, end) }];
  }
  const corte = `${mes}-15`;
  return [
    { id: 'primera', etiqueta: '1.ª quincena', start, end: corte, dias: dias(start, corte) },
    { id: 'segunda', etiqueta: '2.ª quincena', start: `${mes}-16`, end, dias: dias(`${mes}-16`, end) }
  ];
}



/* ── Respaldo ──────────────────────────────────────────────────────────── */

export function exportState(state) { return JSON.stringify(state, null, 2); }
export function importState(json) {
  const parsed = JSON.parse(json);
  // Migrar primero y validar después: así un respaldo viejo entra completo, y
  // si la conversión dejara algo incoherente se rechaza aquí, antes de tocar
  // nada de lo que el usuario ya tenía guardado.
  const result = migrate(parsed);
  if (!result.ok) throw new Error(result.error);
  const data = result.state;
  const empty = createEmptyState();
  if (!Number.isInteger(data.seq) || Object.keys(empty).some(key => !(key in data))) throw new Error('Este archivo no es un respaldo válido de ¿Qué comemos?.');
  for (const key of ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'mealRoutines', 'listasDeCompra', 'activity']) {
    if (!Array.isArray(data[key])) throw new Error('El respaldo tiene datos incompletos.');
  }
  if (typeof data.opening !== 'object' || data.opening === null) throw new Error('El respaldo no tiene existencias válidas.');
  if (!data.habitualBasket || !Array.isArray(data.habitualBasket.lines)) throw new Error('El respaldo no trae bien la lista de productos habituales.');
  if (typeof data.monthOverrides !== 'object' || data.monthOverrides === null) throw new Error('El respaldo no tiene cambios mensuales válidos.');
  for (const [month, override] of Object.entries(data.monthOverrides)) {
    if (!validMonth(month) || !Array.isArray(override?.changes)) throw new Error(`Los cambios de ${month} están dañados.`);
  }
  if (typeof data.monthPlans !== 'object' || data.monthPlans === null) throw new Error('El respaldo no tiene meses válidos.');
  for (const month of Object.keys(data.monthPlans)) {
    if (!validMonth(month)) throw new Error(`El mes ${month} está dañado.`);
  }
  if (typeof data.settings !== 'object' || data.settings === null) throw new Error('El respaldo no tiene preferencias válidas.');
  if (balances(data).problems.length) throw new Error('El respaldo contiene existencias negativas.');
  return data;
}
