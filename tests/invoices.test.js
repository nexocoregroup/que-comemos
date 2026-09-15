import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONES, UNITS, emparejar, frecuencias, normalizar, proponerCanasta, revisarFactura, sugerencias } from '../src/invoices.js';

// Aquí solo se prueba invoices.js, que es aritmética pura. src/invoice-store.js
// se queda fuera a propósito: guarda las fotos en IndexedDB y en Node no hay
// IndexedDB, así que una prueba aquí solo mediría un doble inventado por
// nosotros mismos —nunca el navegador de verdad, que es donde falla: cuotas
// llenas, modo privado, dos pestañas abiertas a la vez.
//
// Se comprueba a mano en el navegador, desde la consola de la app:
//   1. import('./src/invoice-store.js') y ver que disponible() da true.
//   2. guardarImagen(await (await fetch('src/icon-192.png')).blob(), { facturaId: 'f1' })
//      devuelve un id; leerImagen(id) devuelve { blob, meta } con ese facturaId;
//      listarImagenes('f1') lo lista y tamanoTotal() sube más o menos ese peso.
//   3. borrarFactura('f1') devuelve 1, listarImagenes('f1') queda vacío y
//      tamanoTotal() vuelve a lo de antes — y, lo que importa: los productos y
//      la canasta que se aprobaron desde esa factura siguen enteros en la app.
//   4. Recargar la página y repetir el paso 3: los datos sobreviven al cierre.
//   5. En una ventana privada de Firefox o con las cookies bloqueadas,
//      disponible() da false y guardarImagen lanza el aviso en español.

const CATALOGO = [
  { id: 'p-maduro', name: 'Plátano maduro', aliases: ['maduro'], category: 'víveres', controlUnit: 'unidad' },
  { id: 'p-verde', name: 'Plátano verde', aliases: ['plátano barahonero'], category: 'víveres', controlUnit: 'unidad' },
  { id: 'p-leche', name: 'Leche', aliases: ['leche entera', 'lala'], category: 'lácteos', controlUnit: 'lata' },
  { id: 'p-arroz', name: 'Arroz', aliases: [], category: 'víveres', controlUnit: 'lb' },
  { id: 'p-salami', name: 'Salami', aliases: ['embutido'], category: 'carnes', controlUnit: 'rueda' },
  { id: 'p-habichuela', name: 'Habichuelas rojas', aliases: [], category: 'víveres', controlUnit: 'lb' }
];

// Lo que devuelve el lector de facturas antes de pasar por revisarFactura.
const leida = (textoOriginal, campos = {}) => ({ textoOriginal, nombreSugerido: null, cantidad: null, unidad: null, confianza: 0.9, ...campos });

// Una línea ya revisada y aprobada, que es lo que comen frecuencias y
// proponerCanasta.
const comprada = (productId, nombre, cantidad, unidad = 'lb', campos = {}) => ({
  textoOriginal: nombre.toUpperCase(), nombreSugerido: nombre, cantidad, unidad, confianza: 0.9,
  match: { productId, nombre, puntuacion: 1, motivo: 'exacto' },
  decision: 'incluir', confianzaNivel: 'alta', aviso: null, ...campos
});

test('normalizar quita mayúsculas, tildes y puntuación de la letra impresa', () => {
  assert.equal(normalizar('PLÁT. MAD'), 'plat mad');
  assert.equal(normalizar('Piña  Colada!!'), 'pina colada');
  assert.equal(normalizar('  ¡AZÚCAR!  '), 'azucar');
  // Media isla imprime PINA sin ñ: si no se colapsara, esa piña sería otra.
  assert.equal(normalizar('PINA'), normalizar('Piña'));
});

test('normalizar tolera lo que no es texto en vez de reventar', () => {
  assert.equal(normalizar(null), '');
  assert.equal(normalizar(undefined), '');
  assert.equal(normalizar('***'), '');
  assert.equal(normalizar(12), '12');
});

test('emparejar reconoce el nombre escrito igual', () => {
  const match = emparejar('ARROZ', CATALOGO);
  assert.equal(match.productId, 'p-arroz');
  assert.equal(match.motivo, 'exacto');
  assert.equal(match.puntuacion, 1);
});

