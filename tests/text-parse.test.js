import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, normalizeName, parseLine, parseProductText, parseQuantity } from '../src/text-parse.js';

// El dictado de verdad: así es como se cuenta la compra de una quincena.
const DICTADO = 'Compramos 30 plátanos maduros, 10 libras de arroz, 4 paquetes de salami, 30 huevos, 6 latas de atún y detergente.';

test('el dictado completo de una compra deja una fila por producto', () => {
  const { lines, ignored } = parseProductText(DICTADO);
  assert.equal(lines.length, 6);
  assert.deepEqual(ignored, []);
  assert.deepEqual(lines.map(fila => fila.name), ['Plátano maduro', 'Arroz', 'Salami', 'Huevo', 'Atún', 'Detergente']);
  assert.deepEqual(lines.map(fila => fila.quantity), [30, 10, 4, 30, 6, null]);
  assert.deepEqual(lines.map(fila => fila.unit), ['unidad', 'lb', 'paquete', 'unidad', 'lata', null]);
  assert.ok(lines.every(fila => fila.negated === false));
});

test('el producto sin cantidad ni unidad se conserva pendiente en vez de descartarse', () => {
  const detergente = parseProductText(DICTADO).lines.at(-1);
  assert.equal(detergente.name, 'Detergente');
  assert.equal(detergente.quantity, null);
  assert.equal(detergente.unit, null);
  assert.deepEqual(detergente.pending, ['quantity', 'unit']);
  assert.equal(detergente.confidence, 'baja');
  assert.ok(detergente.warning, 'la duda se explica en español, no se calla');
});

test('cada fila guarda el trozo original que la produjo', () => {
  const { lines } = parseProductText(DICTADO);
  assert.equal(lines[1].raw, '10 libras de arroz');
  assert.equal(lines[4].raw, '6 latas de atún');
  assert.equal(lines[5].raw, 'detergente');
});

test('«media docena de huevos» son seis unidades, no media de nada', () => {
  assert.equal(parseQuantity('media docena'), 6);
  const fila = parseLine('media docena de huevos');
  assert.equal(fila.quantity, 6);
  assert.equal(fila.unit, 'unidad');
  assert.equal(fila.name, 'Huevo');
  assert.deepEqual(fila.pending, []);
  assert.equal(fila.confidence, 'media', 'el número vino en palabras');
});

test('la docena no es una unidad: multiplica por doce y la unidad queda en unidades', () => {
  assert.equal(parseQuantity('docena'), 12);
  assert.equal(parseQuantity('dos docenas'), 24);
  const fila = parseLine('2 docenas de huevos');
  assert.equal(fila.quantity, 24);
  assert.equal(fila.unit, 'unidad');
  assert.ok(!UNITS.includes('docena'), 'docena nunca puede colarse como unidad del modelo');
});

test('los kilos se convierten a libras y la fila avisa que ese número no se escribió', () => {
  const kilo = parseLine('1 kilo de pollo');
  assert.equal(kilo.quantity, 2.205, 'una libra por kilo redondeada a tres decimales');
  const dos = parseLine('2 kilos de pollo');
  assert.equal(dos.quantity, 4.409, 'dos kilos son dos veces 2.20462 lb');
  assert.equal(dos.unit, 'lb');
  assert.equal(dos.confidence, 'media');
  assert.match(dos.warning, /convirtió/);
  assert.deepEqual(dos.pending, [], 'convertir no deja nada pendiente: la cantidad se sabe');
});

test('gramos y onzas también llegan a libras', () => {
  assert.equal(parseLine('500 gramos de café').quantity, 1.102);
  assert.equal(parseLine('8 onzas de queso').quantity, 0.5);
  assert.equal(parseLine('250 g de sal').unit, 'lb');
});

test('la «y» dentro de un nombre no parte el producto en dos', () => {
  const { lines } = parseProductText('arroz y habichuelas');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, 'Arroz y habichuela');
  assert.equal(lines[0].normalized, 'arroz y habichuela');
});

test('la «y» entre dos productos con cantidad sí los separa', () => {
  const { lines } = parseProductText('10 libras de arroz y 4 paquetes de salami');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(fila => [fila.name, fila.quantity, fila.unit]), [['Arroz', 10, 'lb'], ['Salami', 4, 'paquete']]);
});

test('la «y» separa aunque el segundo no traiga cantidad, si el primero ya está completo', () => {
  // Es la «y» del dictado real: «6 latas de atún y detergente» son dos cosas.
  const { lines } = parseProductText('6 latas de atún y detergente');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].name, 'Detergente');
  assert.deepEqual(lines[1].pending, ['quantity', 'unit']);
});

