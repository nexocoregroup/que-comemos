import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarEstablecimiento, buscarFecha, esLineaDeProducto, leerFecha, leerTicket, quitarPrecio } from '../src/receipt-parse.js';
import { revisarFactura } from '../src/invoices.js';

// Un tique de verdad, con el ruido que trae: columnas rellenas de espacios, el
// papeleo fiscal arriba, los totales abajo y una funda plástica en medio de la
// compra. Es el texto que devuelve el OCR del teléfono, no uno limpio a mano.
const TICKET = `SUPERMERCADO NACIONAL
RNC 101010101
Av. 27 de Febrero, Santo Domingo
FACTURA DE CONSUMO
NCF: B0200000123
Fecha: 14/07/2026  14:32
CAJA 03  CAJERO: MARIA
------------------------------
PLAT MAD 6 UND           120.00
ARROZ SELECTO 5LB        285.00
2 X SALAMI INDUV 1LB     380.00
HUEVOS BLANCOS 12U       195.00
ATUN CALVO 5OZ            89.50
  DESCUENTO              -20.00
FUNDA PLASTICA             5.00
------------------------------
SUBTOTAL                1054.50
ITBIS 18%                189.81
TOTAL                   1244.31
EFECTIVO                1500.00
CAMBIO                   255.69
GRACIAS POR SU COMPRA`;

// Un catálogo de mentira, con los alias que cruzarían con este tique. No se usa
// el de verdad para que estas pruebas no se rompan cuando alguien edite
// catalog-seed.js.
const CATALOGO = [
  { id: 'p-maduro', name: 'Plátano maduro', aliases: ['plat mad', 'maduro'], controlUnit: 'unidad' },
  { id: 'p-arroz', name: 'Arroz', aliases: ['arroz selecto'], controlUnit: 'lb' },
  { id: 'p-huevos', name: 'Huevos', aliases: ['huevos blancos'], controlUnit: 'unidad' },
  { id: 'p-salami', name: 'Salami', aliases: ['salami induveca'], controlUnit: 'rueda' },
  { id: 'p-atun', name: 'Atún', aliases: ['atun calvo'], controlUnit: 'lata' }
];

const porNombre = (ticket, nombre) => ticket.lineas.find(fila => fila.nombreSugerido === nombre);
const unaLinea = texto => leerTicket(texto).lineas[0];

test('el tique completo deja una fila por producto y manda el papeleo a descartadas', () => {
  const ticket = leerTicket(TICKET);
  assert.equal(ticket.lineas.length, 6);
  assert.deepEqual(ticket.lineas.map(fila => fila.nombreSugerido), [
    'PLAT MAD', 'ARROZ SELECTO', 'SALAMI INDUV 1LB', 'HUEVOS BLANCOS', 'ATUN CALVO', 'FUNDA PLASTICA'
  ]);
  assert.equal(ticket.aviso, null, 'un tique que se leyó entero no tiene nada que avisar');
});

test('la funda plástica se conserva: decidir que no es comida le toca al usuario', () => {
  const funda = porNombre(leerTicket(TICKET), 'FUNDA PLASTICA');
  assert.ok(funda, 'tiene nombre y precio: estructuralmente es una línea de producto');
  assert.equal(funda.cantidad, null, 'el tique no imprimió cuántas');
  assert.equal(funda.unidad, null);
  // invoices.js ya tiene la decisión 'no-alimentario' para esto; descartarla
  // aquí le quitaría al usuario la oportunidad de tomarla.
  assert.ok(!leerTicket(TICKET).descartadas.some(linea => /FUNDA/.test(linea)));
});

test('los totales, el ITBIS, el efectivo y el cambio se van a descartadas', () => {
  const { descartadas } = leerTicket(TICKET);
  for (const palabra of [/SUBTOTAL/, /ITBIS/, /^TOTAL/m, /EFECTIVO/, /CAMBIO/, /DESCUENTO/]) {
    assert.ok(descartadas.some(linea => palabra.test(linea)), `${palabra} tenía que quedar fuera de la compra`);
  }
  assert.ok(descartadas.every(linea => typeof linea === 'string'));
});

test('el papeleo fiscal y el encabezado tampoco son compras', () => {
  const { descartadas } = leerTicket(TICKET);
  for (const palabra of [/RNC/, /NCF/, /FACTURA/, /Fecha/, /CAJA/, /GRACIAS/, /Febrero/, /^-+$/]) {
    assert.ok(descartadas.some(linea => palabra.test(linea)), `${palabra} tenía que quedar fuera de la compra`);
  }
});