test('emparejar reconoce el apodo de la casa por el alias', () => {
  const match = emparejar('LALA', CATALOGO);
  assert.equal(match.productId, 'p-leche');
  assert.equal(match.motivo, 'alias');
  // Y el alias sirve aunque el nombre del catálogo no se parezca en nada.
  assert.equal(emparejar('MADURO', CATALOGO).productId, 'p-maduro');
});

test('emparejar entiende la abreviatura de la factura', () => {
  const match = emparejar('PLAT MAD', CATALOGO);
  assert.equal(match.productId, 'p-maduro');
  assert.equal(match.motivo, 'prefijo');
  assert.ok(match.puntuacion > 0.55);
  assert.equal(emparejar('HABICH ROJ', CATALOGO).productId, 'p-habichuela');
});

test('la cantidad y la unidad impresas no estorban al nombre', () => {
  assert.equal(emparejar('PLAT MAD 6 UND', CATALOGO).productId, 'p-maduro');
  assert.equal(emparejar('SALAMI 12 RUEDAS', CATALOGO).productId, 'p-salami');
});

test('emparejar devuelve null antes que forzar una coincidencia mala', () => {
  assert.equal(emparejar('DETERGENTE ACE 1KG', CATALOGO), null);
  assert.equal(emparejar('PAPEL HIGIENICO', CATALOGO), null);
  assert.equal(emparejar('', CATALOGO), null);
  assert.equal(emparejar('ARROZ', []), null);
});

test('un texto ambiguo no se empareja por la fuerza', () => {
  // «PLATANO» a secas puede ser el maduro o el verde: son dos productos
  // distintos en la canasta y elegir uno sería inventar la mitad.
  assert.equal(emparejar('PLATANO', CATALOGO), null);
  assert.equal(emparejar('PLAT', CATALOGO), null);
  // Ni siquiera bajando el umbral: dos candidatos igual de cerca siguen siendo
  // una pregunta para el usuario, no una coincidencia.
  assert.equal(emparejar('PLATANO', CATALOGO, { umbral: 0.3 }), null);
});

test('emparejar aguanta una letra mal leída pero no adivina palabras cortas', () => {
  const match = emparejar('LECHA', CATALOGO);
  assert.equal(match.productId, 'p-leche');
  assert.equal(match.motivo, 'parecido');
  // En tres letras un carácter distinto ya es otra cosa: «SAL» no es Salami.
  assert.equal(emparejar('SAL', CATALOGO), null);
});

test('subir el umbral hace a emparejar más desconfiado, no más creativo', () => {
  assert.equal(emparejar('PLAT MAD', CATALOGO, { umbral: 0.95 }), null);
  assert.equal(emparejar('ARROZ', CATALOGO, { umbral: 0.95 }).productId, 'p-arroz');
});

test('sugerencias ofrece las candidatas ordenadas para elegir a mano', () => {
  const opciones = sugerencias('PLATANO', CATALOGO);
  assert.equal(opciones.length, 3);
  // Justo donde emparejar se niega, el usuario necesita ver los dos plátanos.
  assert.deepEqual(opciones.slice(0, 2).map(fila => fila.productId).sort(), ['p-maduro', 'p-verde']);
  assert.ok(opciones[0].puntuacion >= opciones[1].puntuacion);
  assert.ok(opciones[1].puntuacion >= opciones[2].puntuacion);
  assert.equal(sugerencias('PLATANO', CATALOGO, 1).length, 1);
  assert.deepEqual(sugerencias('PLATANO', CATALOGO, 0), []);
});

test('una lectura con confianza baja nunca queda en incluir', () => {
  // El texto cruza perfecto con el catálogo; lo que falla es la foto.
  const revision = revisarFactura({ lineas: [leida('ARROZ', { confianza: 0.2, cantidad: 3, unidad: 'lb' })] }, CATALOGO);
  const linea = revision.lineas[0];
  assert.equal(linea.confianzaNivel, 'baja');
  assert.notEqual(linea.decision, 'incluir');
  assert.equal(linea.decision, 'lectura-mala');
  // El candidato se conserva para enseñarlo, pero no da por buena la línea.
  assert.equal(linea.match.productId, 'p-arroz');
  assert.match(linea.aviso, /no es clara/);
});

