import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Dos veces en el mismo día la aplicación dejó de arrancar por lo mismo: un
// módulo importaba algo que no existía, o que había cambiado de forma. Ninguna
// prueba lo vio, porque todas prueban lógica y ninguna importa las pantallas
// —que tocan el DOM y no se pueden cargar en Node—.
//
// El fallo, además, es de los peores: no da error al guardar, no lo caza
// `node --check`, y en el navegador tumba la app entera con una pantalla en
// blanco. Se descubre abriendo la app, que es justo lo que uno no hace después
// de un cambio pequeño.
//
// Estas pruebas no ejecutan las pantallas: leen sus importaciones y comprueban
// que apuntan a algo real. Es barato, corre en Node y caza exactamente esa
// clase de error.

const SRC = resolve(import.meta.dirname, '..', 'src');
const archivos = readdirSync(SRC).filter(nombre => nombre.endsWith('.js'));

// Los comentarios se quitan antes de mirar: este archivo habla de imports en
// sus propios comentarios, y `kind === 'import'` es una cadena que se parece
// demasiado a una importación. Buscar a lo bruto daba seis falsos positivos.
const sinComentarios = codigo => codigo
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const importaciones = archivo => {
  const codigo = sinComentarios(readFileSync(resolve(SRC, archivo), 'utf8'));
  const encontradas = [
    // `import … from './x.js'`
    ...[...codigo.matchAll(/(?:^|[\s;}])import\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map(fila => fila[1]),
    // `import './x.js'` a secas, por su efecto
    ...[...codigo.matchAll(/(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g)].map(fila => fila[1]),
    // `import('./x.js')`
    ...[...codigo.matchAll(/(?:^|[\s;=(,])import\s*\(\s*['"]([^'"]+)['"]/g)].map(fila => fila[1])
  ];
  return [...new Set(encontradas)];
};

test('todos los módulos de src/ existen', () => {
  assert.ok(archivos.length > 10, 'debería haber módulos que comprobar');
});

test('cada importación relativa apunta a un archivo que existe', () => {
  const rotas = [];
  for (const archivo of archivos) {
    for (const ruta of importaciones(archivo)) {
      if (!ruta.startsWith('.')) continue;
      const destino = resolve(dirname(resolve(SRC, archivo)), ruta);
      if (!existsSync(destino)) rotas.push(`${archivo} → ${ruta}`);
    }
  }
  assert.deepEqual(rotas, [], 'importaciones que no resuelven');
});

test('ningún módulo importa un paquete de npm', () => {
  // No hay empaquetador: un `import '@capgo/…'` en el navegador tumba la app.
  // Los complementos nativos se leen de `window.Capacitor.Plugins`, que además
  // es la comprobación de disponibilidad más honesta que hay.
  const culpables = [];
  for (const archivo of archivos) {
    for (const ruta of importaciones(archivo)) {
      if (ruta.startsWith('.') || ruta.startsWith('/') || ruta.startsWith('node:')) continue;
      culpables.push(`${archivo} → ${ruta}`);
    }
  }
  assert.deepEqual(culpables, [], 'importaciones de paquetes que el navegador no sabe resolver');
});

test('lo que se importa de otro módulo está de verdad exportado', () => {
  // El otro fallo del día: `toolSchemas()` cambió de forma y su consumidor
  // siguió leyendo las claves viejas. Esto no llega a comprobar las claves de
  // un objeto devuelto, pero sí que el nombre importado exista.
  const exportacionesDe = archivo => {
    const codigo = readFileSync(resolve(SRC, archivo), 'utf8');
    const nombres = new Set();
    for (const fila of codigo.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) nombres.add(fila[1]);
    // `export { a, b as c }` y `export { x } from './y.js'`
    for (const fila of codigo.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const trozo of fila[1].split(',')) {
        const partes = trozo.trim().split(/\s+as\s+/);
        const nombre = (partes[1] || partes[0]).trim();
        if (nombre) nombres.add(nombre);
      }
    }
    return nombres;
  };

  const rotas = [];
  for (const archivo of archivos) {
    const codigo = readFileSync(resolve(SRC, archivo), 'utf8');
    for (const fila of codigo.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const destino = fila[2].replace(/^\.\//, '');
      if (!archivos.includes(destino)) continue;
      const disponibles = exportacionesDe(destino);
      for (const trozo of fila[1].split(',')) {
        const nombre = trozo.trim().split(/\s+as\s+/)[0].trim();
        if (nombre && !disponibles.has(nombre)) rotas.push(`${archivo} importa «${nombre}» de ${destino}, que no lo exporta`);
      }
    }
  }
  assert.deepEqual(rotas, []);
});

test('el casco del trabajador de servicio nombra todos los módulos de src/', () => {
  // Si un archivo falta aquí, la app instalada arranca hasta que se queda sin
  // conexión, y entonces no encuentra el módulo. Es un fallo que solo aparece
  // sin red, que es cuando menos se puede diagnosticar.
  const sw = readFileSync(resolve(import.meta.dirname, '..', 'sw.js'), 'utf8');
  const casco = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  const faltan = archivos.filter(archivo => !casco.includes(`./src/${archivo}`));
  assert.deepEqual(faltan, [], 'módulos que no se guardan para el modo sin conexión');
  const repetidos = [...casco.matchAll(/'(\.\/[^']+)'/g)].map(fila => fila[1]);
  assert.equal(repetidos.length, new Set(repetidos).size, 'hay archivos repetidos en el casco');
});

test('las hojas de estilo del index están en el casco, y sin repetirse', () => {
  const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
  const hojas = [...html.matchAll(/href="(src\/[^"]+\.css)"/g)].map(fila => fila[1]);
  assert.equal(hojas.length, new Set(hojas).size, 'hay hojas de estilo repetidas en index.html');
  const sw = readFileSync(resolve(import.meta.dirname, '..', 'sw.js'), 'utf8');
  const faltan = hojas.filter(hoja => !sw.includes(`./${hoja}`));
  assert.deepEqual(faltan, [], 'hojas de estilo que no se guardan para el modo sin conexión');
});
