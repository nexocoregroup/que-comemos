// El asistente escrito. Una conversación que siempre termina en la misma tabla
// de acciones que valida assistant.js: aquí no se toca el estado a mano, no se
// escribe en el almacenamiento y no se ejecuta nada que no esté en ACTION_NAMES.
//
// Tres decisiones gobiernan el archivo entero:
//
//   1. Primero el intérprete de casa. Las frases que la gente escribe de verdad
//      —«compré dos libras de arroz», «quedan tres latas de atún», «qué falta»—
//      se resuelven sin conexión, sin gastar servicio y sin que nada salga del
//      dispositivo. Solo lo que no se reconoce sale, y solo si hay servicio
//      configurado y la persona da permiso.
//   2. Lo que sale, sale pelado. El contexto que viaja son nombres: alimentos,
//      personas, preparaciones y el mes. Nunca las existencias, las compras ni
//      las revisiones: el modelo no necesita saber cuánto arroz hay en casa
//      para entender «agrega dos libras de arroz».
//   3. Un identificador por mensaje. Confirmar lo pendiente reutiliza el mismo,
//      así que tocar «Confirmar» dos veces no registra la compra dos veces.
//
// El panel dibuja HTML y nada más; app.js lo inserta, delega las acciones de
// CHAT_ACTIONS y los envíos de CHAT_FORMS, y guarda el estado en `ui.chat`.

import { ACTION_NAMES, isQuery, runActions, toolSchemas, undoTo } from './assistant.js';
import { cancelarDictado, capacidad } from './device.js';
import { botonDeVoz, panelDeVoz } from './voz.js';
import { SLOTS, addDays, etiquetaDeMomento, monthBounds, todayISO, weekStart } from './model.js';
import { parseLine, parseProductText, parseQuantity } from './text-parse.js';
import { button, cap, esc, fmt, monthName, niceDate, notice, unitText } from './ui-kit.js';

/* ── Estado del panel ──────────────────────────────────────────────────── */

export function emptyChat() {
  return { mensajes: [], pendiente: null, deshacer: null, enviando: false, error: '', errorTitulo: '', pista: '' };
}

// `pendiente` es siempre lo mismo —algo que espera una decisión de la persona—
// con tres formas: 'confirmar' (acciones sensibles con su vista previa),
// 'pregunta' (una duda con opciones) y 'aviso' (el permiso de envío). Tener un
// solo hueco evita que se acumulen dos preguntas sin saber cuál contesta quién.

// El permiso de envío vive en el módulo y no en `ui.chat` a propósito: es «la
// primera vez de cada sesión», así que tiene que morir al recargar la app y no
// viajar dentro del estado del panel.
let contador = 0;

// crypto.randomUUID no existe en contextos sin https ni en WebViews viejos. El
// respaldo no tiene que ser criptográfico: solo irrepetible dentro de la sesión.
function nuevoIdentificador() {
  const azar = globalThis.crypto;
  if (azar && typeof azar.randomUUID === 'function') return azar.randomUUID();
  contador += 1;
  return `chat-${Date.now().toString(36)}-${contador}`;
}

// El panel guarda su estado en `ui.chat` y app.js lo pasa como `ctx.chat`. Se
// busca en los dos para que dibujarlo antes de que app.js lo cree no reviente.
function chatDe(ctx) {
  if (ctx.chat) return ctx.chat;
  if (ctx.ui) { ctx.ui.chat = ctx.ui.chat || emptyChat(); ctx.chat = ctx.ui.chat; return ctx.chat; }
  ctx.chat = emptyChat();
  return ctx.chat;
}

function decir(chat, quien, texto, extra = {}) {
  const mensaje = { id: nuevoIdentificador(), quien, texto: String(texto ?? '').trim(), ...extra };
  chat.mensajes.push(mensaje);
  // Una conversación de meses no aporta nada y sí pesa en un teléfono.
  if (chat.mensajes.length > 60) chat.mensajes = chat.mensajes.slice(-60);
  return mensaje;
}

const campoDelChat = () => globalThis.document?.querySelector('[data-form="chat"] [name="mensaje"]') || null;

// Lo que la persona tenga escrito no se pierde porque el panel se vuelva a
// dibujar: se lee del campo antes de cada redibujo propio.
function guardarBorrador(ctx) {
  const campo = campoDelChat();
  if (campo) chatDe(ctx).borrador = campo.value;
}

// Lo dictado se añade a lo que ya hubiera: se dicta en tandas («ah, y también
// dos latas de atún»), y empezar de cero en cada tanda obligaría a repetirlo todo.

const valorDe = (data, nombre, form) => {
  if (data && typeof data.get === 'function') return data.get(nombre);
  if (data && typeof data === 'object' && nombre in data) return data[nombre];
  return form?.elements?.[nombre]?.value;
};

/* ── Leer español sin salir de casa ────────────────────────────────────── */

// El texto se analiza sin tildes y en minúscula, pero los nombres se recortan
// del original: la persona escribió «Plátano» y así tiene que llegar a la
// acción. Por eso el mapa cambia una letra por una letra y nunca la longitud:
// los índices de un texto valen para el otro.
const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', ñ: 'n' };
const plano = texto => String(texto ?? '').toLowerCase().replace(/[áéíóúüàèìòùñ]/g, letra => TILDES[letra] || letra);
const recorte = (original, inicio, largo) => original.slice(inicio, inicio + largo).trim();

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesActual = () => todayISO().slice(0, 7);
const mesSiguiente = mes => {
  const [ano, numero] = mes.split('-').map(Number);
  return numero === 12 ? `${ano + 1}-01` : `${ano}-${String(numero + 1).padStart(2, '0')}`;
};
// Un mes escrito por su nombre es el que viene, no el que pasó: quien dice «en
// marzo» en septiembre está planificando, no corrigiendo el pasado.
function mesPorNombre(nombre) {
  const indice = MESES.indexOf(nombre === 'setiembre' ? 'septiembre' : nombre);
  if (indice < 0) return null;
  const actual = mesActual(), ano = Number(actual.slice(0, 4)), numero = indice + 1;
  return `${numero >= Number(actual.slice(5, 7)) ? ano : ano + 1}-${String(numero).padStart(2, '0')}`;
}

function fechaEscrita(llano) {
  const hoy = todayISO();
  const explicita = llano.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicita) return explicita[1];
  if (/\bpasado\s+manana\b/.test(llano)) return addDays(hoy, 2);
  if (/\bmanana\b/.test(llano)) return addDays(hoy, 1);
  if (/\bantier\b|\banteayer\b/.test(llano)) return addDays(hoy, -2);
  if (/\bayer\b/.test(llano)) return addDays(hoy, -1);
  if (/\bhoy\b|\besta\s+noche\b|\beste\s+mediodia\b/.test(llano)) return hoy;
  return null;
}

const ARTICULO = /^(?:de\s+l[oa]s?|del|de\s+la|de|l[oa]s?|el|la|un|una|unos|unas|mis?|nuestr[oa]s?)\s+/;
// Una preposición colgando al final es lo que queda cuando se recorta un trozo
// del medio de la frase. Ningún alimento se llama «arroz de», así que se quita.
const COLGANDO = /\s+(?:de|del|a|al|en|para|con|y|e)$/;
function sinArticulo(texto, llano) {
  let a = texto.trim(), b = llano.trim();
  for (let encontrado = b.match(ARTICULO); encontrado; encontrado = b.match(ARTICULO)) {
    a = a.slice(encontrado[0].length).trim();
    b = b.slice(encontrado[0].length).trim();
  }
  return { texto: a.replace(COLGANDO, ''), llano: b.replace(COLGANDO, '') };
}

// Se busca el trozo sobre el texto sin tildes y se recorta de los dos a la vez,
// sustituyéndolo por un espacio: así el nombre del alimento conserva las tildes
// y las mayúsculas, y las dos cadenas siguen midiendo lo mismo.
function recortarTrozos(texto, llano, reglas) {
  let a = texto, b = llano;
  const efectos = [];
  for (const [expresion, efecto] of reglas) {
    const encontrado = b.match(expresion);
    if (!encontrado) continue;
    const inicio = encontrado.index, fin = inicio + encontrado[0].length;
    a = `${a.slice(0, inicio)} ${a.slice(fin)}`;
    b = `${b.slice(0, inicio)} ${b.slice(fin)}`;
    efectos.push([efecto, encontrado]);
  }
  return { texto: a.replace(/\s+/g, ' ').trim(), llano: b.replace(/\s+/g, ' ').trim(), efectos };
}