test('la lectura media con candidato pide confirmar, no aprueba sola', () => {
  const revision = revisarFactura({ lineas: [leida('ARROZ', { confianza: 0.6, cantidad: 3, unidad: 'lb' })] }, CATALOGO);
  assert.equal(revision.lineas[0].confianzaNivel, 'media');
  assert.equal(revision.lineas[0].decision, 'unir');
  assert.match(revision.lineas[0].aviso, /confírmalo/);
});

test('lo que se lee claro y cruza firme se propone incluir; lo desconocido, como nuevo', () => {
  const revision = revisarFactura({
    lineas: [
      leida('ARROZ', { confianza: 0.95, cantidad: 5, unidad: 'lb' }),
      leida('GALLETAS DE AVENA', { confianza: 0.95, cantidad: 2, unidad: 'paquete' })
    ]
  }, CATALOGO);
  assert.equal(revision.lineas[0].decision, 'incluir');
  assert.equal(revision.lineas[1].match, null);
  assert.equal(revision.lineas[1].decision, 'nuevo');
});

test('una lectura a medias sin candidato no se convierte en producto nuevo', () => {
  // Crear «PLT MDR XYZ» en el catálogo sería dejar basura con nombre propio.
  const revision = revisarFactura({ lineas: [leida('PLT MDR XYZ', { confianza: 0.55 })] }, CATALOGO);
  assert.equal(revision.lineas[0].confianzaNivel, 'media');
  assert.equal(revision.lineas[0].decision, 'lectura-mala');
});

test('las líneas sin cantidad se conservan con null, no se descartan', () => {
  const revision = revisarFactura({
    lineas: [
      leida('ARROZ', { confianza: 0.95, cantidad: null, unidad: 'lb' }),
      leida('LECHE', { confianza: 0.95, cantidad: 2, unidad: 'kilogramo' })
    ]
  }, CATALOGO);
  assert.equal(revision.lineas.length, 2, 'ninguna línea desaparece: la que no se ve no se corrige');
  assert.equal(revision.lineas[0].cantidad, null);
  assert.match(revision.lineas[0].aviso, /Sin cantidad legible/);
  // Una unidad que no existe en la app tampoco se traduce a ojo.
  assert.equal(revision.lineas[1].unidad, null);
  assert.match(revision.lineas[1].aviso, /Sin unidad legible/);
  assert.ok(UNITS.includes('lb') && !UNITS.includes('kilogramo'));
});

test('revisarFactura no se inventa la fecha ni el establecimiento que no leyó', () => {
  const vacia = revisarFactura({ fecha: '2026-02-30', establecimiento: '   ', lineas: [] }, CATALOGO);
  assert.equal(vacia.fecha, null, 'el 30 de febrero no existe: mejor sin fecha que con una falsa');
  assert.equal(vacia.establecimiento, null);
  assert.deepEqual(vacia.lineas, []);
  const buena = revisarFactura({ fecha: '2026-08-12', establecimiento: 'Nacional', lineas: [leida('ARROZ')] }, CATALOGO);
  assert.equal(buena.fecha, '2026-08-12');
  assert.equal(buena.establecimiento, 'Nacional');
  // Los identificadores salen del orden, sin azar: revisar dos veces la misma
  // extracción tiene que dar lo mismo o las decisiones ya tomadas se despegan.
  assert.equal(buena.lineas[0].id, 'linea-1');
  assert.deepEqual(revisarFactura({ lineas: [leida('ARROZ'), leida('LECHE')] }, CATALOGO).lineas.map(l => l.id), ['linea-1', 'linea-2']);
});

test('toda decisión propuesta es una de las decisiones declaradas', () => {
  const revision = revisarFactura({
    lineas: [leida('ARROZ', { confianza: 0.95 }), leida('ARROZ', { confianza: 0.6 }), leida('XKCD', { confianza: 0.1 }), leida('GALLETAS DE AVENA', { confianza: 0.9 })]
  }, CATALOGO);
  for (const linea of revision.lineas) assert.ok(DECISIONES.includes(linea.decision), `decisión inesperada: ${linea.decision}`);
});

test('la cantidad sugerida es la mediana, no la media', () => {
  // Veinte libras de arroz un mes fue el cumpleaños, no la costumbre. La media
  // diría ocho —una canasta que esta casa no consume—; la mediana dice dos.
  const filas = frecuencias([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f3', mes: '2026-09', lineas: [comprada('p-arroz', 'Arroz', 20)] }
  ]);
  assert.deepEqual(filas[0].cantidades, [2, 2, 20]);
  assert.equal(filas[0].cantidadSugerida, 2);
  assert.notEqual(filas[0].cantidadSugerida, 8);
});

