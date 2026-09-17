// Nadie debería perder los datos de su casa porque la app creció.
//
// Este archivo convierte un estado guardado de una versión a la siguiente, y
// solo eso: no valida saldos ni toca el almacenamiento. De eso se encarga
// `importState` en model.js, que llama aquí primero y valida después. El orden
// importa: si la migración deja algo incoherente, la validación lo rechaza y el
// estado anterior se queda donde estaba, intacto.
//
// No importa model.js a propósito. Sería un ciclo, y además una migración tiene
// que poder leer datos de una versión cuyas reglas ya no son las de hoy.

import { normalizeName } from './nombres.js';

export const SCHEMA_VERSION = 10;

// Los ocho rubros con que se agrupan los productos habituales, y de qué
// categoría fina sale cada uno.
//
// El mapa está escrito aquí, entero y a mano, y no se lee de `catalog-seed.js`
// a propósito: una migración tiene que seguir convirtiendo igual un respaldo de
// hoy dentro de dos años, y los rubros del catálogo pueden cambiar. Que no se
// queden atrás lo comprueba una prueba, que recorre las categorías del catálogo
// y exige que todas estén aquí.
export const RUBROS_IDS = ['viveres', 'granos', 'proteinas', 'lacteos', 'frutas', 'vegetales', 'desayunos', 'otros'];
const RUBRO_DE_CATEGORIA = {
  viveres: 'viveres',
  granos: 'granos',
  carnes: 'proteinas', embutidos: 'proteinas', mar: 'proteinas',
  lacteos: 'lacteos',
  frutas: 'frutas',
  vegetales: 'vegetales',
  panes: 'desayunos',
  condimentos: 'otros', bebidas: 'otros', limpieza: 'otros', higiene: 'otros', otros: 'otros'
};
// Una categoría que no conocemos cae en «otros» y no en un hueco: alguien puede
// tener guardado un alimento de una versión anterior, y dejarlo sin rubro lo
// sacaría de la lista de la compra sin decir por qué.
export const rubroDeCategoria = categoria => RUBRO_DE_CATEGORIA[categoria] || 'otros';

// Los momentos en que una preparación suele comerse. Viven aquí, igual que las
// clases de persona, para que la migración pueda normalizarlas sin arrastrar el
// modelo entero. `model.js` los reexporta con su etiqueta.
export const MOMENTOS_DE_PREPARACION = ['desayuno', 'merienda-manana', 'almuerzo', 'merienda-tarde', 'cena'];

// Las tres clasificaciones de una persona de la casa y los tres motivos por los
// que puede evitar un alimento. Viven aquí y no en model.js porque una
// migración tiene que poder normalizar datos viejos sin arrastrar el modelo
// entero —que importa este archivo, no al revés—.
export const CLASES_DE_PERSONA = ['adulto', 'adolescente', 'nino'];

// De dónde salió una comida del calendario. La lista vive también en el modelo;
// aquí está repetida a propósito, porque una migración no puede depender de lo
// que el modelo diga dentro de tres versiones: tiene que seguir convirtiendo
// igual un respaldo de hoy dentro de dos años.
export const ORIGENES_DE_COMIDA = ['rutina', 'mes-anterior', 'excepcion', 'manual', 'sugerida'];
export const MOTIVOS_DE_RESTRICCION = ['alergia', 'intolerancia', 'preferencia'];