// «este mes», «en octubre», «desde ahora»: lo que dice hasta dónde llega la
// línea, y que estorba para leer la cantidad y el alimento. Las reglas más
// largas van primero, o «canasta habitual» se quedaría a medias en «canasta».
// La preposición se recorta junto con el trozo: «quita el atún de este mes»
// tiene que dejar «el atún», no «el atún de».
//
// El alcance: si lo que se pide vale solo para un mes o desde ahora y para
// siempre. Es la distinción que más daño hace equivocada —cambiar la costumbre
// de una casa porque alguien compró cangrejo una vez—, así que aquí solo se
// reconoce lo que la frase dice con todas las letras. Lo que no se dijo se
// devuelve como `null` y se pregunta; nunca se supone.
const MES_DICHO = '(?:(?:de|del|para|en|durante|a)\\s+)?';
const NOMBRES_DE_MES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const REGLAS_ALCANCE = [
  // «desde ahora», «todos los meses», «mi canasta habitual»: la costumbre.
  [/\b(?:desde\s+ahora|de\s+ahora\s+en\s+adelante|a\s+partir\s+de\s+ahora|de\s+aqui\s+en\s+adelante)\b/, 'siempre'],
  [/\b(?:todos\s+los\s+meses|cada\s+mes|todos\s+los\s+dias\s+del\s+ano|para\s+siempre|siempre)\b/, 'siempre'],
  [new RegExp(`\\b${MES_DICHO}(?:mi\\s+|la\\s+)?canasta\\s+habitual\\b`), 'siempre'],
  // «este mes», «para octubre», «el mes que viene»: una excepción y nada más.
  [new RegExp(`\\b${MES_DICHO}(?:el\\s+)?mes\\s+que\\s+viene\\b|\\b${MES_DICHO}proximo\\s+mes\\b|\\bmes\\s+entrante\\b`), 'mes-siguiente'],
  [new RegExp(`\\b(?:solo|solamente|unicamente)?\\s*(?:en|para|de|del|a|durante)\\s+(${NOMBRES_DE_MES})\\b`), 'mes-nombre'],
  [new RegExp(`\\b(?:solo|solamente|unicamente)?\\s*${MES_DICHO}(?:este|ese)\\s+mes\\b`), 'mes-actual'],
  // «a la canasta» a secas ya no significa nada: se dejaba caer en el hábito y
  // ese era justo el error. Se recorta para poder leer la línea, pero no fija
  // ningún alcance.
  [new RegExp(`\\b${MES_DICHO}(?:la\\s+)?canasta(?:\\s+de(?:l)?(?:\\s+este)?\\s+mes)?\\b`), 'nada'],
  [new RegExp(`\\b${MES_DICHO}(?:el\\s+)?mes\\b`), 'mes-actual']
];
function leerAlcance(texto, llano) {
  const limpio = recortarTrozos(texto, llano, REGLAS_ALCANCE);
  let mes = null, siempre = false;
  for (const [efecto, encontrado] of limpio.efectos) {
    if (efecto === 'siempre') siempre = true;
    else if (efecto === 'mes-actual') mes = mes || mesActual();
    else if (efecto === 'mes-siguiente') mes = mes || mesSiguiente(mesActual());
    else if (efecto === 'mes-nombre') mes = mes || mesPorNombre(encontrado[1]);
  }
  // «desde ahora, todos los meses» gana a cualquier mes nombrado de paso: quien
  // dice las dos cosas está diciendo que a partir de ese mes es la norma.
  const alcance = siempre ? 'siempre' : (mes ? 'mes' : null);
  return { texto: limpio.texto, llano: limpio.llano, alcance, mes: alcance === 'mes' ? mes : null };
}

const mesLegible = mes => monthName(mes).toLocaleLowerCase('es');

function periodoEscrito(llano) {
  const hoy = todayISO(), mes = hoy.slice(0, 7), limites = monthBounds(mes);
  if (/\bquincena\b/.test(llano)) {
    return Number(hoy.slice(8)) <= 15 ? { desde: `${mes}-01`, hasta: `${mes}-15` } : { desde: `${mes}-16`, hasta: limites.end };
  }
  if (/\b(?:esta|la|de\s+la)\s+semana\b/.test(llano)) { const inicio = weekStart(hoy); return { desde: inicio, hasta: addDays(inicio, 6) }; }
  if (/\beste\s+mes\b|\bdel\s+mes\b|\bpara\s+el\s+mes\b/.test(llano)) return { desde: limites.start, hasta: limites.end };
  const fecha = fechaEscrita(llano);
  if (fecha) return { desde: fecha, hasta: fecha };
  // Por defecto, de hoy a fin de mes: es el período que tiene sentido cuando
  // alguien pregunta «qué falta» sin decir para cuándo.
  return { desde: hoy, hasta: limites.end };
}

/* ── Los patrones ──────────────────────────────────────────────────────── */
//
// Cada patrón recibe el texto tal cual y su copia sin tildes, y devuelve o bien
// null (no es lo suyo), o bien `{ acciones }`, o bien `{ acciones, duda }`
// cuando reconoce la frase pero le falta un dato que no se puede adivinar.
// El orden importa: las preguntas van antes que las afirmaciones, porque
// «cuánto queda de arroz» lleva dentro «queda … arroz».

function reconocerMenu(texto, llano) {
  const pregunta = /^(?:¿\s*)?(?:dime\s+)?(?:que|cual\s+es\s+el\s+menu)\s+(?:se\s+)?(?:come|comemos|cocina|cocinamos|cocino|preparo|preparamos|cenamos|almorzamos|desayunamos|toca)\b/.test(llano)
    || /^(?:¿\s*)?que\s+hay\s+(?:para|de)\s+(?:comer|cenar|almorzar|desayunar|cena|almuerzo|desayuno)\b/.test(llano)
    || /^(?:ver\s+(?:el\s+)?)?menu\b/.test(llano);
  if (!pregunta) return null;
  const fecha = fechaEscrita(llano);
  return { acciones: [{ action: 'ver_menu', arguments: fecha ? { fecha } : {} }] };
}

function reconocerExistencias(texto, llano) {
  // «cuánto queda de arroz» y «cuánto arroz queda» son la misma pregunta dicha
  // en los dos órdenes en que se dice de verdad.
  const cola = llano.match(/^((?:¿\s*)?cuant[oa]s?\s+(?:me\s+|nos\s+)?(?:queda|quedan|tengo|tenemos|hay)\s+)(.+?)\s*\??$/);
  if (cola) {
    const alimento = sinArticulo(recorte(texto, cola[1].length, cola[2].length), cola[2]);
    return { acciones: [{ action: 'consultar_existencias', arguments: alimento.texto ? { producto: alimento.texto } : {} }] };
  }
  const medio = llano.match(/^((?:¿\s*)?cuant[oa]s?\s+)(.+?)(\s+(?:me\s+|nos\s+)?(?:queda|quedan|tengo|tenemos|hay)\s*\??)$/);
  if (medio) {
    const alimento = sinArticulo(recorte(texto, medio[1].length, medio[2].length), medio[2]);
    return { acciones: [{ action: 'consultar_existencias', arguments: alimento.texto ? { producto: alimento.texto } : {} }] };
  }
  if (/^(?:¿\s*)?(?:que|cuales)\s+(?:existencias|inventario)\b/.test(llano) || /^(?:¿\s*)?que\s+(?:hay|tengo|tenemos)\s+en\s+casa\b/.test(llano)) {
    return { acciones: [{ action: 'consultar_existencias', arguments: {} }] };
  }
  return null;
}

function reconocerLista(texto, llano) {
  const pregunta = /\bque\s+(?:me\s+|nos\s+)?(?:falta|faltan|hace\s+falta)\b/.test(llano)
    || /\bque\s+(?:hay|tengo|tenemos|debo|debemos)\s+(?:que\s+)?comprar\b/.test(llano)
    || /\blista\s+de\s+(?:la\s+)?compra\b|\blista\s+del?\s+mercado\b/.test(llano)
    || /^(?:¿\s*)?que\s+compr(?:o|amos)\b/.test(llano);
  if (!pregunta) return null;
  const periodo = periodoEscrito(llano);
  const base = /\bsegun\s+el\s+menu\b|\bdel\s+menu\b/.test(llano) ? 'menu' : null;
  return { acciones: [{ action: 'calcular_lista', arguments: { desde: periodo.desde, hasta: periodo.hasta, ...(base ? { base } : {}) } }] };
}

