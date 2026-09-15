// Las facturas viejas enseñan qué compra la casa, no qué hay hoy en la nevera.
// Por eso aquí no se toca ninguna existencia: este módulo solo cuenta —cruza
// nombres impresos contra el catálogo, mide repeticiones entre meses— y deja
// propuestas que el usuario aprueba o descarta. Nada de lo que devuelve se
// aplica solo.
//
// Todo llega por parámetro (el catálogo incluido) y nada sale por referencia
// compartida: sin DOM, sin almacenamiento y sin depender de model.js, de modo
// que la misma cuenta sirve para la app, para una prueba y para un respaldo
// importado.

// Repetidas a propósito en vez de importarlas: atar este módulo a model.js lo
// obligaría a cargar el estado de la casa para hacer una cuenta que no lo
// necesita.
export const UNITS = ['unidad', 'lb', 'taza', 'lata', 'paquete', 'rueda', 'rebanada'];

// Lo que se puede decidir sobre una línea impresa. La máquina solo propone
// 'incluir', 'unir', 'nuevo' y 'lectura-mala'; 'ocasional', 'no-alimentario' e
// 'ignorar' son juicios sobre la casa de quien compra y nadie los adivina por
// él: se ofrecen en la lista para que los escoja a mano.
export const DECISIONES = ['incluir', 'ocasional', 'no-alimentario', 'ignorar', 'unir', 'nuevo', 'lectura-mala'];

const UMBRAL = 0.55;
// Dos productos a menos de esto de distancia no son una coincidencia, son una
// pregunta: se devuelve null y que elija el usuario.
const MARGEN = 0.05;
const PREFIJO_MINIMO = 3;
const PARECIDO_MINIMO = 4;
const LECTURA_ALTA = 0.75;
const LECTURA_MEDIA = 0.5;
// Con la lectura clara y el cruce flojo todavía hay algo que confirmar; solo
// las dos cosas firmes se dan por buenas sin preguntar.
const MATCH_SOLIDO = 0.8;

// Ruido de tique: unidades y códigos que el supermercado imprime pegados al
// nombre. Solo cuenta como ruido lo que además no casó con nada del catálogo,
// así que un producto que de verdad se llame «Lata de habichuelas» no pierde
// su primera palabra: esa sí encuentra pareja.
const RUIDO = new Set([
  ...UNITS, ...UNITS.map(unidad => `${unidad}s`), 'libra', 'libras',
  'und', 'un', 'uds', 'ud', 'u', 'pza', 'pzs', 'pz', 'kg', 'k', 'g', 'gr', 'grs',
  'ml', 'lt', 'l', 'oz', 'lbs', 'cu', 'ea', 'x', 'c', 'pqt', 'pq', 'ct'
]);

const redondear = (valor, decimales = 3) => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};

// El tique imprime en mayúsculas, sin tildes y con abreviaturas cortadas por
// puntos. La ñ se colapsa en n por la misma razón: media isla imprime «PINA»
// y esa piña es la misma piña del catálogo.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Distancia de edición a mano, con una sola fila viva: el catálogo entero se
// recorre por cada línea de cada factura, así que no hay por qué guardar la
// matriz completa.
function distancia(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previo = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previo;
    }
  }
  return fila[b.length];
}

// Un carácter distinto en una palabra de tres letras ya es otra cosa —«sal» y
// «sol»—, así que el parecido solo opina sobre textos más largos. Debajo de
// eso manda la coincidencia exacta o el prefijo, que no adivinan letras.
function porParecido(texto, candidato) {
  if (Math.min(texto.length, candidato.length) < PARECIDO_MINIMO) return null;
  const similitud = 1 - distancia(texto, candidato) / Math.max(texto.length, candidato.length);
  return similitud > 0 ? { puntuacion: redondear(similitud), motivo: 'parecido' } : null;
}

const esRuido = palabra => RUIDO.has(palabra) || /^\d+$/.test(palabra);