test('con dos cantidades la mediana queda en medio', () => {
  const filas = frecuencias([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-maduro', 'Plátano maduro', 6, 'unidad')] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-maduro', 'Plátano maduro', 8, 'unidad')] }
  ]);
  assert.deepEqual(filas[0].cantidades, [6, 8]);
  assert.equal(filas[0].cantidadSugerida, 7);
  assert.equal(filas[0].unidad, 'unidad');
});

test('lo que aparece en más de la mitad de los meses es base; lo demás, ocasional', () => {
  const filas = frecuencias([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 2), comprada('p-leche', 'Leche', 3, 'lata')] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2), comprada('p-leche', 'Leche', 3, 'lata')] },
    { id: 'f3', mes: '2026-09', lineas: [comprada('p-arroz', 'Arroz', 2), comprada('p-salami', 'Salami', 12, 'rueda')] }
  ]);
  const porClave = Object.fromEntries(filas.map(fila => [fila.clave, fila]));
  assert.equal(porClave['p-leche'].apariciones, 2);
  assert.equal(porClave['p-leche'].totalMeses, 3);
  assert.equal(porClave['p-leche'].frecuencia, 0.67);
  assert.equal(porClave['p-leche'].recomendacion, 'base', 'dos de tres meses ya es costumbre');
  assert.deepEqual(porClave['p-leche'].meses, ['2026-07', '2026-08']);
  assert.equal(porClave['p-salami'].apariciones, 1);
  assert.equal(porClave['p-salami'].recomendacion, 'ocasional', 'uno de tres meses es un antojo');
  assert.equal(porClave['p-arroz'].frecuencia, 1);
  assert.equal(porClave['p-arroz'].recomendacion, 'base');
});

test('dos compras del mismo mes son un mes, no dos', () => {
  // Seis plátanos dos veces en agosto son doce plátanos de agosto: la canasta
  // se escribe por mes, así que se compara mes contra mes.
  const filas = frecuencias([
    { id: 'f1', mes: '2026-08', lineas: [comprada('p-maduro', 'Plátano maduro', 6, 'unidad')] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-maduro', 'Plátano maduro', 6, 'unidad')] },
    { id: 'f3', mes: '2026-09', lineas: [comprada('p-maduro', 'Plátano maduro', 10, 'unidad')] }
  ]);
  assert.equal(filas[0].totalMeses, 2);
  assert.equal(filas[0].apariciones, 2);
  assert.deepEqual(filas[0].cantidades, [12, 10]);
  assert.equal(filas[0].cantidadSugerida, 11);
});

test('sin cantidad legible se cuenta la repetición pero no se inventa el cuánto', () => {
  const filas = frecuencias([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', null)] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', null)] }
  ]);
  assert.equal(filas[0].apariciones, 2, 'que se compró dos meses seguidos sí se sabe');
  assert.deepEqual(filas[0].cantidades, []);
  assert.equal(filas[0].cantidadSugerida, null, 'cuánto se compró, no: se deja en null');
  assert.equal(filas[0].recomendacion, 'base');
});

test('lo descartado y lo ilegible no enseñan nada sobre el hábito', () => {
  const filas = frecuencias([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 2, 'lb', { decision: 'lectura-mala' }), comprada('p-leche', 'Leche', 1, 'lata', { decision: 'no-alimentario' })] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-salami', 'Salami', 12, 'rueda', { decision: 'ignorar' }), comprada('p-maduro', 'Plátano maduro', 6, 'unidad')] }
  ]);
  assert.deepEqual(filas.map(fila => fila.clave), ['p-maduro']);
});

test('las facturas sin mes no cuentan y se avisa en vez de callarlo', () => {
  const propuesta = proponerCanasta([
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f3', mes: null, lineas: [comprada('p-salami', 'Salami', 12, 'rueda')] }
  ]);
  assert.deepEqual(propuesta.base.map(fila => fila.clave), ['p-arroz']);
  assert.deepEqual(propuesta.ocasionales, []);
  assert.ok(propuesta.avisos.some(aviso => /sin mes/.test(aviso)));
});