const clone = value => structuredClone(value);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// v1 → v2. Dos cambios de fondo:
//
// 1. El producto pasa de ser un nombre con unidades a una ficha de catálogo:
//    nombre normalizado para detectar duplicados, alias, categoría, estado y de
//    dónde salió. Nada de esto se puede deducir de los datos viejos, así que se
//    rellena con lo neutro —categoría «otros», origen «manual»— en vez de
//    adivinar. Adivinar categorías aquí llenaría la app de etiquetas falsas.
//
// 2. La canasta única se convierte en canasta base más una canasta por mes. La
//    base es lo que la casa consume en un mes corriente; el mes es lo que pasó
//    de verdad ese mes. Lo que había escrito es, por definición, lo habitual:
//    va a la base. Y se abre el mes actual copiándola, para que quien venía
//    usando la app encuentre exactamente lo mismo que dejó.
function v1toV2(data) {
  const notes = [];
  const fecha = today();
  const mesActual = fecha.slice(0, 7);

  const products = (data.products || []).map(item => ({
    id: item.id,
    name: item.name,
    normalized: normalizeName(item.name),
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    category: item.category || 'otros',
    controlUnit: item.controlUnit,
    purchaseUnit: item.purchaseUnit,
    equivalences: item.equivalences || {},
    slice: item.slice ?? null,
    archived: Boolean(item.archived),
    origin: item.origin || 'manual',
    createdAt: item.createdAt || fecha,
    updatedAt: item.updatedAt || fecha
  }));
  if (products.length) notes.push(`${products.length} alimento(s) pasaron a la ficha de catálogo.`);

  // La canasta vieja no tenía prioridad. «Frecuente» es el término medio
  // honesto: decir que todo es obligatorio sería inventar una exigencia que el
  // usuario nunca expresó.
  const lines = (data.basket || []).map(line => ({
    id: line.id,
    productId: line.productId,
    quantity: line.quantity ?? null,
    unit: line.unit,
    priority: line.priority || 'frecuente'
  }));

  const baseBasket = { lines, updatedAt: lines.length ? fecha : null, history: [] };
  const monthlyBaskets = {};
  if (lines.length) {
    monthlyBaskets[mesActual] = { month: mesActual, lines: clone(lines), createdAt: fecha, updatedAt: fecha, basedOn: fecha };
    notes.push(`La canasta que tenías escrita es ahora la canasta base, y ${mesActual} se abrió con una copia.`);
  }

  return {
    state: {
      version: 2,
      seq: data.seq,
      demo: Boolean(data.demo),
      products,
      people: data.people || [],
      recipes: data.recipes || [],
      plans: data.plans || [],
      absences: data.absences || [],
      opening: data.opening || {},
      purchases: data.purchases || [],
      reviews: (data.reviews || []).map(review => ({ mode: 'consumido', remaining: {}, ...review })),
      corrections: data.corrections || [],
      manualItems: data.manualItems || [],
      baseBasket,
      monthlyBaskets,
      invoices: [],
      activity: []
    },
    notes
  };
}