test('«dos y medio» es una cantidad sola, no dos productos', () => {
  assert.equal(parseQuantity('dos y medio'), 2.5);
  const { lines } = parseProductText('dos y medio lb de arroz');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 2.5);
  assert.equal(lines[0].unit, 'lb');
});

test('lo que la casa decide no comprar se marca, no se borra', () => {
  const fila = parseLine('este mes no vamos a comprar atún');
  assert.equal(fila.negated, true);
  assert.equal(fila.name, 'Atún', 'el verbo y la muletilla no se quedan pegados al nombre');
  assert.equal(fila.normalized, 'atun');
});

test('quitar, sacar y «sin» también niegan', () => {
  for (const texto of ['quita el atún', 'saca el atún', 'sin atún', 'este mes no compramos atún']) {
    const fila = parseLine(texto);
    assert.equal(fila.negated, true, texto);
    assert.equal(fila.name, 'Atún', texto);
  }
  assert.equal(parseLine('6 latas de atún').negated, false);
});

test('normalizeName quita tildes, mayúsculas, plurales y espacios de sobra', () => {
  assert.equal(normalizeName('Plátanos Maduros '), 'platano maduro');
  assert.equal(normalizeName('  ARROZ   BLANCO '), 'arroz blanco');
  assert.equal(normalizeName('Huevos'), 'huevo');
  assert.equal(normalizeName('Atún'), 'atun');
  assert.equal(normalizeName('Piña'), 'pina', 'quien escribe rápido pone «pina»: tiene que ser el mismo alimento');
});

test('el plural en -es devuelve el singular que de verdad existe', () => {
  assert.equal(normalizeName('Panes'), 'pan');
  assert.equal(normalizeName('Frijoles'), 'frijol');
  assert.equal(normalizeName('Limones'), 'limon');
  assert.equal(normalizeName('Tomates'), 'tomate', 'no «tomat»');
  assert.equal(normalizeName('Nueces'), 'nuez');
});

test('normalizar lo ya normalizado no lo cambia', () => {
  for (const texto of ['Plátanos Maduros', 'Arroz', 'Huevos', 'Sal', 'Café']) {
    assert.equal(normalizeName(normalizeName(texto)), normalizeName(texto), texto);
  }
});

test('el nombre que se enseña conserva la tilde y el normalizado no', () => {
  const fila = parseLine('3 lonjas de jamón');
  assert.equal(fila.name, 'Jamón');
  assert.equal(fila.normalized, 'jamon');
  assert.equal(fila.unit, 'rebanada');
});

test('el normalizado de cada fila sale siempre de su propio nombre', () => {
  for (const fila of parseProductText(DICTADO).lines) assert.equal(fila.normalized, normalizeName(fila.name), fila.name);
});

test('un texto vacío no devuelve filas ni se queja', () => {
  for (const texto of ['', '   ', '\n\n', null, undefined]) assert.deepEqual(parseProductText(texto), { lines: [], ignored: [] }, String(texto));
  assert.equal(parseLine(''), null);
  assert.equal(parseQuantity(''), null);
});

test('lo que queda vacío tras limpiar va a ignorados, no a filas', () => {
  const { lines, ignored } = parseProductText('compramos, también. ;;;');
  assert.deepEqual(lines, []);
  assert.deepEqual(ignored, ['compramos', 'también']);
  assert.equal(parseLine('agrega'), null, 'un verbo suelto no es un producto');
});

test('los decimales van con coma o con punto, y esa coma no separa productos', () => {
  assert.equal(parseQuantity('2,5'), 2.5);
  assert.equal(parseQuantity('2.5'), 2.5);
  const { lines } = parseProductText('2,5 libras de arroz, 3 latas de habichuelas');
  assert.equal(lines.length, 2, 'la coma del decimal no parte la fila');
  assert.equal(lines[0].quantity, 2.5);
  assert.equal(lines[1].quantity, 3);
});

test('las fracciones se entienden en quebrado y en palabras', () => {
  assert.equal(parseQuantity('1/2'), 0.5);
  assert.equal(parseQuantity('un cuarto'), 0.25);
  assert.equal(parseQuantity('medio'), 0.5);
  assert.equal(parseLine('1/2 lb de queso').quantity, 0.5);
});

test('los números escritos en palabras se leen igual que los dígitos', () => {
  assert.equal(parseQuantity('veinte'), 20);
  assert.equal(parseQuantity('cincuenta'), 50);
  assert.equal(parseQuantity('cien'), 100);
  assert.equal(parseLine('una lata de atún').quantity, 1);
  assert.equal(parseLine('una lata de atún').confidence, 'media', 'un número en palabras se dedujo');
});

