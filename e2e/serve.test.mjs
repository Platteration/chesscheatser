import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePath, serve } from './serve.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twokings-serve-'));
const root = path.join(tmp, 'dist-web');
const secret = path.join(tmp, 'secret.txt');
let server;
let origin;

beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>app</title>');
  fs.writeFileSync(path.join(root, 'assets', 'bundle.js'), 'console.log(1)');
  fs.writeFileSync(secret, 'do-not-serve-me');
  server = await serve(root, 0);
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

describe('resolvePath', () => {
  const base = path.resolve(root);

  it('serves files inside the export', () => {
    expect(resolvePath(base, '/index.html')).toBe(path.join(base, 'index.html'));
    expect(resolvePath(base, '/assets/bundle.js?v=2')).toBe(path.join(base, 'assets', 'bundle.js'));
  });

  it('answers anything that climbs out of the export with index.html', () => {
    const index = path.join(base, 'index.html');
    for (const target of ['/../secret.txt', '/../../../../etc/passwd', '/%2e%2e%2fsecret.txt', '/assets/../../secret.txt', '/%00/../secret.txt']) {
      expect(resolvePath(base, target)).toBe(index);
    }
  });

  it('falls back for unknown routes and directories, as the app expects', () => {
    expect(resolvePath(base, '/stats')).toBe(path.join(base, 'index.html'));
    expect(resolvePath(base, '/assets')).toBe(path.join(base, 'index.html'));
    expect(resolvePath(base, '/%ZZ')).toBe(path.join(base, 'index.html'));
  });
});

describe('serve', () => {
  it('listens on loopback only, so nothing on the network can reach the run', () => {
    expect(server.address().address).toBe('127.0.0.1');
  });

  it('serves the export with its content type', async () => {
    const res = await fetch(`${origin}/assets/bundle.js`);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('does not stream a file from outside the export', async () => {
    // fetch() normalises "..", so the traversal is sent percent-encoded — which
    // is exactly how a browser would send it, and the handler decodes it.
    const res = await fetch(`${origin}/%2e%2e%2fsecret.txt`);
    const body = await res.text();
    expect(body).not.toContain('do-not-serve-me');
    expect(body).toContain('<title>app</title>');
  });
});
