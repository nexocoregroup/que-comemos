// El OCR del teléfono devuelve la factura como un chorro de texto: las columnas
// desalineadas, el precio pegado al nombre y, entre medio, todo lo que el
// supermercado imprime y a esta app no le sirve —RNC, NCF, caja, ITBIS, el
// «gracias por su compra»—. Este módulo es el eslabón entre ese texto y
// `revisarFactura`: recorta lo que estructuralmente no puede ser una compra y
// entrega las líneas con la forma exacta que ese revisor espera.
//
// Regla de la casa, la misma de text-parse.js: ni se inventa ni se descarta.
// Sin cantidad legible, `null`; sin unidad legible, `null`; y el nombre se
// entrega tal como se imprimió, sin corregirle al OCR las letras que confundió
// —un «HUEV0S» arreglado a mano es una lectura que nadie verificó—. Lo que baja
// es la confianza, que es la señal con la que `invoices.js` decide si esa línea
// se aprueba sola o se la enseña al usuario.
//
// Y lo que se descarta es solo lo que no tiene forma de línea de producto. Que
// una funda plástica no sea comida es un juicio del usuario, no nuestro:
// `invoices.js` ya tiene la decisión «no-alimentario» para eso.

import { UNITS, normalizeName, parseLine } from './text-parse.js';

const redondear = (valor, decimales = 2) => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};

// El tique imprime en mayúsculas y sin tildes, y el OCR devuelve lo que ve. Se
// compara siempre en plano; lo que se guarda, en cambio, se guarda como vino.
const plano = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Las columnas del tique son espacios de relleno: colapsarlos no pierde nada y
// deja una línea que el usuario puede leer al revisar.
const enUnaLinea = texto => String(texto ?? '').replace(/\s+/g, ' ').trim();
const clave = texto => plano(enUnaLinea(texto));

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

// El precio no se usa —esta app no lleva dinero—, pero es lo que dice dónde
// acaba el nombre del producto, así que hay que encontrarlo igual.
//
// Un importe impreso siempre trae centavos («120.00»), y cuando no los trae va
// marcado con la moneda («RD$ 90»). Exigir una de las dos cosas es justo lo que
// evita confundir el RNC —nueve dígitos seguidos— o el «CAJA 03» con dinero.
const PRECIO_CON_MONEDA = /(?:^|\s)(?:rd\s*)?\$\s*(-?\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*$/i;
const PRECIO_CON_CENTAVOS = /(?:^|\s)(-?\d+(?:,\d{3})*\.\d{2})\s*$/;

export function quitarPrecio(linea) {
  const texto = enUnaLinea(linea);
  const hallazgo = texto.match(PRECIO_CON_MONEDA) || texto.match(PRECIO_CON_CENTAVOS);
  if (!hallazgo) return { texto, precio: null };
  const precio = Number(hallazgo[1].replace(/,/g, ''));
  if (!Number.isFinite(precio)) return { texto, precio: null };
  return { texto: texto.slice(0, hallazgo.index).trim(), precio };
}

// ---------------------------------------------------------------------------
// Qué línea es un producto
// ---------------------------------------------------------------------------

// Lo que el supermercado imprime alrededor de la compra. Se mira la línea
// entera en plano, no solo su principio: el tique escribe «CAJA 03 CAJERO:
// MARIA» y «ITBIS 18% 189.81» en una sola fila.
const RUIDO_DE_TICKET = [
  /\b(rnc|ncf|nif|dgii|cedula)\b/,
  /\b(factura|comprobante|fiscal|consumidor final)\b/,
  /\b(fecha|hora)\b/,
  /\bcajer[oa]s?\b|\bcaja\s*(?:no\.?|n[o°º]|#)?\s*\d/,
  /\b(?:sub\s*-?\s*)?total(?:es)?\b/,
  /\b(itbis|itbs|iva|impuestos?|exento|gravado)\b/,
  /\b(efectivo|tarjeta|credito|debito|visa|mastercard|transferencia|cheque)\b/,
  /\b(cambio|vuelto|devuelta|pago|recibido)\b/,
  /\b(descuentos?|dcto|ahorros?|ahorraste|promocion)\b/,
  /\bpropinas?\b/,
  /\b(gracias|vuelva|conserve|garantia|devoluciones)\b/,
  /\b(cliente|telefono|tel|direccion|sucursal)\b/,
  /\b(av|ave|avenida|calle|carretera|autopista|esq)\b/,
  /\b(cantidad|descripcion|precio|importe|unitario|articulos|items?)\b/
];

// Tres condiciones estructurales, ninguna de ellas una opinión sobre qué es
// comida: que quede letra después de quitar el importe, que haya importe —el
// encabezado, la dirección y el «gracias» no lo tienen— y que ese importe no
// sea negativo, porque un descuento o una devolución no se compraron.
export function esLineaDeProducto(linea) {
  const texto = enUnaLinea(linea);
  if (!texto) return false;
  // Una fila de solo guiones o solo números no nombra nada.
  if (!/\p{L}/u.test(texto)) return false;
  const plana = clave(texto);
  if (RUIDO_DE_TICKET.some(patron => patron.test(plana))) return false;
  const { texto: sinPrecio, precio } = quitarPrecio(texto);
  if (precio === null || precio < 0) return false;
  return /\p{L}\p{L}/u.test(sinPrecio);
}

// ---------------------------------------------------------------------------
// Fecha
// ---------------------------------------------------------------------------

const MESES = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12
};

const ISO = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
// El tique imprime «14 JUL 2026» en mayúsculas y el dictado escribe «14 de
// julio de 2026»: la misma forma con o sin las preposiciones.
const CON_MES_ESCRITO = /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+)?(\d{2,4})\b/gi;
const NUMERICA = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;

