// Stands in for the host the exported web build is published on. Test tooling only: it is
// never bundled into the app, and it is kept apart from lib.mjs so it can be tested without
// pulling in Playwright.
//
// It answers the way the hosts in public/ are configured to: the site is served under a
// sub-path (as GitHub Pages serves a project site), every response carries the headers the
// site's own `_headers` file writes for that path (as Netlify and Cloudflare Pages send
// them), a dotfile other than /.well-known/ and the host's own config files are not served,
// and anything missing is 404.html with status 404. So a policy that blocks something the
// app really loads, a file the page names that the export does not hold, and a request that
// leaves the site all show up in the browser suite rather than on the host.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
};

/** The site's own config files, which the hosts that read them consume rather than serve. */
const HOST_FILES = new Set(['_headers', '_redirects']);

/**
 * `_headers` as Netlify and Cloudflare Pages read it: a line starting with `/` opens a rule
 * for that path (`*` matches any run of characters), and the indented `Name: value` lines
 * under it are its headers. `#` starts a comment line.
 */
export function parseHeaders(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) throw new Error(`_headers: a rule starts with a path: ${line}`);
      const pattern = new RegExp('^' + line.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      rules.push({ path: line, pattern, headers: [] });
      continue;
    }
    const m = /^\s+([A-Za-z0-9-]+):\s*(.+)$/.exec(line);
    if (!m || !rules.length) throw new Error(`_headers: not a header under a path: ${line}`);
    rules.at(-1).headers.push([m[1], m[2]]);
  }
  return rules;
}

/**
 * The headers a request for `sitePath` gets: those of every rule whose path matches, in file
 * order. A header two matching rules both set is sent once with the values joined by ", ",
 * which is what Cloudflare Pages documents doing; a test that reads one value back therefore
 * fails on an overlap rather than sending two contradicting values unnoticed.
 */
export function headersFor(rules, sitePath) {
  const out = new Map();
  for (const rule of rules) {
    if (!rule.pattern.test(sitePath)) continue;
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? `${out.get(key)}, ${value}` : value);
    }
  }
  return out;
}

/**
 * What the host answers for a request path, as `{ status, file, sitePath, location }`.
 * `base` is the sub-path the site lives under ('/' or '/name/'); `root` the export.
 * Everything that is not a file of the site, including `..` in any spelling, gets the 404
 * page: without the containment check `path.resolve` normalises the `..` away and streams
 * any file the process can read.
 */
export function resolveRequest(root, base, target) {
  const notFound = (sitePath) => ({ status: 404, file: path.join(root, '404.html'), sitePath });
  let decoded;
  try {
    decoded = decodeURIComponent(target.split('?')[0].split('#')[0]);
  } catch {
    return notFound('/');
  }
  if (base !== '/' && decoded === base.slice(0, -1)) return { status: 301, location: base, sitePath: '/' };
  if (!decoded.startsWith(base)) return { status: 404, outside: true, sitePath: decoded };
  const rel = decoded.slice(base.length);
  const sitePath = '/' + rel;
  if (decoded.includes('\0') || decoded.includes('\\')) return notFound(sitePath);
  const segments = rel.split('/');
  // A dotfile is never part of the site (.git above all), except the folder RFC 9116 and
  // certificate challenges use; `..` is a dotted segment too.
  if (segments.some((s, i) => s.startsWith('.') && !(i === 0 && s === '.well-known' && segments.length > 1))) return notFound(sitePath);
  if (segments.length === 1 && HOST_FILES.has(segments[0])) return notFound(sitePath);
  let file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return notFound(sitePath);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    // A folder is its index page if it has one, and otherwise nothing: no listing.
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(sitePath);
  return { status: 200, file, sitePath };
}

/**
 * Serves the export at `root` under `base` on `port`, loopback only (nothing on the network
 * sees it). `server.outside` lists every request that arrived for a path outside the site.
 */
export function serve(root, port, { base = '/' } = {}) {
  const site = path.resolve(root);
  const headersFile = path.join(site, '_headers');
  const rules = fs.existsSync(headersFile) ? parseHeaders(fs.readFileSync(headersFile, 'utf8')) : [];
  const outside = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const answer = resolveRequest(site, base, req.url || '/');
    if (answer.outside) {
      outside.push(req.url);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('outside the site');
      return;
    }
    for (const [name, value] of headersFor(rules, answer.sitePath)) res.setHeader(name, value);
    if (answer.status === 301) {
      res.writeHead(301, { Location: answer.location });
      res.end();
      return;
    }
    if (!fs.existsSync(answer.file)) {
      res.writeHead(answer.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.statusCode = answer.status;
    res.setHeader('Content-Type', TYPES[path.extname(answer.file)] || 'application/octet-stream');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(answer.file);
    // Without this an unreadable path emits an unhandled 'error' and takes the whole run
    // down instead of failing one request.
    stream.on('error', () => {
      res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
  });
  server.outside = outside;
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