const VERBO_COMIDA = { cenar: 'cena', cena: 'cena', almorzar: 'almuerzo', almuerza: 'almuerzo', desayunar: 'desayuno', desayuna: 'desayuno', merendar: 'merienda-tarde', merienda: 'merienda-tarde' };
function reconocerAusencia(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?)(.{2,40}?)\s+no\s+(?:va\s+a\s+|van\s+a\s+)?(cenar|cena|almorzar|almuerza|desayunar|desayuna|come|comen|comera|comeran)\b(.*)$/);
  if (!encontrado) return null;
  const resto = encontrado[4] || '';
  const fecha = fechaEscrita(llano);
  // «no come arroz» es una restricción, no una ausencia. Para que sea ausencia
  // la frase tiene que decir dónde o cuándo: «en casa», o un día.
  if (!/\ben\s+casa\b/.test(resto) && !fecha) return null;
  const nombrado = momentoNombrado(resto);
  const comida = VERBO_COMIDA[encontrado[3]] || (nombrado ? nombrado[1] : null);
  const persona = recorte(texto, encontrado[1].length, encontrado[2].length);
  const argumentos = { persona, fecha: fecha || todayISO(), ...(comida ? { comida } : {}) };
  const accion = { action: 'registrar_ausencia', arguments: argumentos };
  // «no come en casa mañana» no dice qué comida, y las tres no son lo mismo:
  // se pregunta en vez de elegir una.
  if (comida) return { acciones: [accion] };
  return { acciones: [accion], duda: { pregunta: `¿En qué comida no come ${persona} en casa?`, campo: 'comida', opciones: SLOTS.map(slot => ({ id: slot, nombre: etiquetaDeMomento(slot) })) } };
}

function reconocerRestriccion(texto, llano) {
  const partido = llano.match(/^((?:¿\s*)?(?:a\s+)?)(.{2,40}?)\s+(?:no\s+puede\s+comer|no\s+come|no\s+le\s+cae\s+bien|es\s+alergic[oa]\s+a(?:l)?|tiene\s+alergia\s+a(?:l)?|no\s+le\s+damos)\s+(.+)$/);
  if (!partido) return null;
  const persona = recorte(texto, partido[1].length, partido[2].length);
  const alimento = sinArticulo(texto.slice(texto.length - partido[3].length), partido[3]);
  if (!persona || !alimento.texto) return null;
  // Solo se anota el motivo cuando la frase lo dice con esas palabras. «Es
  // alérgico al maní» es una alergia; «no le damos maní» no dice por qué, y
  // adivinarlo sería pintar de rojo un gusto o de gris una alergia.
  const motivo = /es\s+alergic[oa]\s+a|tiene\s+alergia\s+a/.test(llano) ? 'alergia'
    : /no\s+le\s+cae\s+bien/.test(llano) ? 'intolerancia'
    : null;
  return { acciones: [{ action: 'agregar_restriccion', arguments: motivo ? { persona, alimento: alimento.texto, motivo } : { persona, alimento: alimento.texto } }] };
}

function reconocerRestante(texto, llano) {
  // «de los 30 plátanos quedan 12»: el primer número es lo que había y no hace
  // falta; lo que se registra es lo que queda.
  const comparada = llano.match(/^((?:de\s+)(?:l[oa]s\s+)?(?:[\d.,]+\s+)?)(.+?)\s+(?:me\s+|nos\s+)?qued[ao]n?\s+(.+)$/);
  if (comparada) {
    const queda = parseQuantity(comparada[3]);
    const alimento = sinArticulo(recorte(texto, comparada[1].length, comparada[2].length), comparada[2]);
    if (queda !== null && alimento.texto) return { acciones: [{ action: 'registrar_restante', arguments: { producto: alimento.texto, queda } }] };
  }
  // «quedan 3 latas de atún», y también «quedan dos plátanos, diez huevos y
  // media libra de queso»: nadie repasa la despensa alimento por alimento.
  const suelta = llano.match(/^((?:¿\s*)?(?:solo\s+|ya\s+solo\s+)?(?:me\s+|nos\s+)?qued[ao]n?\s+)(.+)$/);
  if (!suelta) return null;
  const acciones = trozosDeLista(texto.slice(suelta[1].length))
    .map(trozo => parseLine(trozo))
    .filter(fila => fila && fila.quantity !== null && !fila.negated && fila.name.length > 1)
    .map(fila => ({ action: 'registrar_restante', arguments: { producto: fila.name, queda: fila.quantity } }));
  return acciones.length ? { acciones } : null;
}

// Partir «dos plátanos, diez huevos y media libra de queso» en tres. La coma es
// fácil; la «y» no, porque también une nombres («arroz y habichuelas»). Se parte
// solo cuando lo que sigue empieza por una cantidad y lo que queda detrás tiene
// nombre propio: «y media libra de queso» es otro alimento, «y habichuelas» no.
const esFilaEntera = trozo => {
  const fila = parseLine(trozo);
  return Boolean(fila && fila.quantity !== null && fila.name.length > 1);
};
function trozosDeLista(texto) {
  const salida = [];
  for (const parte of String(texto ?? '').split(/[;\n\r]+|(?<!\d),|,(?!\d)/)) {
    for (const trozo of parte.split(/\s+[ye]\s+/)) {
      if (!salida.length) { salida.push(trozo); continue; }
      // Se pega al anterior por dos motivos: lo de antes era solo una cantidad
      // («dos y medio plátanos») o lo de ahora no trae la suya («arroz y
      // habichuelas»). En los dos casos la «y» está dentro de una sola fila.
      if (!esFilaEntera(salida[salida.length - 1]) || !esFilaEntera(trozo)) salida[salida.length - 1] += ` y ${trozo}`;
      else salida.push(trozo);
    }
  }
  return salida;
}

function reconocerQuitar(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?(?:quita(?:me|le)?|quitar|saca(?:me)?|sacar|elimina(?:me)?|eliminar|borra(?:me)?|no\s+compres|no\s+compremos|no\s+compramos|no\s+compraremos|no\s+vamos\s+a\s+comprar|no\s+lleves|no\s+llevemos)\s+)(.+)$/);
  if (!encontrado) return null;
  const leido = leerAlcance(texto.slice(encontrado[1].length), encontrado[2]);
  const alimento = sinArticulo(leido.texto, leido.llano);
  if (!alimento.texto) return null;
  const mes = leido.mes || mesActual();
  const soloEsteMes = { action: 'quitar_solo_este_mes', arguments: { mes, producto: alimento.texto } };
  const desdeAhora = { action: 'quitar_de_habitual', arguments: { producto: alimento.texto } };
  if (leido.alcance === 'siempre') return { acciones: [desdeAhora] };
  if (leido.alcance === 'mes') return { acciones: [soloEsteMes] };
  return { acciones: [soloEsteMes], duda: dudaDeAlcance(alimento.texto, mes, soloEsteMes, desdeAhora) };
}

// Las dos únicas lecturas de una frase que no dijo su alcance, cada una con la
// acción que le corresponde. No hay valor por omisión a propósito: dar por
// supuesto «siempre» reescribiría la costumbre de la casa, y dar por supuesto
// «este mes» dejaría sin registrar un cambio que sí era para siempre.
function dudaDeAlcance(nombre, mes, soloEsteMes, desdeAhora) {
  return {
    pregunta: `¿«${nombre}» es solo para ${mesLegible(mes)} o desde ahora, todos los meses?`,
    campo: null,
    opciones: [
      { id: 'mes', nombre: `Solo en ${mesLegible(mes)}`, acciones: [soloEsteMes] },
      { id: 'siempre', nombre: 'Desde ahora, todos los meses', acciones: [desdeAhora] }
    ]
  };
}

function reconocerArchivar(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?(?:archiva(?:me)?|archivar|guarda\s+en\s+archivo|da\s+de\s+baja\s+a?)\s+)(.+)$/);
  if (!encontrado) return null;
  const alimento = sinArticulo(recorte(texto, encontrado[1].length, encontrado[2].length), encontrado[2]);
  if (!alimento.texto) return null;
  return { acciones: [{ action: 'archivar_producto', arguments: { producto: alimento.texto } }] };
}

