import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function safePath(urlPath) {
  const requested = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([.][.][/\\])+/, '');
  return join(root, requested === '/' ? 'index.html' : requested);
}

const server = http.createServer(async (req, res) => {
  try {
    let path = safePath(req.url || '/');
    let info;
    try {
      info = await stat(path);
    } catch {
      path = join(root, 'index.html');
      info = await stat(path);
    }

    if (info.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': extname(path) === '.html' ? 'no-store' : 'public, max-age=300'
    });
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`JUNJA MMORPG V2 listening on :${port}`);
});
