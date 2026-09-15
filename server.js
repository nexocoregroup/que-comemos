import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.apk': 'application/vnd.android.package-archive' };

// Tres cabeceras que el <meta> de index.html no puede poner por sí solo.
//
// `frame-ancestors` es la única forma real de impedir que otra página meta esta
// app dentro de un marco invisible y engañe a alguien para que pulse encima de
// lo que no ve; en un <meta> el navegador la ignora, así que tiene que viajar
// como cabecera. Las otras dos cuestan una línea y cierran dos descuidos
// clásicos: que el navegador adivine el tipo de un archivo, y que la dirección
// completa de la página viaje a sitios ajenos.
const CABECERAS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filename = resolve(join(root, pathname === '/' ? 'index.html' : pathname.slice(1)));
    if (filename !== root && !filename.startsWith(root + sep)) throw new Error('Ruta no permitida');
    let info = await stat(filename);
    // Una carpeta sirve su index.html, como hacen los hosts estáticos.
    if (info.isDirectory()) { filename = join(filename, 'index.html'); info = await stat(filename); }
    if (!info.isFile()) throw new Error('Archivo no encontrado');
    const extension = filename.slice(filename.lastIndexOf('.'));
    const type = types[extension] || 'application/octet-stream';
    // El charset solo se declara en los formatos de texto. Omitirlo en un SVG
    // con acentos los rompe; ponerlo en un PNG, una fuente o un APK es ruido
    // que algunos gestores de descarga de Android interpretan mal.
    const textual = type.startsWith('text/') || type === 'image/svg+xml' || type === 'application/json' || type === 'application/manifest+json';
    res.writeHead(200, { 'Content-Type': textual ? `${type}; charset=utf-8` : type, 'Cache-Control': 'no-store', ...CABECERAS });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(port, () => console.log(`¿Qué comemos? → http://localhost:${port}`));