// v2 → v3. Un solo cambio de fondo, y es el que lo ordena todo: cada mes
// guardaba una copia completa de la canasta, y a partir de aquí guarda solo
// aquello en lo que se aparta de la habitual.
//
// La copia entera parecía lo más seguro y resultó ser lo contrario: con doce
// copias nadie sabía ya qué era la costumbre y qué la excepción de un mes, y
// corregir el hábito obligaba a repasar mes por mes. Así que cada mes se
// compara contra la base y se guarda únicamente la diferencia. Lo que en el mes
// era idéntico a la base no era una excepción y no deja rastro: eso no pierde
// nada, porque volver a aplicar la base da exactamente la misma línea.
function v2toV3(data) {
  const notes = [];
  // Los identificadores nuevos salen del contador que ya venía, no de cero: si
  // se reiniciara, el primer cambio que escribiera el usuario chocaría con algo.
  let seq = Number.isInteger(data.seq) ? data.seq : 0;
  const nuevoId = prefix => { seq += 1; return `${prefix}-${seq}`; };

  const baseBasket = data.baseBasket && Array.isArray(data.baseBasket.lines)
    ? { lines: clone(data.baseBasket.lines), updatedAt: data.baseBasket.updatedAt ?? null, history: clone(data.baseBasket.history || []) }
    : { lines: [], updatedAt: null, history: [] };
  const base = new Map(baseBasket.lines.map(line => [line.productId, line]));

  const monthlyBaskets = data.monthlyBaskets && typeof data.monthlyBaskets === 'object' ? data.monthlyBaskets : {};
  const monthOverrides = {};
  let totalCambios = 0;
  for (const [month, basket] of Object.entries(monthlyBaskets)) {
    if (!basket || !Array.isArray(basket.lines)) continue;
    const changes = [];
    const enElMes = new Set();
    for (const line of basket.lines) {
      enElMes.add(line.productId);
      const original = base.get(line.productId);
      const cantidad = line.quantity ?? null;
      const prioridad = line.priority || 'frecuente';
      if (original) {
        const igual = (original.quantity ?? null) === cantidad && original.unit === line.unit && (original.priority || 'frecuente') === prioridad;
        if (igual) continue;
        changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: cantidad, unit: line.unit, priority: prioridad, removed: false, extra: false, note: '', createdAt: basket.createdAt || `${month}-01` });
        continue;
      }
      changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: cantidad, unit: line.unit, priority: prioridad, removed: false, extra: true, note: '', createdAt: basket.createdAt || `${month}-01` });
    }
    // Lo que estaba en la base y no en el mes se quitó a propósito ese mes.
    for (const line of baseBasket.lines) {
      if (enElMes.has(line.productId)) continue;
      changes.push({ id: nuevoId('cambio'), productId: line.productId, quantity: line.quantity ?? null, unit: line.unit, priority: line.priority || 'frecuente', removed: true, extra: false, note: '', createdAt: basket.createdAt || `${month}-01` });
    }
    if (!changes.length) continue;
    monthOverrides[month] = { month, changes, createdAt: basket.createdAt || `${month}-01`, updatedAt: basket.updatedAt || basket.createdAt || `${month}-01` };
    totalCambios += changes.length;
  }

  const plans = (data.plans || []).map(plan => ({ ...plan, routineId: plan.routineId ?? null }));

  // Un mes estaba abierto si tenía canasta propia o comidas escritas. Sin un
  // `createdAt` que copiar se usa el día 1 de ese mes, que es cierto —el mes
  // estuvo en uso— en vez de la fecha de hoy, que sería falsa para un mes viejo.
  const monthPlans = {};
  const mesesUsados = new Set([...Object.keys(monthlyBaskets), ...plans.map(plan => String(plan.date || '').slice(0, 7))].filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)));
  for (const month of [...mesesUsados].sort()) {
    monthPlans[month] = { month, openedAt: monthlyBaskets[month]?.createdAt || `${month}-01`, preparedAt: null, summary: null };
  }

  const products = data.products || [];
  const state = {
    version: 3,
    seq,
    demo: Boolean(data.demo),
    products,
    people: data.people || [],
    recipes: data.recipes || [],
    plans,
    absences: data.absences || [],
    opening: data.opening || {},
    purchases: data.purchases || [],
    // Un respaldo v2 exportado antes de que existiera el modo «cuánto queda» no
    // dice cómo se contó. «Consumido» es lo que se hacía entonces.
    reviews: (data.reviews || []).map(review => ({ mode: 'consumido', remaining: {}, ...review })),
    corrections: data.corrections || [],
    manualItems: data.manualItems || [],
    habitualBasket: baseBasket,
    monthOverrides,
    // No se inventan rutinas leyendo el historial: que alguien haya comido fuera
    // tres domingos seguidos no significa que quiera esa regla escrita.
    mealRoutines: [],
    monthPlans,
    settings: { reviewWeekday: 5, onboarded: products.length > 0 },
    activity: data.activity || []
  };

  notes.push('Tu canasta de siempre ahora se llama «canasta habitual» y es la misma de antes.');
  if (totalCambios) notes.push(`De los meses que tenías escritos se guardaron ${totalCambios} cambio(s): solo aquello en lo que cada mes se apartaba de tu canasta. Lo que era igual no hacía falta repetirlo.`);
  else if (Object.keys(monthlyBaskets).length) notes.push('Los meses que tenías escritos eran iguales a tu canasta, así que no hizo falta guardar ningún cambio.');
  if (Object.keys(monthPlans).length) notes.push(`${Object.keys(monthPlans).length} mes(es) quedaron marcados como abiertos.`);
  if ((data.invoices || []).length) notes.push(`Las ${data.invoices.length} factura(s) guardadas salen de la app, pero siguen enteras en el respaldo anterior a la migración.`);

  return { state, notes };
}

// v3 → v4. La casa deja de ser una lista de nombres.
//
// Hasta aquí una persona tenía dos listas sueltas: los identificadores de lo
// que no puede comer y los nombres de lo que todavía no está en el catálogo.
// Ninguna de las dos decía lo único que de verdad cambia lo que hace quien
// cocina: si eso es una alergia, una intolerancia o algo que simplemente no le
// gusta. Las dos listas se juntan en una sola con un motivo por línea.
//
// El motivo nace **sin decir**, y es deliberado. Rellenarlo con «preferencia»
// convertiría una alergia real en un gusto; rellenarlo con «alergia» pintaría
// de rojo un alimento que a alguien simplemente no le apetece. Las dos mentiras
// son inaceptables en una app que avisa sobre comida. Sin motivo, la app avisa
// exactamente igual que antes —no se relaja ninguna advertencia— y pregunta la
// próxima vez que se edite a esa persona.
//
// `activo` nace en `true` para todo el mundo: nadie pidió dar a nadie de baja.
function v3toV4(data) {
  const notes = [];
  const state = clone(data);
  let conMotivoPendiente = 0;
  state.people = (state.people || []).map(persona => {
    const restricciones = restriccionesNormalizadas(persona);
    if (restricciones.some(fila => !fila.motivo)) conMotivoPendiente++;
    return personaNormalizada(persona, restricciones);
  });
  state.version = 4;
  if (conMotivoPendiente) {
    notes.push(`${conMotivoPendiente} persona(s) tenían alimentos anotados sin decir por qué. Se conservan y se sigue avisando igual; puedes marcar si es alergia, intolerancia o preferencia desde Más → Familia.`);
  }
  return { state, notes };
}