test('el tique completo trae su fecha y el rótulo del supermercado', () => {
  const ticket = leerTicket(TICKET);
  assert.equal(ticket.fecha, '2026-07-14');
  assert.match(ticket.establecimiento, /Nacional/i);
});

test('«2 X SALAMI INDUV 1LB»: la cantidad de delante manda sobre la de dentro', () => {
  const salami = porNombre(leerTicket(TICKET), 'SALAMI INDUV 1LB');
  // Son dos salamis de una libra cada uno, no dos libras ni un salami: el 2 es
  // lo que se llevó la casa y el «1LB» es el tamaño del producto.
  assert.equal(salami.cantidad, 2);
  assert.equal(salami.unidad, 'unidad');
  assert.equal(salami.nombreSugerido, 'SALAMI INDUV 1LB', 'el tamaño es parte de cómo se llama');
  assert.ok(salami.confianza < 0.75, 'la unidad la pusimos nosotros: eso no se aprueba solo');
});

test('la cantidad de delante se escribe de varias formas y todas valen', () => {
  assert.equal(unaLinea('2 X SALAMI 380.00').cantidad, 2);
  assert.equal(unaLinea('2X SALAMI 380.00').cantidad, 2);
  assert.equal(unaLinea('2 x salami 380.00').cantidad, 2);
  assert.equal(unaLinea('X2 SALAMI 380.00').cantidad, 2);
  assert.equal(unaLinea('X2 SALAMI 380.00').nombreSugerido, 'SALAMI');
});

test('«ARROZ SELECTO 5LB» son cinco libras y el nombre queda sin la medida', () => {
  const arroz = porNombre(leerTicket(TICKET), 'ARROZ SELECTO');
  assert.equal(arroz.cantidad, 5);
  assert.equal(arroz.unidad, 'lb');
  assert.equal(arroz.confianza, 0.9, 'cantidad y unidad impresas, nombre limpio');
});

test('«HUEVOS BLANCOS 12U» son doce unidades', () => {
  const huevos = porNombre(leerTicket(TICKET), 'HUEVOS BLANCOS');
  assert.equal(huevos.cantidad, 12);
  assert.equal(huevos.unidad, 'unidad');
});

test('«ATUN CALVO 5OZ» llega a libras por la tabla que ya tiene text-parse', () => {
  const atun = porNombre(leerTicket(TICKET), 'ATUN CALVO');
  assert.equal(atun.cantidad, 0.313, 'cinco onzas son 0.3125 lb redondeadas a tres decimales');
  assert.equal(atun.unidad, 'lb');
  assert.ok(atun.confianza < 0.9, 'convertir no es inventar, pero tampoco es leer');
});

test('«PLAT MAD 6 UND» conserva la abreviatura para que emparejar la cruce', () => {
  const plat = porNombre(leerTicket(TICKET), 'PLAT MAD');
  assert.equal(plat.cantidad, 6);
  assert.equal(plat.unidad, 'unidad');
  // Tal cual se imprimió: «PLAT MAD» está en los alias del catálogo y
  // arreglarlo a «Plátano maduro» sería adivinar por el usuario.
  assert.equal(plat.nombreSugerido, 'PLAT MAD');
});

test('cada fila guarda la línea impresa entera, precio incluido', () => {
  const plat = porNombre(leerTicket(TICKET), 'PLAT MAD');
  // Con los espacios de columna colapsados, que es relleno del tique, pero sin
  // quitarle nada: es lo que el usuario compara contra la foto.
  assert.equal(plat.textoOriginal, 'PLAT MAD 6 UND 120.00');
});

test('buscarFecha entiende los cuatro formatos que imprime un tique', () => {
  assert.equal(buscarFecha('Fecha: 14/07/2026'), '2026-07-14');
  assert.equal(buscarFecha('FECHA 14-07-26'), '2026-07-14', 'el año de dos cifras se completa en este siglo');
  assert.equal(buscarFecha('2026-07-14'), '2026-07-14');
  assert.equal(buscarFecha('14 JUL 2026'), '2026-07-14');
  assert.equal(buscarFecha('14 de julio de 2026'), '2026-07-14');
});

test('en República Dominicana se lee día/mes, no mes/día', () => {
  // 07 no existe como día 7 de un mes 14: si se leyera al revés, esta fecha no
  // sería ninguna.
  assert.equal(buscarFecha('14/07/2026'), '2026-07-14');
  assert.equal(buscarFecha('05/07/2026'), '2026-07-05', 'cinco de julio, no siete de mayo');
});