// La factura abrevia: «PLAT MAD» es plátano maduro. Se miran tres cosas a la
// vez porque cada una sola miente: cuánto del texto impreso queda explicado,
// cuánto del nombre del catálogo queda cubierto, y qué tan larga es la
// abreviatura respecto de la palabra que dice ser. «PLAT» explica todo el
// texto y es prefijo firme, pero cubre media ficha de dos productos distintos
// —maduro y verde—, y por eso no gana ninguno.
//
// La cuarta es cuántas palabras se corroboran: una abreviatura suelta deja
// tanta duda como letras le faltan —«SAL» empieza igual que Salami—, pero dos
// que caen en el mismo producto se sostienen entre ellas y reparten esa duda.
function porPrefijos(palabras, palabrasCandidato) {
  const libres = palabrasCandidato.map(() => true);
  let emparejadas = 0, utiles = 0, solidez = 0;
  for (const palabra of palabras) {
    const indice = palabrasCandidato.findIndex((candidata, i) => libres[i] && candidata.startsWith(palabra) && (palabra.length >= PREFIJO_MINIMO || palabra === candidata));
    if (indice < 0) {
      if (!esRuido(palabra)) utiles++;
      continue;
    }
    libres[indice] = false;
    emparejadas++;
    utiles++;
    solidez += palabra.length / palabrasCandidato[indice].length;
  }
  if (!emparejadas) return null;
  const firmeza = 1 - (1 - solidez / emparejadas) / emparejadas;
  const puntuacion = (emparejadas / utiles) * (emparejadas / palabrasCandidato.length) * firmeza;
  return { puntuacion: redondear(puntuacion), motivo: 'prefijo' };
}

const mejorDe = (a, b) => (!a || (b && b.puntuacion > a.puntuacion) ? b : a);

// El motivo cuenta cómo se llegó, no solo que se llegó: el usuario que revisa
// necesita saber si el nombre coincidía entero o si lo dedujimos de tres
// letras, porque una cosa se aprueba de un vistazo y la otra se mira dos veces.
function contra(texto, palabras, candidato, esAlias) {
  const normal = normalizar(candidato);
  if (!normal) return null;
  if (normal === texto) return { puntuacion: 1, motivo: esAlias ? 'alias' : 'exacto' };
  return mejorDe(porPrefijos(palabras, normal.split(' ')), porParecido(texto, normal));
}

function puntuarProducto(texto, palabras, producto) {
  const alternativas = [{ valor: producto.name, alias: false }, ...(producto.aliases || []).map(valor => ({ valor, alias: true }))];
  return alternativas.reduce((mejor, item) => mejorDe(mejor, contra(texto, palabras, item.valor, item.alias)), null);
}