// Las dos listas viejas —y la nueva, si ya existe— convertidas en una sola
// lista de filas con motivo. Es idempotente: pasarla dos veces da lo mismo.
function restriccionesNormalizadas(persona) {
  const filas = [];
  const vistas = new Set();
  const meter = (productId, texto, motivo) => {
    const clave = productId ? `id:${productId}` : `txt:${String(texto).trim().toLocaleLowerCase('es')}`;
    if (clave === 'txt:' || vistas.has(clave)) return;
    vistas.add(clave);
    filas.push({
      productId: productId || null,
      texto: String(texto || '').trim(),
      motivo: MOTIVOS_DE_RESTRICCION.includes(motivo) ? motivo : null
    });
  };
  for (const fila of persona.restricciones || []) meter(fila?.productId, fila?.texto, fila?.motivo);
  for (const productId of persona.restrictions || []) meter(productId, '', null);
  for (const texto of persona.pendingRestrictions || []) meter(null, texto, null);
  return filas;
}

// Una persona con la forma de v4 y sin los dos campos que la sustituyen. Se
// usa en la conversión y otra vez al final, por si un respaldo trae una persona
// a medias.
function personaNormalizada(persona, restricciones) {
  const copia = { ...persona };
  delete copia.restrictions;
  delete copia.pendingRestrictions;
  return {
    ...copia,
    kind: CLASES_DE_PERSONA.includes(persona.kind) ? persona.kind : 'adulto',
    activo: persona.activo !== false,
    restricciones,
    habitual: Array.isArray(persona.habitual) ? persona.habitual : []
  };
}

// v4 → v5. La preparación deja de decir quién la come.
//
// Tenía un campo `covers` —«quiénes la comen normalmente»— que se preguntaba al
// crearla y se volvía a preguntar al ponerla en el calendario. De las dos
// respuestas, la buena era siempre la segunda: quién come depende del día, no
// del plato. La primera solo servía para prerrellenar la segunda, y para que
// todo el mundo contestara dos veces la misma pregunta.
//
// Se borra el campo. No se pierde nada de lo planificado: cada comida del
// calendario guarda sus propios participantes, y esos no se tocan. Lo único que
// cambia es de dónde sale la marca por defecto al crear una comida nueva, que
// ahora es «toda la casa».
//
// Los momentos viejos se llamaban igual que los nuevos —desayuno, almuerzo,
// cena— así que se conservan tal cual. Las dos meriendas nacen vacías: nadie ha
// dicho que su mangú sea también merienda, y suponerlo llenaría la sección de
// meriendas de platos que nadie puso ahí.
function v4toV5(data) {
  const notes = [];
  const state = clone(data);
  let conPersonas = 0;
  state.recipes = (state.recipes || []).map(receta => {
    const copia = { ...receta };
    if (Array.isArray(copia.covers) && copia.covers.length) conPersonas++;
    delete copia.covers;
    const marcados = new Set(Array.isArray(receta.uses) ? receta.uses : []);
    copia.uses = MOMENTOS_DE_PREPARACION.filter(id => marcados.has(id));
    return copia;
  });
  state.version = 5;
  if (conPersonas) {
    notes.push(`${conPersonas} preparación(es) tenían anotado quién las comía. Esa pregunta ya no existe: una preparación es para toda la casa, y quien no coma se marca el día que toque. Las comidas que ya estaban en el calendario no cambian.`);
  }
  return { state, notes };
}

