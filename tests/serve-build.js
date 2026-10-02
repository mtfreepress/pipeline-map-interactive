// Test-only static server: reproduce a production /pipeline/ prefix, not an SPA fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(process.env.BUILD_ROOT || '.test-build');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/article') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html lang="en"><title>Embed test</title><body style="margin:0"><iframe title="Pipeline interactive" src="/pipeline/index.html" style="display:block;border:0;width:100vw;height:100vh"></iframe></body></html>');
    return;
  }
  const path = resolve(root, `.${pathname.replace(/^\/pipeline/, '')}`);
  if (!pathname.startsWith('/pipeline/') || !path.startsWith(`${root}/`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const contents = await readFile(path);
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT || 4176), '127.0.0.1');