test('los sinónimos dominicanos de cada unidad llegan a la unidad del modelo', () => {
  const casos = [
    ['libra', 'lb'], ['libras', 'lb'], ['lb', 'lb'], ['lbs', 'lb'],
    ['unidad', 'unidad'], ['unidades', 'unidad'], ['und', 'unidad'], ['u', 'unidad'],
    ['lata', 'lata'], ['latas', 'lata'], ['enlatado', 'lata'],
    ['paquete', 'paquete'], ['funda', 'paquete'], ['fundas', 'paquete'], ['bolsa', 'paquete'], ['caja', 'paquete'], ['pack', 'paquete'],
    ['taza', 'taza'], ['tazas', 'taza'],
    ['rueda', 'rueda'], ['ruedas', 'rueda'], ['rodaja', 'rueda'], ['rodajas', 'rueda'],
    ['rebanada', 'rebanada'], ['lonja', 'rebanada'], ['lonjas', 'rebanada'], ['tajada', 'rebanada'], ['tajadas', 'rebanada']
  ];
  for (const [escrito, unidad] of casos) {
    const fila = parseLine(`2 ${escrito} de arroz`);
    assert.equal(fila.unit, unidad, escrito);
    assert.equal(fila.name, 'Arroz', escrito);
    assert.ok(UNITS.includes(fila.unit), escrito);
  }
});

test('sin unidad escrita se cuenta por unidades, y se avisa de que se dedujo', () => {
  const fila = parseLine('30 huevos');
  assert.equal(fila.unit, 'unidad');
  assert.deepEqual(fila.pending, []);
  assert.equal(fila.confidence, 'media');
  assert.match(fila.warning, /unidad/);
});

test('nunca se inventa una unidad para algo que ni se sabe cuánto es', () => {
  const fila = parseLine('detergente');
  assert.equal(fila.unit, null, 'sin cantidad, deducir «unidad» sería inventar');
  assert.equal(fila.quantity, null);
  assert.deepEqual(fila.pending, ['quantity', 'unit']);
});

test('una unidad sin cantidad conserva la unidad y deja pendiente solo la cantidad', () => {
  const fila = parseLine('libras de arroz');
  assert.equal(fila.unit, 'lb');
  assert.equal(fila.quantity, null);
  assert.deepEqual(fila.pending, ['quantity']);
  assert.equal(fila.confidence, 'baja');
});

test('los verbos y muletillas del principio no se cuelan en el nombre', () => {
  for (const texto of ['compramos arroz', 'compré arroz', 'agrega arroz', 'añade arroz', 'pon arroz', 'necesito arroz', 'hay que comprar arroz', 'este mes arroz', 'para el mes arroz', 'también arroz', 'además arroz']) {
    assert.equal(parseLine(texto).name, 'Arroz', texto);
  }
});

test('la preposición «de» no se cuela en el nombre', () => {
  assert.equal(parseLine('10 libras de arroz').name, 'Arroz');
  assert.equal(parseLine('4 paquetes de salami').name, 'Salami');
  assert.equal(parseLine('1 taza de la harina').name, 'Harina');
});

test('coma, punto y coma, salto de línea y punto separan productos', () => {
  const { lines } = parseProductText('dos tazas de arroz\n4 rebanadas de queso; 5 und de mango. 1 lata de atún');
  assert.deepEqual(lines.map(fila => fila.name), ['Arroz', 'Queso', 'Mango', 'Atún']);
  assert.deepEqual(lines.map(fila => fila.unit), ['taza', 'rebanada', 'unidad', 'lata']);
});

test('la confianza dice de dónde salió cada fila', () => {
  assert.equal(parseLine('6 latas de atún').confidence, 'alta', 'cantidad y unidad escritas');
  assert.equal(parseLine('30 huevos').confidence, 'media', 'la unidad se dedujo');
  assert.equal(parseLine('2 kilos de pollo').confidence, 'media', 'el peso se convirtió');
  assert.equal(parseLine('media docena de huevos').confidence, 'media', 'el número vino en palabras');
  assert.equal(parseLine('detergente').confidence, 'baja', 'falta cantidad y unidad');
  assert.equal(parseLine('2 tazas').confidence, 'baja', 'sin nombre no hay fila confiable');
  assert.equal(parseLine('3 latas de a').confidence, 'baja', 'un nombre de una letra no se entendió');
});