// v5 → v6. Cada comida dice de dónde salió.
//
// El calendario se llenaba y no decía quién lo había llenado. Delante de un
// martes con mangú no había forma de saber si lo puso una rutina, si se copió
// del mes pasado o si alguien lo escribió a mano, y sin saberlo nadie se atreve
// a cambiarlo: quitarlo podría estar quitando una costumbre.
//
// Lo que se sabe de una comida vieja se deduce, y lo que no se sabe no se
// inventa. `routineId` delata a la rutina. Un «fuera de casa» o un «pedido» es
// una excepción por definición: nadie tiene de costumbre pedir todos los días
// sin haber escrito la regla. Y todo lo demás lo puso una persona, que es
// exactamente lo que significa «cambio manual».
//
// Lo que no se puede recuperar es cuáles vinieron del mes anterior: hasta hoy
// una copia era indistinguible de una comida escrita a mano. Se quedan como
// cambio manual, que es la respuesta prudente —dice menos de lo que nos
// gustaría, pero no dice nada falso— y de aquí en adelante sí se marcan.
function v5toV6(data) {
  const notes = [];
  const state = clone(data);
  let deducidas = 0;
  state.plans = (state.plans || []).map(plan => {
    if (ORIGENES_DE_COMIDA.includes(plan?.origen)) return plan;
    deducidas++;
    return { ...plan, origen: origenDeducido(plan) };
  });
  state.version = 6;
  if (deducidas) {
    notes.push(`${deducidas} comida(s) del calendario no decían de dónde venían. Las que puso una rutina y las que estaban marcadas fuera de casa o pedidas se reconocen solas; el resto quedan como cambio manual. Ninguna comida cambia de día, de plato ni de cantidad.`);
  }
  return { state, notes };
}

const origenDeducido = plan => {
  if (plan?.routineId) return 'rutina';
  return plan?.kind === 'outside' || plan?.kind === 'order' ? 'excepcion' : 'manual';
};

// v6 → v7. Los períodos cerrados se guardan en su sitio.
//
// La app decía «los meses ya cerrados no cambian» y no era verdad: nada estaba
// congelado, y la lista de marzo se recalculaba contra la canasta de hoy cada
// vez que alguien la miraba. Desde aquí hay dónde guardar la fotografía de un
// período —canasta, excepciones, frecuencia, compras, existencia declarada,
// lista final y menú si aplica— y la app la lee en vez de volver a sumar.
//
// No se cierra nada al convertir. Un respaldo viejo no trae esas fotografías y
// no hay forma honrada de reconstruirlas: la canasta de entonces ya no existe.
// Lo que se hace es dejar la lista vacía y que se cierre de aquí en adelante,
// que es lo único que se puede prometer sin inventar.
function v6toV7(data) {
  const state = clone(data);
  if (!Array.isArray(state.closedPeriods)) state.closedPeriods = [];
  state.version = 7;
  return { state, notes: [] };
}

// v7 → v8. Cada línea de la canasta guarda su historia en vez de una cantidad.
//
// Antes una línea tenía una cantidad y una fecha de entrada. La fecha decía
// desde cuándo el alimento estaba en la canasta; la cantidad no tenía fecha
// ninguna, así que corregirla hoy cambiaba también lo que la app decía de julio.
// Y julio ya se compró.
//
// Convertir es directo y no pierde nada: lo que había pasa a ser el primer
// tramo, con la misma fecha que tenía la línea. Un respaldo sin fecha queda en
// «desde siempre», y es la verdad: esa era la canasta de la casa durante
// aquellos meses. Inventarle ahora un mes de comienzo sería escribir un dato
// que nadie dijo.
function v7toV8(data) {
  const state = clone(data);
  const lineas = state.habitualBasket?.lines;
  if (Array.isArray(lineas)) {
    state.habitualBasket.lines = lineas.map(linea => {
      if (!linea || typeof linea !== 'object' || Array.isArray(linea.tramos)) return linea;
      const { quantity = null, unit, priority, desde = null, ...resto } = linea;
      return { ...resto, tramos: [{ desde: desde ?? null, quantity, unit, priority: priority || 'frecuente' }] };
    });
  }
  state.version = 8;
  return { state, notes: [] };
}

/* ── v8 → v9. La app deja de calcular la compra y pasa a decidir la comida ──

   Hasta aquí el centro de la aplicación era una cuenta: cuánto consume la casa
   al mes, cuánto queda, cuánto falta comprar. Todo lo demás —las preparaciones,
   el calendario, las rutinas— alimentaba esa cuenta. A partir de aquí el centro
   es la pregunta que da nombre a la app, «¿qué comemos?», y la compra vuelve a
   ser lo que es en una casa: una lista escrita a mano antes de salir, ayudada
   por lo que siempre se compra.

   Esta conversión no borra nada. Los tres cambios son de forma, y los tres
   dejan lo viejo donde estaba para que el historial se siga leyendo:

    1. Cada línea de la canasta dice a qué rubro pertenece. La cantidad sigue
       ahí, con sus tramos y sus fechas, porque las compras de julio se
       calcularon con ella; lo que cambia es que a partir de ahora puede faltar.

    2. Una regla de repetición pasa a unir UNA preparación con UN momento. Las
       que cubrían varios se parten en una por momento, y las comidas que cada
       una había puesto se reasignan a la que les corresponde por su momento.
       Sin eso, borrar la regla del desayuno se llevaría por delante las cenas.

    3. Aparece dónde guardar las listas de compra: una lista es una salida
       concreta al supermercado, no un inventario. Nace vacía, porque las
       compras que ya están anotadas son historial y se quedan como están.

   Es idempotente por construcción: todo lo que escribe lo escribe solo si falta,
   y la partición de reglas solo ocurre cuando quedan reglas con más de un
   momento —después de la primera pasada no queda ninguna—. */
