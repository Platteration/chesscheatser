// Static file server for the exported web build. Test tooling only: it is never
// bundled into the app. Kept apart from lib.mjs so it can be tested without
// pulling in Playwright.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.png': 'image/png',
};

/**
 * Resolves a request target inside `base`. Everything else — `..` segments,
 * their percent-encoded forms, an absolute path — falls back to the app's
 * index.html, the same answer an unknown route already gets. Without the
 * containment check `path.join` normalises the `..` away and happily streams
 * any file the process can read.
 */
export function resolvePath(base, target) {
  let decoded;
  try {
    decoded = decodeURIComponent(target.split('?')[0]);
  } catch {
    decoded = '';
  }
  const index = path.join(base, 'index.html');
  if (decoded.includes('\0')) return index;
  const p = path.resolve(base, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  if (p !== base && !p.startsWith(base + path.sep)) return index;
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return index;
  return p;
}

/** Serves `root` on `port`, loopback only (nothing on the network sees it). */
export function serve(root, port) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const p = resolvePath(base, req.url || '/');
    res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    const stream = fs.createReadStream(p);
    // Without this an unreadable path emits an unhandled 'error' and takes the
    // whole run down instead of failing one request.
    stream.on('error', () => {
      res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