const dosCifras = numero => String(numero).padStart(2, '0');

// Ida y vuelta por Date, igual que en invoices.js: pedirle el 30 de febrero no
// falla, devuelve el 2 de marzo. Una fecha que no vuelve igual no es la que
// traía la factura.
function armar(anio, mes, dia) {
  const fecha = `${anio}-${dosCifras(mes)}-${dosCifras(dia)}`;
  const prueba = new Date(`${fecha}T12:00:00Z`);
  return Number.isFinite(prueba.getTime()) && prueba.toISOString().slice(0, 10) === fecha ? fecha : null;
}

// El año de dos cifras se completa en este siglo. Es una suposición —no hay
// nada en «14-07-26» que diga 2026 en vez de 1926—, así que descuenta confianza.
const anioCompleto = crudo => (crudo.length === 4 ? Number(crudo) : 2000 + Number(crudo));

const CONFIANZA_FECHA_CLARA = 1;
const CASTIGO_ANIO_CORTO = 0.1;
// En República Dominicana se escribe día/mes. Cuando el primer número es ≤ 12
// las dos lecturas son posibles y solo la costumbre local decide: se toma
// día/mes, que es lo que imprime el tique de aquí, pero no se cobra como
// certeza. Bajar a 0.6 la deja por debajo de «alta» en invoices.js sin fingir
// que no se leyó nada.
const CONFIANZA_FECHA_AMBIGUA = 0.6;

function candidatos(texto) {
  const lista = [];
  for (const [impresa, anio, mes, dia] of texto.matchAll(ISO)) {
    lista.push({ impresa, fecha: armar(Number(anio), Number(mes), Number(dia)), confianza: CONFIANZA_FECHA_CLARA, ambigua: false });
  }
  for (const [impresa, dia, mes, anio] of texto.matchAll(CON_MES_ESCRITO)) {
    const numero = MESES[plano(mes)];
    if (!numero) continue;
    // El mes escrito con letras no se presta a confusión: «14 JUL 2026» solo
    // se puede leer de una forma.
    const confianza = CONFIANZA_FECHA_CLARA - (anio.length === 4 ? 0 : CASTIGO_ANIO_CORTO);
    lista.push({ impresa, fecha: armar(anioCompleto(anio), numero, Number(dia)), confianza, ambigua: false });
  }
  for (const [impresa, dia, mes, anio] of texto.matchAll(NUMERICA)) {
    const ambigua = Number(dia) <= 12 && Number(mes) <= 12 && dia !== mes;
    const castigo = anio.length === 4 ? 0 : CASTIGO_ANIO_CORTO;
    lista.push({
      impresa,
      fecha: armar(anioCompleto(anio), Number(mes), Number(dia)),
      confianza: redondear((ambigua ? CONFIANZA_FECHA_AMBIGUA : CONFIANZA_FECHA_CLARA) - castigo),
      ambigua
    });
  }
  return lista;
}