function reconocerCompra(texto, llano) {
  // «compramos» es pasado y presente a la vez, así que «desde ahora compramos
  // cuatro libras de arroz todos los meses» entraba aquí y se registraba como
  // una compra que nadie hizo, subiendo las existencias. Quien dice «desde
  // ahora» o «todos los meses» está describiendo la costumbre, no el colmado.
  if (leerAlcance(texto, llano).alcance === 'siempre') return null;
  const encontrado = llano.match(/(?:^|\s)(?:acabo\s+de\s+comprar|compre|compro|compramos|compraron|compraste)\b/);
  if (!encontrado) return null;
  // Se le pasa la frase desde el verbo, porque parseProductText ya sabe que
  // «compré» es muletilla y no producto.
  const desde = encontrado.index + (encontrado[0].startsWith(' ') ? 1 : 0);
  const leido = parseProductText(texto.slice(desde));
  const lineas = leido.lines
    .filter(fila => !fila.negated && fila.name.length > 1 && fila.quantity !== null && fila.unit)
    .map(fila => ({ producto: fila.name, cantidad: fila.quantity, unidad: fila.unit }));
  if (!lineas.length) return null;
  const fecha = fechaEscrita(llano);
  return { acciones: [{ action: 'registrar_compra', arguments: { lineas, ...(fecha ? { fecha } : {}) } }] };
}

// Las formas largas van antes que las cortas: «compraremos» tiene que ganarle a
// «compra», o se quedaría a medias y la frase no encajaría.
const VERBO_CANASTA = '(?:agrega(?:me|le)?|agregar|anade(?:me|le)?|anadir|pon(?:me|le)?|poner|mete(?:me)?|meter|suma(?:me)?|sumar|apunta(?:me)?|anota(?:me)?|incluye|necesitamos|necesito|compraremos|compraran|compraras|compramos|compremos|comprare|compra(?:me)?|vamos\\s+a\\s+comprar|hay\\s+que\\s+comprar|llevamos|llevaremos)';
function reconocerCanasta(texto, llano) {
  // Se limpia primero lo que dice el alcance, porque tanto «este mes pon 40 lb
  // de arroz» como «pon 40 lb de arroz este mes» son la misma frase.
  const leido = leerAlcance(texto, llano);
  const encontrado = leido.llano.match(new RegExp(`^((?:¿\\s*)?${VERBO_CANASTA}\\s+)(.+)$`));
  if (!encontrado) return null;
  const fila = parseLine(leido.texto.slice(encontrado[1].length));
  if (!fila || fila.quantity === null || !fila.unit || fila.name.length <= 1) return null;
  const comun = { producto: fila.name, cantidad: fila.quantity, unidad: fila.unit };
  const mes = leido.mes || mesActual();
  const soloEsteMes = { action: 'cambiar_solo_este_mes', arguments: { mes, ...comun } };
  const desdeAhora = { action: 'agregar_a_habitual', arguments: comun };
  if (leido.alcance === 'siempre') return { acciones: [desdeAhora] };
  if (leido.alcance === 'mes') return { acciones: [soloEsteMes] };
  return { acciones: [soloEsteMes], duda: dudaDeAlcance(fila.name, mes, soloEsteMes, desdeAhora) };
}

/* ── Las rutinas dichas en voz alta ────────────────────────────────────── */

// ISO, como en routines.js: 1 lunes … 7 domingo. Los que terminan en «s» no
// cambian en plural; los otros dos sí.
const DIAS_DICHOS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sabados: 6, domingo: 7, domingos: 7 };
const DIA_SUELTO = '(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';
const ORDINALES_DICHOS = { primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5 };
// Lo que puede venir pegado delante del día y forma parte de la regla, no del
// nombre de la comida: «todos los lunes», «ningún domingo», «cada viernes».
const ANTES_DEL_DIA = '(?:todos\\s+los\\s+|todas\\s+las\\s+|cada\\s+|ningun\\s+|ningunos\\s+|los\\s+|las\\s+|el\\s+|la\\s+)?';
const VERBO_SLOT = [
  ['desayuno', /\bdesayun/],
  ['merienda-manana', /\bmerienda\s+de\s+(?:la\s+)?ma(?:n|ñ)ana\b|\bmerienda\s+matutina\b/],
  ['almuerzo', /\balmuerz|\balmorz/],
  // Sin decir cuál, «la merienda» es la de la tarde: es la que una casa
  // dominicana llama así a secas.
  ['merienda-tarde', /\bmerienda\b|\bmerend/],
  ['cena', /\bcena\b|\bcenas\b|\bcenar|\bcenaremos\b|\bcenamos\b/]
];

// El momento nombrado dentro de una frase, por su nombre o por el de la casa.
const momentoNombrado = texto => {
  for (const [slot, patron] of VERBO_SLOT) if (patron.test(texto)) return [texto, slot];
  return null;
};

function reconocerRutina(texto, llano) {
  const dias = [...llano.matchAll(new RegExp(`\\b(${DIA_SUELTO})\\b`, 'g'))].map(fila => DIAS_DICHOS[fila[1]]);
  if (!dias.length) return null;
  const leido = leerAlcance(texto, llano);
  const semanas = [...leido.llano.matchAll(/\b(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao])\b/g)].map(fila => ORDINALES_DICHOS[fila[1]]).filter(Boolean);
  const comidas = VERBO_SLOT.filter(([, expresion]) => expresion.test(leido.llano)).map(([slot]) => slot);

  // Fuera de casa y pedir comida se dicen así y no hay que nombrar nada más.
  const fuera = /\bfuera\b|\bno\s+(?:comeremos|comemos|come|cocinamos|cocinaremos)\s+en\s+casa\b|\bcomer\s+fuera\b/.test(leido.llano);
  const pedido = /\bpedir(?:emos)?\b|\bpedimos\b|\bdelivery\b|\bpedido\b|\bordenamos\b/.test(leido.llano);
  const tipo = fuera ? 'fuera' : pedido ? 'pedido' : 'preparacion';

  const comun = {
    tipo,
    comidas: comidas.length ? comidas : [...SLOTS],
    dias: [...new Set(dias)].sort((a, b) => a - b),
    ...(semanas.length ? { semanas: [...new Set(semanas)].sort((a, b) => a - b) } : {}),
    ...(leido.alcance ? { alcance: leido.alcance === 'siempre' ? 'siempre' : 'mes' } : {}),
    ...(leido.mes ? { mes: leido.mes } : {})
  };

  if (tipo !== 'preparacion') return { acciones: [{ action: 'crear_rutina', arguments: comun }] };
  // Para una preparación hace falta su nombre, y está entre el verbo y la regla
  // de los días: «pon TORTILLAS CON JAMÓN Y QUESO todos los lunes…».
  const verbo = leido.llano.match(new RegExp(`^((?:¿\\s*)?(?:${VERBO_CANASTA}|haz|hacer|cocina|cocinar|prepara(?:me)?|preparar|come(?:mos|remos)?|desayuna(?:mos|remos)?|almorza(?:mos|remos)?|cena(?:mos|remos)?)\\s+)`));
  const desde = verbo ? verbo[1].length : 0;
  const corte = leido.llano.search(new RegExp(`\\b${ANTES_DEL_DIA}${DIA_SUELTO}\\b`));
  if (corte <= desde) return null;
  const nombre = sinArticulo(recorte(leido.texto, desde, corte - desde), leido.llano.slice(desde, corte));
  if (!nombre.texto || nombre.texto.length <= 2) return null;
  return { acciones: [{ action: 'crear_rutina', arguments: { ...comun, preparacion: nombre.texto } }] };
}

// «Copia la rutina de septiembre para octubre»: repetir el mes pasado es lo
// primero que pide quien ya llenó uno entero a mano.
function reconocerCopiarMes(texto, llano) {
  const expresion = new RegExp(`^(?:¿\\s*)?(?:copia(?:me)?|copiar|repite(?:me)?|repetir|pasa(?:me)?|traslada)\\s+(?:l[ao]s?\\s+)?(?:rutinas?|patron|menu|plan|comidas|mismo|misma)?\\s*(?:de(?:l)?\\s+)?(${NOMBRES_DE_MES})\\s+(?:para|a|en|al)\\s+(?:el\\s+(?:mes\\s+de\\s+)?)?(${NOMBRES_DE_MES})\\b`);
  const encontrado = llano.match(expresion);
  if (!encontrado) return null;
  const desde = mesPorNombre(encontrado[1]), hasta = mesPorNombre(encontrado[2]);
  if (!desde || !hasta || desde === hasta) return null;
  return { acciones: [{ action: 'copiar_rutina_de_mes', arguments: { desde, hasta } }] };
}