test('una fecha imposible no se lee: mejor null que el 2 de marzo', () => {
  assert.equal(buscarFecha('30/02/2026'), null);
  assert.equal(buscarFecha('14/13/2026'), null);
  assert.equal(buscarFecha('sin fecha por ninguna parte'), null);
  assert.equal(buscarFecha(''), null);
  assert.equal(buscarFecha(null), null);
});

test('la fecha ambigua se guarda, pero con menos confianza que la clara', () => {
  const ambigua = leerFecha('Fecha: 05/07/2026');
  const clara = leerFecha('Fecha: 14/07/2026');
  assert.equal(ambigua.fecha, '2026-07-05');
  assert.equal(ambigua.ambigua, true);
  assert.ok(ambigua.confianza < clara.confianza, 'no se cobra como certeza lo que es costumbre local');
  assert.equal(clara.ambigua, false);
});

test('la fecha ambigua se avisa en español en vez de callarla', () => {
  const ticket = leerTicket('SUPERMERCADO POLA\nFecha: 05/07/2026\nARROZ SELECTO 5LB 285.00');
  assert.equal(ticket.fecha, '2026-07-05');
  assert.match(ticket.aviso, /05\/07\/2026/);
  assert.match(ticket.aviso, /d[ií]a\/mes/i);
});

test('la línea que dice «Fecha» manda sobre cualquier otro número con barras', () => {
  assert.equal(buscarFecha('NCF 01/02/2020\nFecha: 14/07/2026'), '2026-07-14');
});

test('quitarPrecio recorta el importe del final y deja el nombre', () => {
  assert.deepEqual(quitarPrecio('TOTAL                   1,244.31'), { texto: 'TOTAL', precio: 1244.31 });
  assert.deepEqual(quitarPrecio('ATUN CALVO 5OZ RD$ 89.50'), { texto: 'ATUN CALVO 5OZ', precio: 89.5 });
  assert.deepEqual(quitarPrecio('ATUN CALVO 5OZ $89.50'), { texto: 'ATUN CALVO 5OZ', precio: 89.5 });
  assert.deepEqual(quitarPrecio('ARROZ SELECTO 5LB        285.00'), { texto: 'ARROZ SELECTO 5LB', precio: 285 });
});

test('quitarPrecio deja la línea entera cuando no hay importe', () => {
  assert.deepEqual(quitarPrecio('FACTURA DE CONSUMO'), { texto: 'FACTURA DE CONSUMO', precio: null });
  // Nueve dígitos seguidos son un RNC, no dinero: un importe trae centavos o
  // viene marcado con la moneda.
  assert.deepEqual(quitarPrecio('RNC 101010101'), { texto: 'RNC 101010101', precio: null });
  assert.deepEqual(quitarPrecio(''), { texto: '', precio: null });
  assert.deepEqual(quitarPrecio(null), { texto: '', precio: null });
});

test('quitarPrecio lee el importe negativo del descuento', () => {
  assert.equal(quitarPrecio('  DESCUENTO              -20.00').precio, -20);
  assert.equal(esLineaDeProducto('DEVOLUCION -50.00'), false, 'lo que se resta no se compró');
});

test('esLineaDeProducto exige nombre y precio en la misma línea', () => {
  assert.equal(esLineaDeProducto('ARROZ SELECTO 5LB        285.00'), true);
  assert.equal(esLineaDeProducto('FUNDA PLASTICA             5.00'), true);
  assert.equal(esLineaDeProducto('SUPERMERCADO NACIONAL'), false, 'el rótulo no lleva precio');
  assert.equal(esLineaDeProducto('GRACIAS POR SU COMPRA'), false);
  assert.equal(esLineaDeProducto('RD$ 89.50'), false, 'un importe suelto no nombra nada');
});

test('esLineaDeProducto descarta separadores, huecos y columnas de números', () => {
  assert.equal(esLineaDeProducto('------------------------------'), false);
  assert.equal(esLineaDeProducto('=============='), false);
  assert.equal(esLineaDeProducto('   '), false);
  assert.equal(esLineaDeProducto(''), false);
  assert.equal(esLineaDeProducto('1054.50'), false);
  assert.equal(esLineaDeProducto(null), false);
});

test('esLineaDeProducto conoce el papeleo que imprime el supermercado', () => {
  for (const linea of [
    'RNC 101010101', 'NCF: B0200000123', 'FACTURA DE CONSUMO', 'Fecha: 14/07/2026  14:32',
    'CAJA 03  CAJERO: MARIA', 'Av. 27 de Febrero, Santo Domingo', 'SUBTOTAL 1054.50',
    'ITBIS 18% 189.81', 'TOTAL 1244.31', 'EFECTIVO 1500.00', 'CAMBIO 255.69',
    'DESCUENTO -20.00', 'PROPINA LEGAL 100.00', 'AHORRO HOY 45.00'
  ]) {
    assert.equal(esLineaDeProducto(linea), false, `«${linea}» no es una compra`);
  }
});