// Se devuelve también la confianza porque una fecha ambigua no es una fecha
// mala: hay que guardarla y, a la vez, avisar de que puede leerse al revés.
// `buscarFecha` es esta misma pieza cuando solo interesa el día.
export function leerFecha(textoCrudo) {
  const texto = String(textoCrudo ?? '');
  // La línea que dice «Fecha:» manda sobre cualquier otro número con barras que
  // ande suelto en el tique.
  const marcadas = texto.split(/\r?\n/).filter(linea => /\bfecha\b/i.test(plano(linea))).join('\n');
  const encontrados = [...candidatos(marcadas), ...candidatos(texto)];
  const valido = encontrados.find(candidato => candidato.fecha);
  return valido || { impresa: null, fecha: null, confianza: 0, ambigua: false };
}

export const buscarFecha = textoCrudo => leerFecha(textoCrudo).fecha;

// ---------------------------------------------------------------------------
// Establecimiento
// ---------------------------------------------------------------------------

// Los grandes de aquí. Se comparan con límite de palabra para que «pola» no
// salga de «polar» ni «ole» de cualquier cosa.
const CADENAS = [
  'nacional', 'jumbo', 'la sirena', 'sirena', 'bravo', 'pola', 'ole',
  'plaza lama', 'lama', 'iberia', 'aprezio', 'multicentro'
];
const GENERICOS = ['supermercado', 'supermercados', 'hipermercado', 'super', 'mercado', 'colmado', 'market', 'minimarket'];
// El nombre del negocio va arriba del todo, antes del RNC y de la dirección.
// Más abajo ya es la compra.
const LINEAS_ENCABEZADO = 8;

const contiene = (plana, palabras) => palabras.some(palabra => new RegExp(`\\b${palabra}\\b`).test(plana));

// Devuelve la línea tal como se imprimió, no un nombre canónico: si el tique
// dice «SUPERMERCADO NACIONAL», eso es lo que el usuario va a reconocer al
// revisar. Inventarle un nombre bonito es inventar.
export function buscarEstablecimiento(textoCrudo, opciones = {}) {
  const extra = [...(opciones.cadenas || [])].map(plano).filter(Boolean);
  const cabecera = String(textoCrudo ?? '')
    .split(/\r?\n/)
    .map(enUnaLinea)
    .filter(Boolean)
    .slice(0, LINEAS_ENCABEZADO)
    .map(texto => ({ texto, plana: plano(texto), precio: quitarPrecio(texto).precio }));
  // Solo se mira lo que puede ser un rótulo: con importe ya es una compra, y
  // con «RNC» o «Av.» es el papeleo de alrededor.
  const posibles = cabecera.filter(fila => fila.precio === null && !RUIDO_DE_TICKET.some(patron => patron.test(fila.plana)) && /\p{L}\p{L}/u.test(fila.texto));
  const conocida = posibles.find(fila => contiene(fila.plana, [...CADENAS, ...extra]));
  if (conocida) return conocida.texto;
  const generica = posibles.find(fila => contiene(fila.plana, GENERICOS));
  if (generica) return generica.texto;
  // Última carta: el rótulo suele ir en mayúsculas y sin números. Si tampoco
  // eso aparece, se devuelve null en vez de escoger una línea cualquiera.
  const rotulo = posibles.find(fila => fila.texto === fila.texto.toUpperCase() && !/\d/.test(fila.texto));
  return rotulo ? rotulo.texto : null;
}

// ---------------------------------------------------------------------------
// Cantidades impresas
// ---------------------------------------------------------------------------

// «2 X SALAMI INDUV» son dos salamis. También se imprime «2X», «2 x» y «X2».
const CANTIDAD_DELANTERA = /^(?:(\d+(?:[.,]\d+)?)\s*[xX]|[xX]\s*(\d+(?:[.,]\d+)?))\s+/;

// Las abreviaturas de medida que caben pegadas al nombre en un tique. Todas son
// palabras que `parseLine` ya sabe leer —o que, si no las conoce, resuelve
// contando por unidades—, así que aquí solo hay que reconocerlas, no traducirlas.
const MEDIDAS = new Set([
  'lb', 'lbs', 'libra', 'libras',
  'u', 'ud', 'uds', 'und', 'unds', 'unid', 'unidad', 'unidades',
  'oz', 'onza', 'onzas',
  'kg', 'kgs', 'g', 'gr', 'grs', 'gramo', 'gramos',
  'lata', 'latas'
]);
const MEDIDA_FINAL = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,9})\.?$/;