// «Cambia solamente la cena de mañana»: un solo día, sin tocar la rutina que lo
// puso. El «solamente» es lo importante de la frase y por eso va en la acción.
function reconocerCambiarComida(texto, llano) {
  const encontrado = llano.match(/^(?:¿\s*)?(?:cambia(?:me|le)?|cambiar|modifica|modificar|edita|editar)\s+(?:solo|solamente|unicamente|nada\s+mas)?\s*(?:l[ao]\s+|el\s+)?(desayuno|almuerzo|cena)\b(.*)$/);
  if (!encontrado) return null;
  return { acciones: [{ action: 'cambiar_solo_esta_comida', arguments: { fecha: fechaEscrita(llano) || todayISO(), comida: encontrado[1] } }] };
}

/* ── Echarle algo a una preparación que ya existe ──────────────────────────

   Dos formas, y las dos se oyen en una cocina:

     «Al mangú con salami échale dos huevos.»
     «Agrega dos huevos a la preparación mangú.»

   La primera se reconoce por el orden —nombre, luego verbo con pronombre
   pegado—, que en español no significa casi ninguna otra cosa. La segunda exige
   la palabra «preparación», «receta» o «plato», porque sin ella «agrega dos
   libras de arroz a mi canasta» entraría por aquí.

   Va antes que el patrón de la canasta y por eso lleva la lista de palabras que
   no puede tomar por el nombre de un plato. Sin esa lista, «a mi canasta
   agrégale dos libras de arroz» se convertiría en una preparación llamada «mi
   canasta», y el validador diría que no la encuentra en vez de hacer lo que se
   pidió. */

const NO_SON_PLATOS = /\b(?:canasta|lista|compra|mes|inventario|despensa|nevera)\b/;
const VERBO_ECHAR = '(?:anade(?:le)?|agrega(?:le)?|echa(?:le)?|pon(?:le)?|sumale|ponerle)';

function reconocerAgregarAPreparacion(texto, llano) {
  const conNombreDelante = llano.match(new RegExp(`^(?:¿\\s*)?(?:a|al|a\\s+la)\\s+(?:la\\s+)?(?:preparacion|receta|plato)?\\s*(.+?)\\s+${VERBO_ECHAR}\\s+(.+)$`));
  const conNombreDetras = llano.match(new RegExp(`^(?:¿\\s*)?${VERBO_ECHAR}\\s+(.+?)\\s+a\\s+(?:la\\s+|el\\s+)?(?:preparacion|receta|plato)\\s+(?:de\\s+)?(.+)$`));
  const encontrado = conNombreDelante
    ? { nombre: conNombreDelante[1], alimentos: conNombreDelante[2] }
    : conNombreDetras ? { nombre: conNombreDetras[2], alimentos: conNombreDetras[1] } : null;
  if (!encontrado) return null;
  // El punto final de la frase se pega al nombre cuando el nombre va al final, y
  // «mangu.» no encuentra a «Mangú».
  encontrado.nombre = encontrado.nombre.replace(/[\s.,;:!?¡¿]+$/u, '');
  if (!encontrado.nombre || NO_SON_PLATOS.test(encontrado.nombre)) return null;

  // Sin cantidad también vale: «échale salami» es una frase entera. Lo que no
  // vale es una fila sin nombre.
  const alimentos = parseProductText(encontrado.alimentos).lines
    .filter(fila => !fila.negated && fila.name.length > 1)
    .map(fila => ({ producto: fila.name, cantidad: fila.quantity, unidad: fila.unit }));
  if (!alimentos.length) return null;
  // El nombre viaja sin tildes y da igual: quien resuelve la preparación
  // compara por nombre normalizado, así que «mangu con salami» encuentra
  // «Mangú con salami». Si no encuentra ninguna, lo dice y ofrece las que hay,
  // que es lo que toca cuando no se está seguro.
  return { acciones: [{ action: 'agregar_a_preparacion', arguments: { preparacion: encontrado.nombre, alimentos } }] };
}

const PATRONES = [
  reconocerMenu, reconocerExistencias, reconocerLista, reconocerAusencia, reconocerRestriccion,
  reconocerCopiarMes, reconocerCambiarComida, reconocerRutina,
  reconocerRestante, reconocerQuitar, reconocerArchivar, reconocerCompra,
  reconocerAgregarAPreparacion, reconocerCanasta
];

// Exportado por el panel a través de `enviar`: devuelve `{ acciones, duda }` o
// null. Nunca inventa un nombre de acción: todas salen escritas de un patrón, y
// aun así se comprueban contra ACTION_NAMES antes de ejecutarse.
export function interpretar(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return null;
  const llano = plano(limpio);
  for (const patron of PATRONES) {
    const leido = patron(limpio, llano);
    if (leido && leido.acciones?.length && leido.acciones.every(peticion => ACTION_NAMES.includes(peticion.action))) return leido;
  }
  return null;
}

/* ── Enseñar el resultado en español ───────────────────────────────────── */

const ESTADO_COMIDA = { outside: 'fuera de casa', order: 'pedir comida', unplanned: 'sin planificar', 'sin plan': 'todavía sin decidir' };
const cantidadTexto = (valor, unidad) => `${fmt(valor)} ${unitText(unidad, Number(valor))}`;
const lista = filas => filas.join('\n');

// El usuario nunca ve JSON. Cada consulta se cuenta con palabras; lo que no
// tenga forma conocida devuelve vacío y se queda con el resumen de la acción.
function describirResultado(accion, resultado, argumentos = {}) {
  if (!resultado) return '';
  if (accion === 'consultar_existencias') {
    if (Array.isArray(resultado)) {
      const conAlgo = resultado.filter(fila => Number(fila.cantidad) > 0);
      if (!conAlgo.length) return 'No hay existencias anotadas todavía.';
      const filas = conAlgo.slice(0, 15).map(fila => `• ${fila.nombre}: ${cantidadTexto(fila.cantidad, fila.unidad)}`);
      return lista([...filas, conAlgo.length > 15 ? `y ${conAlgo.length - 15} alimento(s) más.` : '']).trim();
    }
    return `De ${resultado.nombre} ${Number(resultado.cantidad) === 1 ? 'queda' : 'quedan'} ${cantidadTexto(resultado.cantidad, resultado.unidad)}.`;
  }
  if (accion === 'calcular_lista') {
    // El período se dice siempre, porque la lista depende entera de él y quien
    // pregunta «qué falta» no escribió ninguna fecha.
    const corto = { day: 'numeric', month: 'long' };
    const periodo = argumentos.desde && argumentos.hasta ? `Del ${niceDate(argumentos.desde, corto)} al ${niceDate(argumentos.hasta, corto)}` : 'En ese período';
    const filas = resultado.lineas || [];
    if (!filas.length) return `${periodo} no hace falta comprar nada: alcanza con lo que hay en casa.`;
    const texto = filas.slice(0, 25).map(fila => fila.porComprar === null
      ? `• ${fila.nombre}: falta la equivalencia para saber cuánto comprar.`
      : `• ${cantidadTexto(fila.porComprar, fila.unidad)} de ${fila.nombre}. ${fila.porque}`);
    const cola = resultado.pendientes ? `\n${resultado.pendientes} alimento(s) esperan una equivalencia; complétala en su ficha.` : '';
    return `${periodo} hace falta comprar:\n${lista(texto)}${filas.length > 25 ? `\ny ${filas.length - 25} más.` : ''}${cola}`;
  }
  if (accion === 'ver_menu' && Array.isArray(resultado)) {
    return lista(resultado.map(fila => `${cap(fila.comida)}: ${fila.titulo || ESTADO_COMIDA[fila.estado] || fila.estado}`));
  }
  if ((accion === 'ver_canasta_habitual' || accion === 'ver_canasta_del_mes') && Array.isArray(resultado)) {
    if (!resultado.length) return 'No hay ningún producto habitual guardado.';
    const marca = { cambio: ' (cambiado este mes)', extra: ' (extra de este mes)' };
    return lista(resultado.slice(0, 30).map(fila => `• ${cantidadTexto(fila.cantidad, fila.unidad)} de ${fila.nombre}${marca[fila.origen] || ''}`));
  }
  if (accion === 'ver_rutinas' && Array.isArray(resultado)) {
    if (!resultado.length) return 'Todavía no tienes rutinas de comida.';
    return lista(resultado.map(fila => `• ${fila.etiqueta}: ${fila.regla}, ${fila.comidas.join(' y ')} — ${fila.alcance === 'siempre' ? 'desde ahora, todos los meses' : 'solo este mes'} (${fila.fechas.length} día(s) este mes)`));
  }
  if (accion === 'crear_rutina' && resultado?.fechas) {
    const saltados = resultado.saltados?.length ? ` Dejé ${resultado.saltados.length} comida(s) como estaban porque ya tenían algo.` : '';
    return `Quedó escrita. Llené ${resultado.creados} comida(s) en ${resultado.fechas.length} día(s) de ${mesLegible(resultado.mes)}.${saltados}`;
  }
  if (accion === 'copiar_rutina_de_mes' || accion === 'aplicar_rutinas') {
    return `Puse ${resultado.creados} comida(s). Dejé ${resultado.saltados} como estaban.`;
  }
  if (accion === 'ver_avance_mes' && resultado?.month) {
    return `De ${resultado.huecos} comidas del mes, ${resultado.pendientes} siguen sin decidir (${resultado.porcentaje}% listo). En casa ${resultado.encasa}, fuera ${resultado.fuera}, pedidas ${resultado.pedido}.`;
  }
  if (accion === 'ver_cambios_del_mes' && resultado?.cambios) {
    if (!resultado.cambios.length) return `En ${mesLegible(resultado.mes)} no hay ningún cambio: es mis productos habituales tal cual.`;
    return lista(resultado.cambios.map(fila => fila.quitado
      ? `• ${fila.nombre}: este mes no se compra.`
      : `• ${fila.nombre}: ${cantidadTexto(fila.cantidad, fila.unidad)}${fila.extra ? ' (solo este mes)' : ' en vez de lo habitual'}.`));
  }
  if (accion === 'listar_productos' && Array.isArray(resultado)) {
    if (!resultado.length) return 'Todavía no hay alimentos en el catálogo.';
    return `Alimentos: ${resultado.slice(0, 40).map(fila => fila.nombre).join(', ')}${resultado.length > 40 ? ` y ${resultado.length - 40} más` : ''}.`;
  }
  if (accion === 'buscar_producto') {
    if (resultado.encontrado) return `Sí, «${resultado.encontrado.nombre}» está en el catálogo.`;
    if (resultado.parecidos?.length) return `No lo encontré. Parecidos: ${resultado.parecidos.map(fila => fila.nombre).join(', ')}.`;
    return 'No encontré nada parecido en el catálogo.';
  }
  return '';
}