test('con una sola factura todo sale ocasional y se dice por qué', () => {
  const propuesta = proponerCanasta([
    { id: 'f1', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2), comprada('p-leche', 'Leche', 3, 'lata')] }
  ]);
  assert.deepEqual(propuesta.base, [], 'con un mes no hay repetición que observar');
  assert.equal(propuesta.ocasionales.length, 2);
  for (const fila of propuesta.ocasionales) assert.equal(fila.recomendacion, 'ocasional');
  assert.ok(propuesta.avisos.some(aviso => /hábito/.test(aviso)));
  // Y siempre se recuerda que la cantidad es propuesta, no decisión tomada.
  assert.ok(propuesta.avisos.some(aviso => /confírmalas/.test(aviso)));
  // El mínimo se puede bajar a propósito, y entonces sí hay base.
  const conUno = proponerCanasta([{ id: 'f1', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2)] }], { minimoMeses: 1 });
  assert.deepEqual(conUno.base.map(fila => fila.clave), ['p-arroz']);
});

test('sin facturas no se propone nada y se avisa', () => {
  const propuesta = proponerCanasta([]);
  assert.deepEqual(propuesta.base, []);
  assert.deepEqual(propuesta.ocasionales, []);
  assert.ok(propuesta.avisos.some(aviso => /Todavía no hay facturas/.test(aviso)));
  assert.deepEqual(proponerCanasta().base, []);
});

test('ninguna función toca lo que recibe', () => {
  const facturas = [
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 20), comprada('p-leche', 'Leche', 3, 'lata')] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f3', mes: '2026-09', lineas: [comprada('p-arroz', 'Arroz', 2)] }
  ];
  const extraccion = { fecha: '2026-08-12', establecimiento: 'Nacional', lineas: [leida('PLAT MAD 6 UND', { nombreSugerido: 'Plátano maduro', cantidad: 6, unidad: 'unidad', confianza: 0.42 })] };
  const catalogoAntes = structuredClone(CATALOGO);
  const facturasAntes = structuredClone(facturas);
  const extraccionAntes = structuredClone(extraccion);

  emparejar('PLAT MAD', CATALOGO);
  sugerencias('PLATANO', CATALOGO);
  revisarFactura(extraccion, CATALOGO);
  frecuencias(facturas);
  proponerCanasta(facturas);

  assert.deepEqual(CATALOGO, catalogoAntes, 'el catálogo sale como entró');
  assert.deepEqual(facturas, facturasAntes, 'las facturas salen como entraron');
  assert.deepEqual(extraccion, extraccionAntes, 'la extracción sale como entró');
});

test('la propuesta no aplica nada: solo devuelve números para confirmar', () => {
  const facturas = [
    { id: 'f1', mes: '2026-07', lineas: [comprada('p-arroz', 'Arroz', 2)] },
    { id: 'f2', mes: '2026-08', lineas: [comprada('p-arroz', 'Arroz', 4)] }
  ];
  const propuesta = proponerCanasta(facturas);
  assert.equal(propuesta.base[0].cantidadSugerida, 3);
  // Cambiar la propuesta no puede alterar lo que la generó ni la siguiente.
  propuesta.base[0].cantidadSugerida = 99;
  assert.equal(proponerCanasta(facturas).base[0].cantidadSugerida, 3);
});

test('el ejemplo de la factura fotografiada se revisa entero', () => {
  const revision = revisarFactura({
    fecha: '2026-08-12',
    establecimiento: 'Nacional',
    lineas: [{ textoOriginal: 'PLAT MAD 6 UND', nombreSugerido: 'Plátano maduro', cantidad: 6, unidad: 'unidad', confianza: 0.42 }]
  }, CATALOGO);
  assert.equal(revision.fecha, '2026-08-12');
  assert.equal(revision.establecimiento, 'Nacional');
  const linea = revision.lineas[0];
  assert.equal(linea.textoOriginal, 'PLAT MAD 6 UND', 'lo impreso se conserva para poder comparar con la foto');
  assert.equal(linea.cantidad, 6);
  assert.equal(linea.unidad, 'unidad');
  assert.equal(linea.match.productId, 'p-maduro');
  // 0.42 es una lectura floja: se propone revisarla, no aprobarla.
  assert.equal(linea.confianzaNivel, 'baja');
  assert.equal(linea.decision, 'lectura-mala');
});