test('buscarEstablecimiento reconoce los grandes de República Dominicana', () => {
  assert.match(buscarEstablecimiento('SUPERMERCADO NACIONAL\nRNC 101010101'), /Nacional/i);
  assert.match(buscarEstablecimiento('JUMBO MEGACENTRO\nRNC 1'), /JUMBO/);
  assert.match(buscarEstablecimiento('LA SIRENA CHURCHILL\nRNC 1'), /SIRENA/);
  assert.match(buscarEstablecimiento('SUPERMERCADOS BRAVO\nRNC 1'), /BRAVO/);
  assert.match(buscarEstablecimiento('PLAZA LAMA S.A.\nRNC 1'), /LAMA/);
  assert.match(buscarEstablecimiento('SUPERMERCADO OLE\nRNC 1'), /OLE/);
  assert.match(buscarEstablecimiento('APREZIO IBERIA\nRNC 1'), /APREZIO/);
});

test('buscarEstablecimiento devuelve el rótulo impreso, no la dirección ni el papeleo', () => {
  const ticket = 'COLMADO LA ESQUINA\nRNC 101010101\nAv. Duarte 45\nFACTURA\nARROZ 100.00';
  assert.equal(buscarEstablecimiento(ticket), 'COLMADO LA ESQUINA');
  // Sin nada que parezca un rótulo se devuelve null antes que escoger una línea
  // cualquiera del encabezado.
  assert.equal(buscarEstablecimiento('Av. Duarte 45\nRNC 101010101'), null);
  assert.equal(buscarEstablecimiento(''), null);
});

test('buscarEstablecimiento acepta la tienda del barrio por opciones', () => {
  const ticket = 'MERCADITO DONA FELA\nRNC 1\nARROZ 100.00';
  assert.equal(buscarEstablecimiento(ticket, { cadenas: ['dona fela'] }), 'MERCADITO DONA FELA');
});

test('un texto que no es una factura no se lee a la fuerza', () => {
  // Un dictado de compra: tiene alimentos y hasta cantidades, pero ni un solo
  // precio. Leerlo como factura sería inventarse una compra que no consta.
  const ticket = leerTicket('Compramos 30 plátanos maduros y 10 libras de arroz para este mes');
  assert.deepEqual(ticket.lineas, []);
  assert.equal(ticket.fecha, null);
  assert.match(ticket.aviso, /no parece una factura/i);
});

test('el texto vacío devuelve la misma forma, sin líneas y con aviso', () => {
  const ticket = leerTicket('');
  assert.deepEqual(ticket, { fecha: null, establecimiento: null, lineas: [], descartadas: [], aviso: ticket.aviso });
  assert.ok(ticket.aviso, 'el silencio se explica, no se devuelve a secas');
  assert.deepEqual(leerTicket(null).lineas, []);
  assert.deepEqual(leerTicket(undefined).descartadas, []);
});

test('el texto de puro ruido no produce ninguna compra', () => {
  const ticket = leerTicket('@@@@ ####\n----------\n83 &&& %%%\n\n   ');
  assert.deepEqual(ticket.lineas, []);
  assert.ok(ticket.aviso);
  assert.ok(ticket.descartadas.length, 'lo ilegible se enseña, no se esconde');
});

test('leerTicket no toca el texto ni las opciones que recibe', () => {
  const texto = TICKET;
  const cadenas = Object.freeze(['dona fela']);
  const opciones = Object.freeze({ cadenas });
  const primero = leerTicket(texto, opciones);
  const segundo = leerTicket(texto, opciones);
  assert.equal(texto, TICKET, 'el texto crudo sigue siendo el mismo');
  assert.deepEqual(cadenas, ['dona fela']);
  assert.deepEqual(primero, segundo, 'el mismo texto da siempre la misma lectura');
  primero.lineas.push('intruso');
  assert.equal(segundo.lineas.length, 6, 'cada lectura devuelve sus propios arreglos');
});

test('sin cantidad legible no se inventa un uno, ni una unidad de relleno', () => {
  const fila = unaLinea('DETERGENTE ACE         245.00');
  assert.equal(fila.cantidad, null);
  assert.equal(fila.unidad, null);
  assert.equal(fila.nombreSugerido, 'DETERGENTE ACE');
  // «FUNDA» es una unidad en la tabla de text-parse, pero sin número al lado es
  // parte del nombre, no un paquete de nada.
  assert.equal(unaLinea('FUNDA PLASTICA 5.00').unidad, null);
  assert.equal(unaLinea('LATA DE ATUN 89.50').unidad, null);
});