// `results` llega en el mismo orden en que se pidieron las acciones, así que
// cada resultado se cuenta con los argumentos que lo produjeron.
function resumenLegible(acciones, resultado) {
  const partes = (resultado.results || []).map((fila, indice) => describirResultado(fila.action, fila.result, acciones[indice]?.arguments || {})).filter(Boolean);
  if (acciones.every(peticion => isQuery(peticion.action))) return partes.join('\n\n') || 'No encontré nada que enseñarte.';
  return [resultado.summary, ...partes].filter(Boolean).join('\n\n');
}

/* ── Ejecutar ──────────────────────────────────────────────────────────── */

// Qué argumentos acepta cada acción, sacado de la misma tabla que valida. Sirve
// para contestar una pregunta —«¿cuál de estos arroces?»— poniendo la respuesta
// en las acciones que de verdad tienen ese campo, sin tocar las demás.
// La forma —nombre, descripcion, parametros— se conserva porque es la que usa
// el validador de acciones, no porque se le mande a nadie: ya no hay a quién.
const CAMPOS = new Map(toolSchemas().map(herramienta => [herramienta.nombre, Object.keys(herramienta.parametros.properties)]));

function ejecutar(ctx, acciones, requestId, confirmado = false, texto = '') {
  const chat = chatDe(ctx);
  const seguras = acciones.filter(peticion => ACTION_NAMES.includes(peticion.action));
  if (!seguras.length) { decir(chat, 'app', 'Eso no es algo que esta app sepa hacer.'); ctx.render(); return; }
  let resultado;
  try { resultado = runActions(ctx.state, seguras, { requestId, confirmed: confirmado }); }
  catch (error) { chat.pendiente = null; decir(chat, 'app', `No pude hacerlo: ${error.message}`); ctx.render(); return; }

  if (!resultado.ok && resultado.needsConfirmation) {
    // Lo sensible se enseña entero y en español antes de tocar nada. El mismo
    // requestId viaja con lo pendiente: es lo que impide que confirmar dos
    // veces registre la compra dos veces.
    chat.pendiente = { tipo: 'confirmar', acciones: seguras, requestId, texto, preview: resultado.preview || [], alcance: resultado.alcance || null };
    ctx.render();
    return;
  }
  const duda = resultado.questions?.[0];
  if (!resultado.ok && (duda || resultado.question)) {
    chat.pendiente = {
      tipo: 'pregunta', acciones: seguras, requestId, texto,
      pregunta: duda?.pregunta || resultado.question,
      // Sin campo no hay forma de reintentar sola la respuesta, así que las
      // opciones se enseñan como texto y no como botones que no harían nada.
      campo: duda?.campo || resultado.campo || null,
      opciones: duda?.opciones || resultado.options || []
    };
    ctx.render();
    return;
  }
  if (!resultado.ok) {
    chat.pendiente = null;
    decir(chat, 'app', (resultado.errors || []).join(' ') || resultado.summary || 'No pude hacerlo.');
    ctx.render();
    return;
  }

  chat.pendiente = null;
  if (resultado.repeated) { decir(chat, 'app', 'Eso ya estaba hecho: no lo repetí.'); ctx.render(); return; }
  const mensaje = decir(chat, 'app', resumenLegible(seguras, resultado), { resumen: resultado.summary });
  // Deshacer devuelve el estado entero a como estaba, así que solo se ofrece
  // sobre el último cambio: un botón viejo se llevaría por delante lo que se
  // hizo después.
  chat.deshacer = resultado.undo ? { estado: resultado.undo, mensaje: mensaje.id, resumen: resultado.summary } : null;
  if (seguras.every(peticion => isQuery(peticion.action))) ctx.render();
  else ctx.commit(resultado.summary);
}

// El asistente es una comodidad, no la puerta de entrada: todo lo que hace se
// puede hacer a mano. Cuando no entiende, lo que toca no es disculparse, es
// llevar a la pantalla donde eso se escribe en tres toques.
function sugerirFormulario(llano, state) {
  if (/\bcompr|\bqueda|\bconsum|\brevis/.test(llano)) return { etiqueta: 'Preparar la compra', accion: 'navigate', datos: { page: 'compra' } };
  if (/\bno\s+(?:puede|come|cena|almuerza|desayuna)\b|\bpersona\b/.test(llano)) return { etiqueta: 'Editar una persona', accion: 'navigate', datos: { page: 'familia' } };
  // Una rutina necesita una preparación escrita; sin ninguna no hay nada que
  // repetir, así que ahí se manda a crearla primero. Con preparaciones ya
  // guardadas, el sitio correcto es el formulario de la rutina.
  if (/\blunes|\bmartes|\bmiercoles|\bjueves|\bviernes|\bsabado|\bdomingo|\brutina/.test(llano)) {
    return state.recipes.length
      ? { etiqueta: 'Ponerlo en el calendario', accion: 'open-routine', datos: { goto: 'mes' } }
      : { etiqueta: 'Crear una preparación', accion: 'open-recipe' };
  }
  if (/\bcanasta|\bhabitual|\btodos\s+los\s+meses/.test(llano)) return { etiqueta: 'Abrir mis productos habituales', accion: 'open-basket', datos: { goto: 'canasta' } };
  return { etiqueta: 'Registrar un alimento', accion: 'open-product' };
}