function separarCantidadDelantera(texto) {
  const hallazgo = texto.match(CANTIDAD_DELANTERA);
  if (!hallazgo) return { cantidad: null, resto: texto };
  return { cantidad: hallazgo[1] || hallazgo[2], resto: texto.slice(hallazgo[0].length).trim() };
}

// «ARROZ SELECTO 5LB», «HUEVOS BLANCOS 12U», «ATUN CALVO 5OZ»: la medida va
// pegada al final del nombre, que es donde `parseLine` no la busca —al dictar
// se dice «5 libras de arroz», nunca «arroz 5 libras»—. Se recorta aquí y se le
// pasa por delante, que es como sabe leerla.
function separarMedidaPegada(texto) {
  const hallazgo = texto.match(MEDIDA_FINAL);
  if (!hallazgo || !MEDIDAS.has(plano(hallazgo[2]))) return { medida: null, resto: texto };
  return { medida: `${hallazgo[1]} ${hallazgo[2]}`, resto: texto.slice(0, hallazgo.index).trim() };
}

// ---------------------------------------------------------------------------
// Confianza
// ---------------------------------------------------------------------------

// La confianza no es un número puesto a ojo: sale de señales que se pueden
// comprobar en la propia línea, y los tramos están escogidos para encajar con
// los cortes de invoices.js (alta ≥ 0.75, media ≥ 0.5, por debajo «baja»).
//
//   0.50  de partida: la línea tiene forma de producto y trae su importe.
//   +0.15 si la factura imprimió un número de cantidad.
//   +0.15 si la factura imprimió también la unidad («5LB», «12U», «6 UND»).
//   +0.10 si el nombre es solo letras, sin dígitos ni símbolos sueltos.
//   −0.10 si parseLine tuvo que deducir algo (unidad implícita, kilos a libras).
//   −0.35 si el nombre trae basura de OCR: símbolos raros, o dígitos metidos
//         entre letras («HUEV0S») que no son una medida reconocible.
//   −0.30 si al nombre le quedan menos de cuatro letras útiles.
//
// Así una línea limpia con medida impresa llega a 0.90 y se aprueba de un
// vistazo; «2 X SALAMI INDUV 1LB» se queda en 0.55 y pasa por confirmación
// porque la unidad la pusimos nosotros; y una línea con letras comidas cae por
// debajo de 0.50, que en invoices.js es «lectura-mala» y nunca «incluir».
const CONFIANZA_BASE = 0.5;
const PREMIO_CANTIDAD = 0.15;
const PREMIO_UNIDAD = 0.15;
const PREMIO_NOMBRE_LIMPIO = 0.1;
const CASTIGO_DEDUCIDO = 0.1;
const CASTIGO_NOMBRE_SUCIO = 0.35;
const CASTIGO_NOMBRE_CORTO = 0.3;
const LETRAS_MINIMAS = 4;