// Una fila por producto —su mejor lectura, venga del nombre o de un alias—,
// ordenadas. Se construye sobre copias: el catálogo que entra sale intacto.
function ordenar(textoImpreso, productos) {
  const texto = normalizar(textoImpreso);
  if (!texto) return [];
  const palabras = texto.split(' ');
  return (productos || [])
    .filter(producto => producto && producto.id)
    .map(producto => {
      const puntuado = puntuarProducto(texto, palabras, producto);
      return puntuado && { productId: producto.id, nombre: producto.name, puntuacion: puntuado.puntuacion, motivo: puntuado.motivo };
    })
    .filter(fila => fila && fila.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// Prefiere no emparejar a emparejar mal: por debajo del umbral, y cuando dos
// productos distintos quedan igual de cerca, devuelve null. Una línea sin
// cruzar se resuelve en un toque; una cruzada con el producto equivocado
// ensucia la canasta y nadie se entera hasta el supermercado.
export function emparejar(textoImpreso, productos, opciones = {}) {
  const umbral = Number.isFinite(opciones.umbral) ? opciones.umbral : UMBRAL;
  const margen = Number.isFinite(opciones.margen) ? opciones.margen : MARGEN;
  const [mejor, segundo] = ordenar(textoImpreso, productos);
  if (!mejor || mejor.puntuacion < umbral) return null;
  if (segundo && segundo.productId !== mejor.productId && mejor.puntuacion - segundo.puntuacion < margen) return null;
  return mejor;
}

// Lo que emparejar no se atreve a decidir. Van sin filtrar por umbral a
// propósito: es justo cuando no hay coincidencia buena cuando el usuario
// necesita ver las tres que más se acercan.
export function sugerencias(textoImpreso, productos, limite = 3) {
  return ordenar(textoImpreso, productos).slice(0, Math.max(0, Number(limite) || 0));
}

const nivelLectura = confianza => {
  const valor = Number(confianza);
  if (!Number.isFinite(valor)) return 'baja';
  if (valor >= LECTURA_ALTA) return 'alta';
  if (valor >= LECTURA_MEDIA) return 'media';
  return 'baja';
};

// Una cantidad que no vino en la extracción se queda en null. Poner 1 «porque
// normalmente se compra uno» es escribirle al usuario una compra que no hizo.
function cantidadLeida(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? redondear(numero) : null;
}

// Nunca 'incluir' con la lectura floja, pase lo que pase con el cruce: aprobar
// solo lo que se leyó bien. Y sin candidato, una lectura a medias tampoco da
// para crear un producto: quedaría en el catálogo llamándose «PLAT MAD» para
// siempre, que es peor que no tenerlo.
function decidir(nivel, match) {
  if (nivel === 'baja') return 'lectura-mala';
  if (match && nivel === 'alta' && match.puntuacion >= MATCH_SOLIDO) return 'incluir';
  if (match) return 'unir';
  return nivel === 'alta' ? 'nuevo' : 'lectura-mala';
}

function avisar(nivel, match, cantidad, unidad, decision) {
  const notas = [];
  if (nivel === 'baja') notas.push('La lectura de esta línea no es clara: compárala con la foto.');
  if (nivel === 'baja' && match) notas.push(`Podría ser ${match.nombre}, pero la foto no alcanza para darlo por bueno.`);
  if (decision === 'unir') notas.push(`Se parece a ${match.nombre}: confírmalo o elige otro.`);
  if (decision === 'nuevo') notas.push('No está en el catálogo: decide si vale la pena crearlo.');
  if (cantidad === null) notas.push('Sin cantidad legible: escríbela tú, no se inventa.');
  if (unidad === null) notas.push('Sin unidad legible: elígela tú, no se inventa.');
  return notas.join(' ') || null;
}

// Ida y vuelta, porque el navegador es demasiado servicial: pedirle el 30 de
// febrero no falla, devuelve el 2 de marzo. Una fecha que no vuelve igual no
// es la que traía la factura, así que se descarta.
function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return false;
  const dia = new Date(`${fecha}T12:00:00Z`);
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
}

// El identificador sale del orden de la línea, sin azar: revisar dos veces la
// misma extracción tiene que dar los mismos identificadores, o las decisiones
// que el usuario ya tomó se despegarían de las líneas al recargar.
function revisarLinea(linea, indice, productos) {
  const nivel = nivelLectura(linea.confianza);
  const cantidad = cantidadLeida(linea.cantidad);
  const unidad = UNITS.includes(linea.unidad) ? linea.unidad : null;
  // Se cruza contra el nombre que el lector ya limpió; si no lo trae, contra
  // lo impreso tal cual. El match se conserva aunque la lectura sea mala
  // —sirve para enseñar de qué se sospecha—, pero no cambia la decisión.
  const match = emparejar(String(linea.nombreSugerido || linea.textoOriginal || ''), productos);
  const decision = decidir(nivel, match);
  return {
    id: `linea-${indice + 1}`,
    textoOriginal: String(linea.textoOriginal ?? ''),
    nombreSugerido: linea.nombreSugerido ? String(linea.nombreSugerido) : null,
    cantidad,
    unidad,
    confianza: Number.isFinite(Number(linea.confianza)) ? Number(linea.confianza) : null,
    match,
    decision,
    confianzaNivel: nivel,
    aviso: avisar(nivel, match, cantidad, unidad, decision)
  };
}

// Ninguna línea se descarta, ni la ilegible ni la que vino sin cantidad: una
// línea que desaparece es una compra que el usuario no puede corregir porque
// ya no la ve.
export function revisarFactura(extraccion, productos) {
  const fuente = extraccion || {};
  return {
    fecha: fechaValida(fuente.fecha) ? fuente.fecha : null,
    establecimiento: String(fuente.establecimiento ?? '').trim() || null,
    lineas: (fuente.lineas || []).map((linea, indice) => revisarLinea(linea || {}, indice, productos))
  };
}

const mesValido = mes => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes ?? ''));

// Lo ilegible, lo descartado y lo que no es comida no enseñan nada sobre el
// hábito de la casa. Una línea sin decisión sí cuenta: viene de una extracción
// que todavía no ha pasado por revisarFactura.
const EXCLUIDAS = new Set(['ignorar', 'no-alimentario', 'lectura-mala']);

// La mediana, no la media: un mes se compraron veinte libras de arroz para un
// cumpleaños y los otros dos, dos. La media diría ocho —una canasta que nadie
// consume—; la mediana dice dos, que es lo que come esta casa.
function mediana(valores) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return redondear(orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2);
}

// La unidad que más veces se imprimió, y en empate la primera que se vio, para
// que dos pasadas den lo mismo.
function moda(valores) {
  const cuenta = new Map();
  for (const valor of valores) cuenta.set(valor, (cuenta.get(valor) || 0) + 1);
  let mejor = null;
  for (const [valor, veces] of cuenta) if (!mejor || veces > mejor.veces) mejor = { valor, veces };
  return mejor ? mejor.valor : null;
}

// La clave es el producto del catálogo cuando lo hay; si no, el nombre
// normalizado. Así «PLAT MAD» de agosto y «PLATANO MADURO» de septiembre caen
// en el mismo montón aunque ninguna de las dos se haya cruzado todavía.
function acumular(grupos, mes, linea) {
  if (EXCLUIDAS.has(linea.decision)) return;
  const nombre = String(linea.match?.nombre || linea.nombreSugerido || linea.textoOriginal || '').trim();
  const clave = linea.match?.productId || normalizar(nombre);
  if (!clave) return;
  if (!grupos.has(clave)) grupos.set(clave, { clave, nombre, meses: [], entradas: [] });
  const grupo = grupos.get(clave);
  if (!grupo.meses.includes(mes)) grupo.meses.push(mes);
  grupo.entradas.push({ mes, cantidad: cantidadLeida(linea.cantidad), unidad: UNITS.includes(linea.unidad) ? linea.unidad : null });
}