// La app no habla con ningún servidor: lo que hay es este
// intérprete, que reconoce formas de frase y no «cualquier cosa». Decirlo con
// todas las letras vale más que aparentar: quien sabe qué formas hay las usa, y
// quien no, acaba enfadado con una app que parecía entenderlo todo.
function responderSinEntender(ctx, texto) {
  const chat = chatDe(ctx);
  const llano = plano(texto);
  decir(chat, 'app', [
    'No entendí esa frase. Leo lo que escribes en este mismo teléfono, sin mandarlo a ningún sitio,',
    'y por eso reconozco formas concretas de decir las cosas, no cualquier frase. Estas sí las entiendo:',
    '«compré 2 lb de arroz», «quedan 3 latas de atún», «agrega 5 lb de arroz solo este mes»,',
    '«desde ahora compramos 4 lb de arroz todos los meses», «todos los viernes cenamos fuera»,',
    '«copia la rutina de septiembre para octubre», «Sofía no puede comer maní», «qué falta comprar», «qué se cocina hoy».',
    'Y todo esto se puede hacer también a mano, en su pantalla.'
  ].join(' '), { acciones: [{ etiqueta: 'Escribir varios productos de corrido', accion: 'open-bulk' }, sugerirFormulario(llano, ctx.state)] });
  ctx.render();
}

function enviar(ctx, texto, requestId) {
  const chat = chatDe(ctx);
  const leido = interpretar(texto);
  if (leido) {
    if (leido.duda) {
      chat.pendiente = { tipo: 'pregunta', acciones: leido.acciones, requestId, texto, pregunta: leido.duda.pregunta, campo: leido.duda.campo, opciones: leido.duda.opciones };
      ctx.render();
      return;
    }
    ejecutar(ctx, leido.acciones, requestId, false, texto);
    return;
  }
  // No hay ningún sitio al que preguntar, y es a propósito: la app entiende lo
  // que entiende, aquí dentro, y lo que no lo dice en vez de mandarlo fuera.
  responderSinEntender(ctx, texto);
}

/* ── Dibujo ────────────────────────────────────────────────────────────── */

const EJEMPLOS = [
  'Compré 2 lb de arroz y 3 latas de atún',
  'Quedan 4 latas de atún y media libra de queso',
  'Agrega 4 lb de arroz solo este mes',
  'Desde ahora compramos 4 lb de arroz todos los meses',
  'Todos los viernes cenamos fuera',
  '¿Qué falta comprar?'
];
const atributos = datos => Object.entries(datos || {}).map(([clave, valor]) => `data-${esc(clave)}="${esc(valor)}"`).join(' ');

function dibujarMensaje(chat, mensaje, orden) {
  const botones = (mensaje.acciones || []).map(accion => button(esc(accion.etiqueta), accion.accion, 'btn-secondary btn-small', atributos(accion.datos))).join('');
  const deshacer = chat.deshacer?.mensaje === mensaje.id ? button('↺ Deshacer', 'chat-deshacer', 'btn-quiet btn-small') : '';
  return `<div class="chat-fila ${mensaje.quien === 'persona' ? 'mia' : 'suya'}" style="order:${orden}">
    <p class="chat-burbuja">${esc(mensaje.texto)}</p>
    ${botones || deshacer ? `<div class="chat-botones">${botones}${deshacer}</div>` : ''}
  </div>`;
}

function dibujarPendiente(pendiente) {
  if (!pendiente) return '';
  if (pendiente.tipo === 'confirmar') {
    // «Entendí lo siguiente» y no «¿lo hago?». La diferencia no es de cortesía:
    // entre lo que alguien dice y lo que la app entendió hay un paso que nadie
    // ve, y esta pantalla existe para enseñarlo. Lo que hay que revisar antes de
    // decir que sí no es si quieres hacerlo, es si eso es lo que dijiste.
    const cuantas = (pendiente.preview || []).length;
    return `<div class="chat-aparte chat-confirma">
      <p class="chat-titulin">Entendí lo siguiente${cuantas > 1 ? ` · ${cuantas} cosas` : ''}</p>
      ${dibujarAlcance(pendiente.alcance)}
      <ul class="chat-previa">${(pendiente.preview || []).map(linea => `<li>${esc(linea)}</li>`).join('')}</ul>
      <div class="chat-botones">${button('Confirmar', 'chat-confirmar', 'btn-primary btn-small')}${button('Corregir', 'chat-corregir', 'btn-secondary btn-small')}${button('Cancelar', 'chat-cancelar', 'btn-quiet btn-small')}</div></div>`;
  }
  const opciones = pendiente.opciones || [];
  // Una opción sirve para contestar si rellena un campo o si trae su propia
  // acción; si no, es solo información y se enseña como texto.
  const elegibles = opciones.length && (pendiente.campo || opciones.some(opcion => opcion.acciones));
  return `<div class="chat-aparte chat-duda">
    <p class="chat-titulin">${esc(pendiente.pregunta || '¿Cuál de estos?')}</p>
    ${elegibles
      ? `<div class="chat-botones">${opciones.map((opcion, indice) => button(esc(opcion.nombre ?? opcion.id), 'chat-opcion', 'btn-secondary btn-small', `data-indice="${indice}" data-id="${esc(opcion.id)}" data-nombre="${esc(opcion.nombre ?? opcion.id)}"`)).join('')}${button('Cancelar', 'chat-cancelar', 'btn-quiet btn-small')}</div>`
      : `${opciones.length ? `<p class="chat-nota">${esc(opciones.map(opcion => opcion.nombre ?? opcion.id).join(', '))}</p>` : ''}<div class="chat-botones">${button('Entendido', 'chat-cancelar', 'btn-secondary btn-small')}</div>`}
  </div>`;
}

// «Solo el jueves 16», «Solo en octubre», «Desde ahora, todos los meses», y las
// fechas concretas cuando las hay. Es la primera línea que se lee antes de
// confirmar: sin ella, «todos los viernes» no dice si son cuatro días o
// cuarenta.
function dibujarAlcance(alcance) {
  if (!alcance || alcance.tipo === 'ninguno' || !alcance.texto) return '';
  const dias = (alcance.fechas || []).map(fecha => Number(fecha.slice(8, 10)));
  const detalle = dias.length
    ? ` · ${dias.length} día(s): ${dias.slice(0, 8).join(', ')}${dias.length > 8 ? ` y ${dias.length - 8} más` : ''}`
    : '';
  // `chat-nota` es la clase que ya existe para una línea secundaria; la segunda
  // queda ahí para poder distinguirla después sin tener que tocar este archivo.
  return `<p class="chat-nota chat-alcance ${esc(alcance.tipo)}">${esc(alcance.texto)}${esc(detalle)}</p>`;
}

function dibujarEstado(chat) {
  const partes = [];
  if (chat.enviando) {
    partes.push(`<div class="chat-aparte chat-estado pensando"><span class="chat-puntos" aria-hidden="true"><i></i><i></i><i></i></span><span>Pensando…</span></div>`);
  }
  // La pista es para lo que quedó a medias: se dice, pero sin el recuadro rojo
  // de un error, porque el texto sí llegó y sí sirve.
  if (chat.pista) partes.push(`<p class="chat-pista-suave">${esc(chat.pista)}</p>`);
  if (chat.error) partes.push(`<div class="chat-aviso">${notice(esc(chat.errorTitulo || 'No se pudo enviar'), esc(chat.error), 'error')}</div>`);
  return partes.join('');
}