const SIMBOLO_RARO = /[^\p{L}\p{N}\s.,&/'%°#+-]/u;
const SOLO_LETRAS = /^[\p{L}\s]+$/u;
const NUMERO_PEGADO = /^(\d+(?:[.,]\d+)?)([a-z]{1,9})$/;

// Un tique escribe «1LB» dentro del nombre y eso es formato, no error. Lo que
// delata al OCR es el dígito que se coló donde iba una letra —«HUEV0S»,
// «5ALAMI»—, y esos no forman número con medida.
function nombreSucio(nombre) {
  if (SIMBOLO_RARO.test(nombre)) return true;
  return enUnaLinea(nombre).split(' ').some(ficha => {
    const plana = plano(ficha).replace(/[^a-z0-9]/g, '');
    if (!/[a-z]/.test(plana) || !/\d/.test(plana)) return false;
    const medida = plana.match(NUMERO_PEGADO);
    return !(medida && MEDIDAS.has(medida[2]));
  });
}

// Se cuentan las letras después de normalizar porque es lo que verá
// `emparejar`: «5 OZ» no aporta nada con que buscar en el catálogo.
const letrasUtiles = nombre => normalizeName(nombre).replace(/[^a-z]/g, '').length;

function calcularConfianza(nombre, fila, cantidad, unidadImpresa) {
  let valor = CONFIANZA_BASE;
  if (cantidad !== null) valor += PREMIO_CANTIDAD;
  if (unidadImpresa) valor += PREMIO_UNIDAD;
  if (SOLO_LETRAS.test(nombre)) valor += PREMIO_NOMBRE_LIMPIO;
  if (!fila || fila.confidence !== 'alta') valor -= CASTIGO_DEDUCIDO;
  if (nombreSucio(nombre)) valor -= CASTIGO_NOMBRE_SUCIO;
  if (letrasUtiles(nombre) < LETRAS_MINIMAS) valor -= CASTIGO_NOMBRE_CORTO;
  return redondear(Math.min(1, Math.max(0, valor)));
}

// ---------------------------------------------------------------------------
// Una línea de producto
// ---------------------------------------------------------------------------

function leerLinea(lineaCruda) {
  const textoOriginal = enUnaLinea(lineaCruda);
  const { texto } = quitarPrecio(textoOriginal);
  const delantera = separarCantidadDelantera(texto);
  // La cantidad de delante manda sobre la de dentro: en «2 X SALAMI INDUV 1LB»
  // el 2 es lo que se llevó la casa y «1LB» es el tamaño del salami, parte de
  // cómo se llama el producto. Multiplicarlos daría dos libras de un salami que
  // pesa una, y quedarse con el 1 escondería una de las dos compras. Por eso,
  // cuando hay cantidad delantera, la medida pegada ni se toca.
  const pegada = delantera.cantidad === null ? separarMedidaPegada(delantera.resto) : { medida: null, resto: delantera.resto };
  const nombreSugerido = pegada.resto.trim();
  // Lo que queda del nombre se lee con parseLine, con la cantidad puesta por
  // delante, que es el orden en que ese módulo sabe leerla. Se aprovecha su
  // tabla de sinónimos («und» es unidad, «oz» son libras) en vez de repetirla.
  const fragmento = [delantera.cantidad ?? pegada.medida, nombreSugerido].filter(Boolean).join(' ');
  const fila = parseLine(fragmento);
  const cantidad = fila && Number.isFinite(fila.quantity) && fila.quantity > 0 ? fila.quantity : null;
  // Una unidad sin cantidad no dice nada: «FUNDA PLASTICA» no es un paquete de
  // nada, es como se llama el producto. Se guarda null antes que una unidad que
  // el usuario no escribió.
  const unidad = cantidad !== null && fila && UNITS.includes(fila.unit) ? fila.unit : null;
  return {
    textoOriginal,
    nombreSugerido: nombreSugerido || null,
    cantidad,
    unidad,
    confianza: calcularConfianza(nombreSugerido, fila, cantidad, pegada.medida !== null && unidad !== null)
  };
}

// ---------------------------------------------------------------------------
// El tique entero
// ---------------------------------------------------------------------------

export function leerTicket(textoCrudo, opciones = {}) {
  const crudo = String(textoCrudo ?? '');
  const fecha = leerFecha(crudo);
  const establecimiento = buscarEstablecimiento(crudo, opciones);
  const lineas = [];
  const descartadas = [];
  for (const cruda of crudo.split(/\r?\n/)) {
    const texto = enUnaLinea(cruda);
    // El hueco entre bloques no es una línea descartada, es espacio: meterlo en
    // la lista solo llenaría de vacíos la pantalla de lo que no se leyó.
    if (!texto) continue;
    if (esLineaDeProducto(texto)) lineas.push(leerLinea(texto));
    else descartadas.push(texto);
  }
  const notas = [];
  if (!lineas.length) notas.push('Esto no parece una factura de supermercado: no se encontró ninguna línea con nombre y precio. Repite la foto con mejor luz o escribe la compra a mano.');
  if (fecha.ambigua) notas.push(`La fecha «${fecha.impresa}» puede leerse de dos maneras: se tomó día/mes (${fecha.fecha}), como se imprime en República Dominicana. Confírmala.`);
  if (lineas.length && !fecha.fecha) notas.push('No se encontró la fecha: escríbela tú o esta factura no contará para el hábito del mes.');
  return {
    fecha: fecha.fecha,
    establecimiento,
    lineas,
    descartadas,
    aviso: notas.join(' ') || null
  };
}