test('la medida que no se reconoce se queda en el nombre en vez de traducirse', () => {
  const fila = unaLinea('JUGO DE NARANJA 1LT      120.00');
  assert.equal(fila.cantidad, null, 'el litro no está en las unidades del modelo');
  assert.equal(fila.unidad, null);
  assert.equal(fila.nombreSugerido, 'JUGO DE NARANJA 1LT');
});

test('los errores del OCR bajan la confianza en vez de corregirse a mano', () => {
  const malo = unaLinea('HUEV0S BL4NC0S 12U       195.00');
  const bueno = unaLinea('HUEVOS BLANCOS 12U       195.00');
  assert.equal(malo.nombreSugerido, 'HUEV0S BL4NC0S', 'nunca se inventa un nombre');
  assert.ok(malo.confianza < 0.5, 'con las letras comidas, invoices.js la marca lectura-mala');
  assert.ok(bueno.confianza > malo.confianza);
  assert.equal(malo.cantidad, 12, 'lo que sí se leyó bien se conserva');
});

test('la confianza sale de señales de la línea, no de un número mágico', () => {
  // Cantidad y unidad impresas y nombre de solo letras: lo más alto que da.
  assert.equal(unaLinea('ARROZ SELECTO 5LB 285.00').confianza, 0.9);
  // Sin medida impresa se pierden las dos primas y se paga la deducción.
  assert.equal(unaLinea('DETERGENTE ACE 245.00').confianza, 0.5);
  // Un nombre de tres letras o menos empieza igual que media docena de
  // productos, así que no llega a aprobarse solo por bien impreso que esté.
  assert.ok(unaLinea('SL 2U 10.00').confianza < 0.75);
  assert.ok(unaLinea('SL 2U 10.00').confianza < unaLinea('SALAMI 2U 10.00').confianza);
});

test('la salida encaja con revisarFactura sin tocarle nada', () => {
  const ticket = leerTicket(TICKET);
  const revisada = revisarFactura(ticket, CATALOGO);
  assert.equal(revisada.fecha, '2026-07-14');
  assert.match(revisada.establecimiento, /Nacional/i);
  assert.equal(revisada.lineas.length, 6, 'revisarFactura no pierde ninguna línea');
  assert.deepEqual(revisada.lineas.map(fila => fila.id), ['linea-1', 'linea-2', 'linea-3', 'linea-4', 'linea-5', 'linea-6']);
  assert.ok(revisada.lineas.every(fila => typeof fila.decision === 'string'));
});

test('lo que se leyó claro y cruzó con el catálogo se aprueba solo', () => {
  const revisada = revisarFactura(leerTicket(TICKET), CATALOGO);
  const plat = revisada.lineas.find(fila => fila.textoOriginal.startsWith('PLAT MAD'));
  assert.equal(plat.match.productId, 'p-maduro');
  assert.equal(plat.decision, 'incluir');
  assert.equal(plat.confianzaNivel, 'alta');
  assert.equal(plat.cantidad, 6);
  assert.equal(plat.unidad, 'unidad');
});

test('una lectura floja nunca queda en incluir, cruce o no cruce', () => {
  const revisada = revisarFactura(leerTicket(TICKET), CATALOGO);
  for (const fila of revisada.lineas) {
    if (fila.confianza < 0.75) assert.notEqual(fila.decision, 'incluir', `«${fila.textoOriginal}» se aprobó sin leerse bien`);
    if (fila.confianzaNivel === 'baja') assert.equal(fila.decision, 'lectura-mala');
  }
  const salami = revisada.lineas.find(fila => fila.textoOriginal.startsWith('2 X SALAMI'));
  assert.equal(salami.decision, 'unir', 'se parece al salami del catálogo: que lo confirme el usuario');
  assert.match(salami.aviso, /Salami/);
});

test('una factura de letras comidas llega entera a la revisión, toda por confirmar', () => {
  const ticket = leerTicket('SUPERMERC4D0 N4CI0NAL\nFecha: 14/07/2026\n4RR0Z SELECT0 5LB 285.00\nHUEV0S 12U 195.00');
  assert.equal(ticket.lineas.length, 2, 'ninguna línea se pierde por estar mal leída');
  const revisada = revisarFactura(ticket, CATALOGO);
  assert.ok(revisada.lineas.every(fila => fila.decision === 'lectura-mala'));
  assert.ok(revisada.lineas.every(fila => /no es clara/.test(fila.aviso)));
});