function v8toV9(data) {
  const state = clone(data);
  const partidas = asegurarV9(state);
  state.version = 9;
  const notes = [];
  if (partidas) {
    notes.push(`${partidas} regla(s) valían para varios momentos del día a la vez. Ahora cada regla es de un momento, así que se partieron en una por momento —los días, las semanas y las comidas que ya habían puesto son exactamente los mismos— y así puedes cambiar el desayuno de los lunes sin tocar la cena.`);
  }
  return { state, notes };
}

// Lo que un estado necesita para ser de la v9, escrito una sola vez porque se
// usa dos veces: en la conversión y en la última pasada de `migrate`, para los
// respaldos exportados a media tarde de un día en que esto ya existía a medias.
// Devuelve cuántas reglas hubo que partir; sobre datos ya convertidos, cero.
function asegurarV9(state) {
  const porId = new Map((Array.isArray(state.products) ? state.products : []).map(item => [item?.id, item]));
  if (Array.isArray(state.habitualBasket?.lines)) {
    state.habitualBasket.lines = state.habitualBasket.lines.map(linea => {
      if (!linea || typeof linea !== 'object') return linea;
      if (typeof linea.rubro === 'string' && linea.rubro) return linea;
      return { ...linea, rubro: rubroDeCategoria(porId.get(linea.productId)?.category), nota: typeof linea.nota === 'string' ? linea.nota : '' };
    });
  }

  let seq = Number.isInteger(state.seq) ? state.seq : 0;
  const { reglas, reasignadas, partidas } = reglasDeUnMomento(state.mealRoutines, () => { seq += 1; return `regla-${seq}`; });
  state.mealRoutines = reglas;
  state.seq = seq;
  // Las comidas que puso una regla partida pasan a colgar de la que cubre su
  // momento. Una comida que se quedara apuntando a la regla vieja diría que
  // viene de una rutina que ya no la pone, y al borrar esa rutina se iría con
  // ella una cena que nadie quiso quitar.
  if (Array.isArray(state.plans) && reasignadas.size) {
    state.plans = state.plans.map(plan => {
      const destino = reasignadas.get(`${plan?.routineId}|${plan?.slot}`);
      return destino && destino !== plan.routineId ? { ...plan, routineId: destino } : plan;
    });
  }

  if (!Array.isArray(state.listasDeCompra)) state.listasDeCompra = [];
  // `comprada` —lo que de verdad se trajo— llegó después que las listas. Una
  // línea sin ese campo se lee como «no se trajo nada», que es cierto, pero
  // dejarlo sin escribir haría que la pantalla tuviera que distinguir entre
  // «cero» y «no existe» en cada renglón.
  for (const lista of state.listasDeCompra) {
    if (!lista || typeof lista !== 'object') continue;
    // `compraId` esperaba a que alguien uniera las listas con el registro de
    // compras del inventario. Esa unión se decidió que no —el inventario se
    // retiró— así que el campo se va: nadie lo lee.
    delete lista.compraId;
    if (!Array.isArray(lista.lineas)) continue;
    lista.lineas = lista.lineas.map(linea => (
      linea && typeof linea === 'object' && !('comprada' in linea)
        ? { ...linea, comprada: linea.comprado ? (linea.cantidad ?? null) : null }
        : linea
    ));
  }
  return partidas;
}

// Los momentos de una regla, en el orden del día y sin repetidos. Se lee primero
// el campo nuevo: una regla ya convertida no vuelve a partirse.
const momentosDeLaRegla = regla => {
  if (typeof regla.momento === 'string' && regla.momento) return MOMENTOS_DE_PREPARACION.includes(regla.momento) ? [regla.momento] : [];
  const marcados = new Set(Array.isArray(regla.slots) ? regla.slots : []);
  return MOMENTOS_DE_PREPARACION.filter(id => marcados.has(id));
};