function resumir(grupo, totalMeses) {
  const unidad = moda(grupo.entradas.map(entrada => entrada.unidad).filter(Boolean));
  // Solo se suman las cantidades de la unidad mayoritaria: seis unidades y dos
  // libras no hacen ocho de nada, y aquí no hay tabla de equivalencias con que
  // convertirlas. Lo que no encaja se deja fuera en vez de forzarlo.
  const porMes = new Map();
  for (const entrada of grupo.entradas) {
    if (entrada.cantidad === null || entrada.unidad !== unidad) continue;
    porMes.set(entrada.mes, redondear((porMes.get(entrada.mes) || 0) + entrada.cantidad));
  }
  // Se compara mes contra mes, no línea contra línea: dos compras de seis
  // plátanos en agosto son doce plátanos de agosto, no dos agostos de seis.
  const meses = [...grupo.meses].sort();
  const cantidades = meses.map(mes => porMes.get(mes)).filter(valor => valor !== undefined);
  const apariciones = meses.length;
  return {
    clave: grupo.clave,
    nombre: grupo.nombre,
    meses,
    apariciones,
    totalMeses,
    cantidades,
    cantidadSugerida: mediana(cantidades),
    unidad,
    // Dos decimales porque es una proporción para leer, no para calcular.
    frecuencia: totalMeses ? redondear(apariciones / totalMeses, 2) : 0,
    recomendacion: apariciones > totalMeses / 2 ? 'base' : 'ocasional'
  };
}

// Una factura sin mes no puede decir nada sobre repetición, así que queda
// fuera del conteo en vez de contaminarlo. proponerCanasta avisa de cuántas
// son para que el usuario les ponga fecha.
export function frecuencias(facturas) {
  const conMes = (facturas || []).filter(factura => factura && mesValido(factura.mes));
  const totalMeses = new Set(conMes.map(factura => factura.mes)).size;
  const grupos = new Map();
  for (const factura of conMes) for (const linea of factura.lineas || []) acumular(grupos, factura.mes, linea || {});
  return [...grupos.values()]
    .map(grupo => resumir(grupo, totalMeses))
    .sort((a, b) => b.apariciones - a.apariciones || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// Propone; no aplica. Las cantidades salen calculadas de lo que el usuario
// compró de verdad, pero siguen siendo una propuesta hasta que él la confirme:
// ninguna función de este módulo las escribe en la canasta.
export function proponerCanasta(facturas, opciones = {}) {
  const minimoMeses = Number.isFinite(opciones.minimoMeses) ? opciones.minimoMeses : 2;
  const lista = (facturas || []).filter(Boolean);
  const conMes = lista.filter(factura => mesValido(factura.mes));
  const meses = new Set(conMes.map(factura => factura.mes));
  // Con un solo mes de facturas no hay repetición que observar: lo comprado
  // una vez pudo ser el antojo de esa semana. Se propone igual —el usuario ya
  // se tomó el trabajo de fotografiar—, pero todo como ocasional y diciendo
  // por qué, en vez de vender como hábito lo que solo es una compra.
  const suficiente = meses.size >= minimoMeses;
  const filas = frecuencias(lista).map(fila => (suficiente ? fila : { ...fila, recomendacion: 'ocasional' }));
  const sinCantidad = filas.filter(fila => fila.cantidadSugerida === null).length;
  const avisos = [];
  if (!lista.length) avisos.push('Todavía no hay facturas revisadas: no hay nada que proponer.');
  if (lista.length > conMes.length) avisos.push(`${lista.length - conMes.length} factura(s) sin mes quedan fuera del cálculo: escríbeles la fecha.`);
  if (lista.length && !suficiente) avisos.push(`Con ${meses.size} mes(es) de facturas no se puede hablar de hábito todavía: todo queda como ocasional hasta juntar ${minimoMeses}.`);
  if (sinCantidad) avisos.push(`${sinCantidad} alimento(s) se quedaron sin cantidad legible: escribe tú cuánto se compra al mes.`);
  if (filas.length) avisos.push('Las cantidades son una propuesta calculada sobre lo comprado: confírmalas antes de guardarlas en la canasta.');
  return {
    base: filas.filter(fila => fila.recomendacion === 'base'),
    ocasionales: filas.filter(fila => fila.recomendacion === 'ocasional'),
    avisos
  };
}
