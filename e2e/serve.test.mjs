import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { headersFor, parseHeaders, resolveRequest, serve } from './serve.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twokings-serve-'));
const root = path.join(tmp, 'dist-web');
const secret = path.join(tmp, 'secret.txt');
const HEADERS = [
  '# a comment',
  '/*',
  "  Content-Security-Policy: default-src 'none'",
  '  X-Content-Type-Options: nosniff',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/',
  '  Cache-Control: no-cache',
  '',
].join('\n');
let server;
let origin;

beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, '.well-known'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>app</title>');
  fs.writeFileSync(path.join(root, '404.html'), '<!doctype html><title>not found</title>');
  fs.writeFileSync(path.join(root, 'assets', 'bundle.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, '.well-known', 'security.txt'), 'Contact: x');
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]');
  fs.writeFileSync(path.join(root, '.htaccess'), 'Options -Indexes');
  fs.writeFileSync(path.join(root, '_headers'), HEADERS);
  fs.writeFileSync(path.join(root, '_redirects'), '/x /y 301');
  fs.writeFileSync(secret, 'do-not-serve-me');
  server = await serve(root, 0, { base: '/site/' });
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

describe('resolveRequest', () => {
  const base = path.resolve(root);
  const at = (target) => resolveRequest(base, '/site/', target);
  const notFound = { status: 404, file: path.join(base, '404.html') };

  it('serves files inside the export, under the base', () => {
    expect(at('/site/index.html')).toMatchObject({ status: 200, file: path.join(base, 'index.html'), sitePath: '/index.html' });
    expect(at('/site/assets/bundle.js?v=2')).toMatchObject({ status: 200, file: path.join(base, 'assets', 'bundle.js'), sitePath: '/assets/bundle.js' });
    expect(at('/site/')).toMatchObject({ status: 200, file: path.join(base, 'index.html'), sitePath: '/' });
    expect(at('/site/.well-known/security.txt')).toMatchObject({ status: 200, sitePath: '/.well-known/security.txt' });
  });

  it('sends the base without its slash to the base, as GitHub Pages does', () => {
    expect(at('/site')).toEqual({ status: 301, location: '/site/', sitePath: '/' });
  });

  it('answers anything that climbs out of the export with the 404 page', () => {
    for (const target of ['/site/../secret.txt', '/site/../../../../etc/passwd', '/site/%2e%2e%2fsecret.txt', '/site/assets/../../secret.txt', '/site/%00/../secret.txt', '/site/..%5csecret.txt']) {
      expect(at(target), target).toMatchObject(notFound);
    }
  });

  it('never serves a dotfile but the .well-known folder, nor the host configs', () => {
    for (const target of ['/site/.git/config', '/site/.htaccess', '/site/.well-known', '/site/assets/.hidden', '/site/_headers', '/site/_redirects']) {
      expect(at(target), target).toMatchObject(notFound);
    }
  });

  it('answers a missing page, a bad escape and a folder without an index with the 404 page', () => {
    expect(at('/site/stats')).toMatchObject({ ...notFound, sitePath: '/stats' });
    expect(at('/site/assets')).toMatchObject(notFound);
    expect(at('/site/assets/')).toMatchObject(notFound);
    expect(at('/site/%ZZ')).toMatchObject(notFound);
  });

  it('marks a request outside the base, which the suite fails on', () => {
    expect(at('/')).toMatchObject({ status: 404, outside: true });
    expect(at('/index.html')).toMatchObject({ status: 404, outside: true });
    expect(at('/sitex/index.html')).toMatchObject({ status: 404, outside: true });
  });
});

describe('_headers', () => {
  const rules = parseHeaders(HEADERS);

  it('applies every rule whose path matches, the site-wide one included', () => {
    expect(Object.fromEntries(headersFor(rules, '/assets/bundle.js'))).toEqual({
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    expect(headersFor(rules, '/').get('cache-control')).toBe('no-cache');
    expect(headersFor(rules, '/index.html').get('cache-control')).toBeUndefined();
  });

  it('joins a header two matching rules set, as Cloudflare Pages does, so an overlap shows', () => {
    const overlap = parseHeaders('/*\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: immutable\n');
    expect(headersFor(overlap, '/assets/a.js').get('cache-control')).toBe('no-cache, immutable');
  });

  it('refuses a file it cannot read the way the hosts do', () => {
    expect(() => parseHeaders('  X-A: 1\n')).toThrow(/not a header under a path/);
    expect(() => parseHeaders('assets/*\n  X-A: 1\n')).toThrow(/starts with a path/);
  });
});

describe('serve', () => {
  it('listens on loopback only, so nothing on the network can reach the run', () => {
    expect(server.address().address).toBe('127.0.0.1');
  });

  it('serves the export with its content type and the headers _headers writes', async () => {
    const res = await fetch(`${origin}/site/assets/bundle.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('does not stream a file from outside the export', async () => {
    // fetch() normalises "..", so the traversal is sent percent-encoded — which
    // is exactly how a browser would send it, and the handler decodes it.
    const res = await fetch(`${origin}/site/%2e%2e%2fsecret.txt`);
    const body = await res.text();
    expect(res.status).toBe(404);
    expect(body).not.toContain('do-not-serve-me');
    expect(body).toContain('<title>not found</title>');
    // The 404 page is under the site-wide headers too.
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
  });

  it('does not serve a dotfile or a host config', async () => {
    for (const p of ['.git/config', '.htaccess', '_headers', '_redirects']) {
      const res = await fetch(`${origin}/site/${p}`);
      expect(res.status, p).toBe(404);
      expect(await res.text(), p).toContain('<title>not found</title>');
    }
  });

  it('records what arrives outside the site', async () => {
    const before = server.outside.length;
    const res = await fetch(`${origin}/elsewhere.js`);
    expect(res.status).toBe(404);
    expect(server.outside.slice(before)).toEqual(['/elsewhere.js']);
  });
});