function reglasDeUnMomento(rutinas, nuevoId) {
  const reglas = [];
  const reasignadas = new Map();
  let partidas = 0;
  for (const regla of Array.isArray(rutinas) ? rutinas : []) {
    if (!regla || typeof regla !== 'object') { reglas.push(regla); continue; }
    const momentos = momentosDeLaRegla(regla);
    // Una regla sin ningún momento reconocible no pone nada en el calendario.
    // Se conserva —borrarla sería decidir por la casa— con el campo escrito en
    // nulo, para que nadie lo lea como «undefined».
    if (!momentos.length) { reglas.push({ ...regla, momento: null, slots: [], grupoId: regla.grupoId || regla.id }); continue; }
    // `grupoId` recuerda que estas reglas se escribieron de una vez, en una sola
    // respuesta. No las ata: cada una se edita y se borra sola. Es lo que
    // permite que las pantallas que todavía preguntan «¿en qué momentos?» de
    // una sentada sigan enseñando una sola regla donde ahora hay tres.
    const grupoId = regla.grupoId || regla.id;
    momentos.forEach((momento, indice) => {
      const id = indice === 0 ? regla.id : nuevoId();
      reglas.push({ ...regla, id, momento, slots: [momento], grupoId });
      reasignadas.set(`${regla.id}|${momento}`, id);
    });
    if (momentos.length > 1) partidas += 1;
  }
  return { reglas, reasignadas, partidas };
}

/* ── v9 → v10. Se cae el andamio ───────────────────────────────────────────

   La conversión anterior partió las reglas de varios momentos en una por
   momento, y les puso a las hermanas un `grupoId` para recordar que se habían
   escrito de una sentada. Ese campo era un andamio: las pantallas de entonces
   preguntaban «¿en qué momentos?» con casillas y enseñaban una fila por
   respuesta, así que necesitaban volver a juntarlas para dibujarlas.

   Las pantallas ya no hacen eso. Ahora se añade, se edita, se pausa y se borra
   una regla cada vez, que es lo que de verdad son. El andamio estorba: un campo
   que nadie lee es una pregunta abierta para quien abra esto dentro de un año.

   No se pierde nada. `grupoId` no decía nada que la regla no dijera —qué
   preparación, qué momento, qué días—; solo decía con cuáles se había tecleado
   a la vez, y eso ya no cambia nada de lo que la app hace. */
function v9toV10(data) {
  const state = clone(data);
  quitarElAndamio(state);
  state.version = 10;
  return { state, notes: [] };
}

function quitarElAndamio(state) {
  if (!Array.isArray(state.mealRoutines)) return;
  state.mealRoutines = state.mealRoutines.map(reglaGuardada => {
    if (!reglaGuardada || typeof reglaGuardada !== 'object' || !('grupoId' in reglaGuardada)) return reglaGuardada;
    const { grupoId, ...resto } = reglaGuardada;
    return resto;
  });
}

const STEPS = { 1: v1toV2, 2: v2toV3, 3: v3toV4, 4: v4toV5, 5: v5toV6, 6: v6toV7, 7: v7toV8, 8: v8toV9, 9: v9toV10 };