export function renderChat(ctx) {
  const chat = chatDe(ctx);
  const mensajes = chat.mensajes.map((mensaje, indice) => dibujarMensaje(chat, mensaje, -indice)).join('');
  const vacio = `<div class="chat-vacio" style="order:1">
    <p>Escribe lo que pasó en la cocina y yo lo anoto. Antes de tocar nada te enseño qué entendí y si el cambio es para un día, para el mes o desde ahora. Nada de esto hace falta: todo está también en sus pantallas.</p>
    <div class="chat-chips">${EJEMPLOS.map(frase => `<button type="button" class="chat-chip" data-action="chat-sugerencia" data-texto="${esc(frase)}">${esc(frase)}</button>`).join('')}</div>
  </div>`;
  // El pie va con el orden más bajo para quedar siempre debajo del último
  // mensaje, sin importar cuántos haya.
  const pie = `<div class="chat-pie" style="order:-9999">${dibujarPendiente(chat.pendiente)}${dibujarEstado(chat)}${panelDeVoz(ctx, 'chat')}</div>`;
  // El botón abre el panel de dictado; no abre el micrófono. Esa distinción es
  // la que evita que un fallo del reconocimiento se lleve la aplicación por
  // delante: el primer toque siempre lleva a un cuadro donde se puede escribir.
  const dictado = botonDeVoz(ctx, 'chat', { etiqueta: 'Dictar o escribir el mensaje' });
  return `<div class="chat-scrim" data-overlay data-action="chat-cerrar" aria-hidden="true"></div>
  <aside class="chat-panel" role="dialog" aria-modal="true" aria-label="Asistente de la casa">
    <header class="chat-head">
      <div><strong>Asistente</strong><span>Todo pasa en este teléfono: reconozco formas de frase, no cualquier cosa, y antes de cambiar nada te enseño qué entendí y hasta dónde llega.</span></div>
      <div class="chat-head-botones">${chat.mensajes.length ? button('Limpiar', 'chat-limpiar', 'btn-quiet btn-small') : ''}<button type="button" class="icon-btn" data-action="chat-cerrar" aria-label="Cerrar el asistente">×</button></div>
    </header>
    <div class="chat-mensajes" role="log" aria-live="polite">${pie}${mensajes}${chat.mensajes.length ? '' : vacio}</div>
    <form class="chat-escribe" data-form="chat" autocomplete="off">
      <label class="chat-oculto" for="chat-texto">Escribe tu mensaje</label>
      <input class="chat-campo" id="chat-texto" name="mensaje" type="text" value="${esc(chat.borrador || '')}"
        placeholder="Ej. compré 2 lb de arroz" enterkeyhint="send" autocomplete="off" autocapitalize="sentences">
      ${dictado}
      <button type="submit" class="chat-icono chat-enviar" aria-label="Enviar el mensaje">↑</button>
    </form>
    ${capacidad('dictar').ok ? '' : `<p class="chat-pista">Este aparato no trae dictado dentro de la aplicación. Toca el campo y usa el 🎤 de tu teclado: escribe aquí igual.</p>`}
  </aside>`;
}

/* ── Acciones del panel ────────────────────────────────────────────────── */

// El aviso del motor del navegador. Se dice entero: «pasa por sus servidores»
// es exactamente lo que pasa, y quien lo lee tiene que poder decidir si prefiere
// escribir. En la aplicación de Android no aparece nunca.

export const CHAT_ACTIONS = {
  // Cerrar el panel cierra también el micrófono: dejarlo abierto detrás de una
  // pantalla cerrada es lo último que debe hacer una app con el micrófono.
  'chat-cerrar': (el, ctx) => { guardarBorrador(ctx); callarMicrofono(ctx); ctx.closeModal?.(); },
  'chat-limpiar': (el, ctx) => {
    const chat = chatDe(ctx);
    guardarBorrador(ctx);
    chat.mensajes = []; chat.pendiente = null; chat.deshacer = null; chat.error = ''; chat.errorTitulo = ''; chat.pista = '';
    ctx.render();
  },
  'chat-sugerencia': (el, ctx) => { chatDe(ctx).borrador = el.dataset.texto || ''; ctx.render(); },
  'chat-confirmar': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'confirmar') return;
    guardarBorrador(ctx);
    chat.pendiente = null;
    ejecutar(ctx, pendiente.acciones, pendiente.requestId, true, pendiente.texto || '');
  },
  // Corregir no es cancelar. Cancelar es «no quería esto»; corregir es «casi, pero
  // no». Devuelve la frase al campo tal como se dijo, para cambiarle lo que esté
  // mal en vez de tener que dictarla entera otra vez. Quien dictó veinte palabras
  // y vio una fecha equivocada no quiere volver a decir las veinte.
  'chat-corregir': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'confirmar') return;
    chat.pendiente = null;
    chat.borrador = pendiente.texto || '';
    decir(chat, 'app', pendiente.texto
      ? 'No cambié nada. Te devolví la frase abajo: arréglale lo que haga falta y mándala otra vez.'
      : 'No cambié nada. Escríbelo de nuevo con la corrección.');
    ctx.render();
  },
  'chat-cancelar': (el, ctx) => {
    const chat = chatDe(ctx);
    if (!chat.pendiente) return;
    guardarBorrador(ctx);
    const era = chat.pendiente.tipo;
    chat.pendiente = null;
    if (era === 'confirmar') decir(chat, 'app', 'Lo dejé como estaba: no cambié nada.');
    ctx.render();
  },
  'chat-opcion': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'pregunta') return;
    const elegida = pendiente.opciones?.[Number(el.dataset.indice)];
    if (!pendiente.campo && !elegida?.acciones) return;
    guardarBorrador(ctx);
    const campo = pendiente.campo, valor = el.dataset.id;
    // Hay dos clases de respuesta. Una rellena un campo que faltaba. La otra
    // elige entre dos acciones distintas, que es lo que pasa con el alcance:
    // «solo este mes» y «desde ahora» no son dos valores de lo mismo, son dos
    // cosas diferentes, y por eso cada opción trae la suya escrita.
    const acciones = elegida?.acciones
      ? elegida.acciones
      : pendiente.acciones.map(peticion => (CAMPOS.get(peticion.action) || []).includes(campo)
        ? { ...peticion, arguments: { ...peticion.arguments, [campo]: valor } }
        : peticion);
    chat.pendiente = null;
    decir(chat, 'persona', el.dataset.nombre || valor);
    // Se reutiliza el mismo requestId, pero sin dar por confirmado: una acción
    // sensible sigue teniendo que enseñarse antes de ejecutarse.
    ejecutar(ctx, acciones, pendiente.requestId, false, pendiente.texto || '');
  },
  'chat-deshacer': (el, ctx) => {
    const chat = chatDe(ctx);
    if (!chat.deshacer) return;
    guardarBorrador(ctx);
    try { undoTo(ctx.state, chat.deshacer.estado); }
    catch (error) { chat.error = error.message; ctx.render(); return; }
    chat.deshacer = null;
    chat.pendiente = null;
    decir(chat, 'app', 'Listo, lo dejé como estaba antes.');
    ctx.commit('Se deshizo el último cambio.');
  }};

// Cierra el micrófono si estaba abierto. Se llama al cerrar el panel del
// asistente: dejar el micrófono escuchando detrás de una pantalla cerrada es lo
// último que debe hacer una aplicación con el micrófono de nadie.
//
// Se cancela, no se para. `pararDictado` cierra el micrófono pero deja puestos
// los oyentes del motor, y dos dictados seguidos los iban acumulando: al
// tercero, cada palabra llegaba tres veces. `cancelarDictado` los retira.
function callarMicrofono(ctx) {
  const voz = ctx.ui?.voz;
  if (!voz || voz.destino !== 'chat') return;
  voz.sesion += 1;
  voz.destino = '';
  voz.estado = 'quieto';
  Promise.resolve(cancelarDictado()).catch(() => { /* Cerrar el micrófono no puede fallar hacia fuera. */ });
}

/* ── Envío del formulario ──────────────────────────────────────────────── */

const AFIRMA = /^(?:si|sip|claro|dale|ok|okey|correcto|confirmo|confirma|confirmalo|hazlo|adelante|exacto|asi es|eso es)\b/;
const NIEGA = /^(?:no|nop|cancela|cancelar|mejor no|dejalo|olvidalo|para)\b/;

export const CHAT_FORMS = {
  chat: (form, data, ctx) => {
    const chat = chatDe(ctx);
    const texto = String(valorDe(data, 'mensaje', form) ?? '').trim();
    // Enviar cierra el micrófono: lo que llegara tarde volvería a llenar un
    // campo que la persona acaba de vaciar al enviar.
    callarMicrofono(ctx);
    chat.error = '';
    chat.errorTitulo = '';
    chat.pista = '';
    chat.borrador = '';
    if (!texto) { ctx.render(); return; }
    const llano = plano(texto);
    // Quien está mirando una confirmación y escribe «sí» está contestando a la
    // confirmación, no empezando otra cosa.
    if (chat.pendiente?.tipo === 'confirmar' && (AFIRMA.test(llano) || NIEGA.test(llano))) {
      const pendiente = chat.pendiente;
      decir(chat, 'persona', texto);
      chat.pendiente = null;
      if (NIEGA.test(llano)) { decir(chat, 'app', 'Lo dejé como estaba: no cambié nada.'); ctx.render(); return; }
      ejecutar(ctx, pendiente.acciones, pendiente.requestId, true, pendiente.texto || '');
      return;
    }
    // Un mensaje nuevo reemplaza la duda anterior: dejarla viva confundiría
    // qué se está confirmando.
    chat.pendiente = null;
    decir(chat, 'persona', texto);
    return enviar(ctx, texto, nuevoIdentificador());
  }
};
