import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
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
    res.writeHead(200, { 'Content-Type': type.startsWith('image/png') ? type : `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(port, () => console.log(`¿Qué comemos? → http://localhost:${port}`));