// Campos que aparecieron dentro de una misma versión del esquema. Un respaldo
// exportado antes de que existieran se rellena en vez de rechazarse.
const OPTIONAL_V3 = { mealRoutines: [], monthPlans: {}, monthOverrides: {}, activity: [], settings: { reviewWeekday: 5, onboarded: false } };

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Este archivo no es un respaldo de ¿Qué comemos?.' };
  }
  const from = Number(data.version);
  if (!Number.isInteger(from) || from < 1) {
    return { ok: false, error: 'Este archivo no dice de qué versión es.' };
  }
  if (from > SCHEMA_VERSION) {
    return { ok: false, error: `Este respaldo viene de una versión más nueva de la app (${from}). Actualiza la aplicación antes de importarlo.` };
  }

  let current = clone(data);
  const notes = [];
  while (Number(current.version) < SCHEMA_VERSION) {
    const step = STEPS[Number(current.version)];
    if (!step) return { ok: false, error: `No sé convertir un respaldo de la versión ${current.version}.` };
    const result = step(current);
    current = result.state;
    notes.push(...result.notes);
  }

  for (const [key, value] of Object.entries(OPTIONAL_V3)) {
    if (!(key in current)) current[key] = clone(value);
  }

  // Y una última pasada por las personas, venga el respaldo de donde venga.
  // Un archivo exportado a media tarde de un día en que `restricciones` ya
  // existía pero `activo` todavía no entra por aquí igual que uno de la v1, y
  // repetirlo sobre datos ya convertidos no cambia nada.
  if (Array.isArray(current.people)) {
    current.people = current.people.map(persona => personaNormalizada(persona, restriccionesNormalizadas(persona)));
  }
  if (!Array.isArray(current.closedPeriods)) current.closedPeriods = [];
  // Y una por las comidas: un respaldo exportado a media tarde puede traer unas
  // con origen y otras sin él, y una comida sin origen dejaría la pantalla
  // diciendo «undefined» donde debería decir de dónde vino.
  if (Array.isArray(current.plans)) {
    current.plans = current.plans.map(plan =>
      (ORIGENES_DE_COMIDA.includes(plan?.origen) ? plan : { ...plan, origen: origenDeducido(plan) }));
  }
  // Y otra por las preparaciones, por lo mismo: un respaldo exportado a media
  // tarde puede traer todavía el campo que ya no existe.
  if (Array.isArray(current.recipes)) {
    current.recipes = current.recipes.map(receta => {
      const copia = { ...receta };
      delete copia.covers;
      const marcados = new Set(Array.isArray(receta.uses) ? receta.uses : []);
      copia.uses = MOMENTOS_DE_PREPARACION.filter(id => marcados.has(id));
      // Los alimentos de una preparación son un dato opcional, y desde la v9 su
      // cantidad también: una casa apunta «locrio: arroz, pollo, aceitunas»
      // mucho antes de saber cuántas tazas. Sin cantidad tampoco hay unidad que
      // valga —«3 de nada» no significa nada—, así que las dos van juntas.
      copia.items = (Array.isArray(receta.items) ? receta.items : []).map(item => {
        if (!item || typeof item !== 'object') return item;
        const vacia = item.quantity === undefined || item.quantity === null || item.quantity === '';
        return { ...item, quantity: vacia ? null : item.quantity, unit: vacia ? null : (item.unit ?? null) };
      });
      return copia;
    });
  }
  // Y una última por las rutinas. `desde` —desde qué día vale la regla— llegó
  // después que ellas, así que las guardadas antes no lo traen. Leerlo como
  // `undefined` funciona por casualidad, porque es falsy y se comporta como
  // «desde siempre», pero descansar en una casualidad es lo que hace que un día
  // alguien escriba `rutina.desde.slice(0, 7)` y se caiga la pantalla. Se
  // escribe el `null` explícito, que es lo que la app guarda desde entonces.
  if (Array.isArray(current.mealRoutines)) {
    current.mealRoutines = current.mealRoutines.map(rutina => (
      rutina && typeof rutina === 'object' && !('desde' in rutina) ? { ...rutina, desde: null } : rutina
    ));
  }

  // Y una por la canasta, por lo mismo que las anteriores: un respaldo
  // exportado a media tarde puede traer unas líneas con tramos y otras con la
  // cantidad suelta. Una línea sin tramos dejaría la compra del mes sin ese
  // alimento y sin decir por qué, que es la peor forma de fallar.
  if (Array.isArray(current.habitualBasket?.lines)) {
    current.habitualBasket.lines = current.habitualBasket.lines.map(linea => {
      if (!linea || typeof linea !== 'object') return linea;
      if (!Array.isArray(linea.tramos) || !linea.tramos.length) {
        const { quantity = null, unit, priority, desde = null, ...resto } = linea;
        return { ...resto, tramos: [{ desde: desde ?? null, quantity, unit, priority: priority || 'frecuente' }] };
      }
      // Ordenados siempre: quien busca el tramo de un mes recorre la lista y se
      // para en el primero que se pasa de fecha, así que un tramo fuera de sitio
      // devolvería la cantidad de otro mes sin que nada avisara.
      return { ...linea, tramos: [...linea.tramos].sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || ''))) };
    });
  }

  // Y la última, la de la v9. Va después de la de la canasta a propósito: lee
  // las líneas y necesita encontrarlas ya con sus tramos ordenados. Sobre un
  // estado ya convertido no cambia nada, que es lo que la hace repetible.
  asegurarV9(current);
  // El andamio de aquella conversión, por si un respaldo se exportó a media
  // tarde con él puesto.
  quitarElAndamio(current);

  return { ok: true, state: current, from, to: SCHEMA_VERSION, migrated: from < SCHEMA_VERSION, notes };
}
