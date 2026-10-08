/**
 * The website layer: what the hosts send and refuse, written once per host (public/_headers for
 * Netlify and Cloudflare Pages, public/.htaccess for Apache, deploy/nginx.conf for nginx) plus the
 * <meta> copy scripts/build-web.mjs puts in every page for GitHub Pages, which sends no headers.
 * A header changed in one of them and not the others is a site that is protected on one host and
 * not on the next, so the values are read back out of every file and compared. The browser suite
 * (e2e/run.mjs) then plays the built site with these headers on every response.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { metaPolicy, pageReferences, sitePolicy, underBase, withPolicyMeta } from '../../scripts/build-web.mjs';
import { headersFor, parseHeaders } from '../../e2e/serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const nodeRequire = createRequire(import.meta.url);
/** about.ts's, read as text: the module itself loads expo-constants, which needs React Native. */
const SOURCE_URL = /export const SOURCE_URL = '([^']+)';/.exec(read('src/about.ts'))?.[1];

const HEADERS = read('public/_headers');
const HTACCESS = read('public/.htaccess');
const NGINX = read('deploy/nginx.conf');
const REDIRECTS = read('public/_redirects');
const policy = sitePolicy(HEADERS);

/** The security headers each host sends on every response, by lower-case name. */
function fromHeaders(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of headersFor(parseHeaders(HEADERS), '/no-such-file')) out.set(name, value);
  return out;
}
function fromHtaccess(): Map<string, string> {
  const out = new Map<string, string>();
  // The site-wide ones, outside the <FilesMatch> that sets the cache lifetime of hashed names.
  const siteWide = HTACCESS.replace(/<FilesMatch[\s\S]*?<\/FilesMatch>/g, '');
  for (const m of siteWide.matchAll(/^\s*Header always set ([\w-]+) "([^"]*)"/gm)) out.set(m[1]!.toLowerCase(), m[2]!); // both groups are required
  out.delete('cache-control');
  return out;
}
function fromNginx(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of NGINX.matchAll(/^\s*add_header ([\w-]+) "([^"]*)" always;/gm)) out.set(m[1]!.toLowerCase(), m[2]!); // both groups are required
  return out;
}

/** The files public/ puts in every site, by their path in it, less the hosts' own configs. */
function publicFiles(dir = join(root, 'public')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? publicFiles(join(dir, e.name)) : [relative(join(root, 'public'), join(dir, e.name)).split('\\').join('/')],
  );
}
const CONFIGS = ['_headers', '_redirects', '.htaccess'];
const HASH = '0123456789abcdef0123456789abcdef';
/** What the export adds to public/: the bundle and the assets, named by their content. */
const HASHED = [`_expo/static/js/web/index-${HASH}.js`, `assets/assets/fonts/ChessGlyphs.${HASH}.ttf`, `assets/assets/sounds/move.${HASH}.wav`];
/** ...and the favicon, which it makes from app.json's web.favicon. */
const SITE = ['', 'favicon.ico', ...publicFiles().filter((f) => !CONFIGS.includes(f)), ...HASHED];
/** What a checkout holds that is never part of the site, should one be published by mistake. */
const REPOSITORY = ['README.md', '.git/config', '.git/HEAD', '.env', 'deploy/nginx.conf', 'package.json', 'public/index.html', 'src/storage.ts', '_headers', '_redirects', '.htaccess'];

describe('the policy is the same wherever it is written', () => {
  it('sends the same security headers from _headers, .htaccess and nginx.conf', () => {
    const headers = fromHeaders();
    expect([...headers.keys()]).toEqual([
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
      'cross-origin-opener-policy',
      'cross-origin-resource-policy',
      'strict-transport-security',
    ]);
    expect(Object.fromEntries(fromHtaccess())).toEqual(Object.fromEntries(headers));
    expect(Object.fromEntries(fromNginx())).toEqual(Object.fromEntries(headers));
  });

  it('starts from nothing and allows only what the game loads', () => {
    const directives = policy.csp.split('; ');
    expect(directives[0]).toBe("default-src 'none'");
    expect(directives).toContain("script-src 'self'");
    expect(directives).toContain("connect-src 'none'");
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("require-trusted-types-for 'script'");
    // Nothing that runs a string as code, and no host but this one.
    expect(policy.csp).not.toMatch(/unsafe-eval|unsafe-hashes|wasm-unsafe-eval|https?:|\*|data:|blob:/);
    // 'unsafe-inline' is react-native-web's and expo-font's runtime <style> elements, and only for styles.
    expect(directives.filter((d) => d.includes("'unsafe-inline'"))).toEqual(["style-src 'self' 'unsafe-inline'"]);
    expect(fromHeaders().get('x-frame-options')).toBe('DENY');
  });

  it('puts the same policy in every page as a <meta>, less only what a <meta> cannot carry', () => {
    expect(metaPolicy(policy.csp)).toBe(policy.csp.replace("frame-ancestors 'none'; ", ''));
    const page = withPolicyMeta(read('public/index.html'), policy);
    const metas = [...page.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/g)].map((m) => m[1]);
    expect(metas).toEqual([metaPolicy(policy.csp)]);
    expect(page).toContain(`<meta name="referrer" content="${policy.referrer}" />`);
    // Straight after the charset, before the stylesheet and guard.js it governs.
    const meta = page.indexOf('<meta http-equiv="Content-Security-Policy"');
    expect(meta).toBeLessThan(page.indexOf('<link rel="stylesheet" href="site.css" />'));
    expect(page.indexOf('<meta charset="utf-8" />')).toBeLessThan(meta);
    // The pages in public/ carry none of their own: the build writes the one copy.
    for (const file of ['public/index.html', 'public/404.html']) expect(read(file)).not.toMatch(/http-equiv="Content-Security-Policy"|name="referrer"/);
  });

  it('documents the policy the hosts send', () => {
    expect(read('README.md')).toContain('`' + policy.csp + '`');
  });

  it('gives every file one cache lifetime, the same on every host', () => {
    const rules = parseHeaders(HEADERS);
    const filesMatch = new RegExp(/<FilesMatch "([^"]+)">/.exec(HTACCESS)![1]!); // the .htaccess has the one block
    const nginxMap = [...NGINX.matchAll(/^\s+~(\S+)\s+"([^"]+)";$/gm)].map((m) => ({ re: new RegExp(m[1]!), value: m[2]! }));
    const nginxDefault = /^\s+default\s+"([^"]+)";$/m.exec(NGINX)![1]; // the map has a default
    for (const path of SITE) {
      const want = HASHED.includes(path) ? 'public, max-age=31536000, immutable' : 'no-cache';
      expect(headersFor(rules, '/' + path).get('cache-control'), `_headers: /${path}`).toBe(want);
      expect(filesMatch.test(path.split('/').pop()!) ? 'public, max-age=31536000, immutable' : 'no-cache', `.htaccess: /${path}`).toBe(want);
      expect(nginxMap.find((m) => m.re.test('/' + path))?.value ?? nginxDefault, `nginx: /${path}`).toBe(want);
    }
  });
});

describe('the hosts serve the site and nothing else', () => {
  /** nginx: the regex locations that answer 404, which it checks before the catch-all. */
  const nginxRefuses = (path: string) =>
    [...NGINX.matchAll(/^\s*location ~ (\S+) \{ return 404; \}$/gm)].some((m) => new RegExp(m[1]!).test('/' + path));
  /** Apache: the unconditional RewriteRules that answer 404 (no RewriteCond above them). */
  const apacheRefuses = (path: string) =>
    HTACCESS.split('\n')
      .map((line, i, lines) => ({ line: line.trim(), cond: lines[i - 1]?.trim().startsWith('RewriteCond') }))
      .filter(({ line, cond }) => !cond && /^RewriteRule \S+ - \[R=404,L\]$/.test(line))
      .some(({ line }) => new RegExp(line.split(' ')[1]!).test(path));
  /** Netlify: the forced 404 rules, an exact path or a path ending in a splat. */
  const netlifyRefuses = (path: string) =>
    REDIRECTS.split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((f) => f.length === 3 && f[2] === '404!' && f[1] === '/404.html')
      .some(([from]) => (from!.endsWith('/*') ? ('/' + path).startsWith(from!.slice(0, -1)) : '/' + path === from));

  it("refuses the repository's own files, dotfiles above all", () => {
    for (const path of REPOSITORY) {
      expect(nginxRefuses(path), `nginx: ${path}`).toBe(true);
      expect(apacheRefuses(path), `Apache: ${path}`).toBe(true);
      // Netlify consumes its own two configs rather than serving them.
      if (path !== '_headers' && path !== '_redirects') expect(netlifyRefuses(path), `Netlify: ${path}`).toBe(true);
    }
  });

  it('serves every file of the site, the .well-known folder included', () => {
    expect(SITE).toContain('.well-known/security.txt');
    for (const path of SITE) {
      expect(nginxRefuses(path), `nginx: ${path}`).toBe(false);
      expect(apacheRefuses(path), `Apache: ${path}`).toBe(false);
      expect(netlifyRefuses(path), `Netlify: ${path}`).toBe(false);
    }
  });

  it('answers a missing page and a forbidden one with the 404 page, and lists no folder', () => {
    expect(HTACCESS).toMatch(/^Options -Indexes$/m);
    expect(HTACCESS).toMatch(/^ErrorDocument 404 \/404\.html$/m);
    expect(HTACCESS).toMatch(/^ErrorDocument 403 \/404\.html$/m);
    expect(NGINX).toMatch(/^\s+autoindex off;$/m);
    expect(NGINX).toMatch(/^\s+server_tokens off;$/m);
    expect(NGINX).toMatch(/^\s+error_page 404 \/404\.html;$/m);
    expect(NGINX).toMatch(/^\s+error_page 403 =404 \/404\.html;$/m);
    // Plain HTTP is sent to HTTPS on both servers that can.
    expect(NGINX).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
    expect(HTACCESS).toMatch(/RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/);
    // nginx drops every server-level add_header from a location that adds one of its own.
    expect(NGINX.match(/^\s+location[^\n]*\{[^}]*add_header/gm)).toBeNull();
  });
});

describe('the pages', () => {
  const index = read('public/index.html');
  const notFound = read('public/404.html');

  it('loads the safety net first, as a file, before the bundle Expo adds at the end of the body', () => {
    const scripts = [...index.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!.trim());
    expect(scripts).toEqual(['src="guard.js"']); // no async or defer: it has to listen before the bundle loads
    expect(index.indexOf('guard.js')).toBeLessThan(index.indexOf('</head>'));
    expect(index).toMatch(/<noscript>[\s\S]*Two Kings Chess needs JavaScript[\s\S]*<\/noscript>/);
    expect(index).toMatch(/<div id="site-note" class="site-note" role="alert" hidden><\/div>/);
    expect(index).toMatch(/<div id="root"><\/div>/);
  });

  it("keeps everything inline out of the pages, so 'unsafe-inline' stays the runtime's alone", () => {
    for (const page of [index, notFound]) {
      expect(page).not.toMatch(/<style|\sstyle=|<script>|\son[a-z]+=/i);
    }
    expect(notFound).not.toMatch(/<script/);
  });

  it("gives Expo's two placeholders once each, since the CLI fills in only the first of each", () => {
    expect(index.split('%LANG_ISO_CODE%')).toHaveLength(2);
    expect(index.split('%WEB_TITLE%')).toHaveLength(2);
    expect(index.split('</head>')).toHaveLength(2);
    expect(index.split('</body>')).toHaveLength(2);
  });

  it('writes the 404 page from the site root, which a sub-path build moves under its base', () => {
    const refs = pageReferences(notFound, '');
    expect(refs.length).toBeGreaterThan(2);
    for (const ref of refs) {
      expect(ref.url, 'a root-absolute address').toMatch(/^\/(?!\/)/);
      expect(SITE, ref.url).toContain(ref.path === 'index.html' ? '' : ref.path);
    }
    const moved = underBase(notFound, '/chesscheatser');
    expect(pageReferences(moved, '/chesscheatser').map((r) => r.path)).toEqual(refs.map((r) => r.path));
    expect(moved).toContain('href="/chesscheatser/"');
    expect(moved).not.toMatch(/(href|src)="\/(?!chesscheatser\/)/);
  });
});

describe('the build script', () => {
  it('moves root-absolute addresses alone under the base', () => {
    const html = '<a href="/">a</a><link href="/x.css"><a href="//cdn.example/x">b</a><a href="https://example.com/">c</a><img src="y.png"><a href="#top">d</a>';
    expect(underBase(html, '/base')).toBe('<a href="/base/">a</a><link href="/base/x.css"><a href="//cdn.example/x">b</a><a href="https://example.com/">c</a><img src="y.png"><a href="#top">d</a>');
    expect(underBase(html, '')).toBe(html);
  });

  it('finds what a page names inside the site, and what it names outside it', () => {
    const html = '<a href="/base/">a</a><script src="/base/_expo/a.js"></script><link href="site.css"><a href="/other/x">b</a><a href="https://example.com/">c</a>';
    expect(pageReferences(html, '/base')).toEqual([
      { url: '/base/', path: 'index.html' },
      { url: '/base/_expo/a.js', path: '_expo/a.js' },
      { url: 'site.css', path: 'site.css' },
      { url: '/other/x', outside: true },
    ]);
  });

  it('refuses a page it cannot put the policy into, and a page that has one', () => {
    expect(() => withPolicyMeta('<html><head></head></html>', policy)).toThrow(/charset/);
    expect(() => withPolicyMeta(withPolicyMeta(read('public/index.html'), policy), policy)).toThrow(/already carries/);
  });
});

describe('app.config.js', () => {
  const appConfig = nodeRequire('../../app.config.js') as (input: { config: Record<string, unknown> }) => Record<string, unknown>;
  const config = { name: 'Two Kings Chess', experiments: { reactCompiler: false } };
  const withBase = (value: string | undefined) => {
    const saved = process.env.WEB_BASE_URL;
    if (value === undefined) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = value;
    try {
      return appConfig({ config });
    } finally {
      if (saved === undefined) delete process.env.WEB_BASE_URL;
      else process.env.WEB_BASE_URL = saved;
    }
  };

  it('hands app.json over untouched unless a build names a base URL', () => {
    expect(withBase(undefined)).toBe(config);
    expect(withBase('')).toBe(config);
  });

  it('sets the base URL a sub-path build asks for, and nothing else', () => {
    expect(withBase('/chesscheatser')).toEqual({ ...config, experiments: { reactCompiler: false, baseUrl: '/chesscheatser' } });
  });

  it('refuses a base URL that is not a plain path', () => {
    for (const bad of ['chesscheatser', '/chesscheatser/', 'https://example.com', '/a b', '/"><script>']) {
      expect(() => withBase(bad), bad).toThrow(/WEB_BASE_URL/);
    }
  });
});

describe('/.well-known/security.txt', () => {
  const text = read('public/.well-known/security.txt');
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(text)?.[1];

  it("points at this repository's private reporting and its policy", () => {
    expect(field('Contact')).toBe(`${SOURCE_URL}/security/advisories/new`);
    expect(field('Policy')).toBe(`${SOURCE_URL}/blob/HEAD/SECURITY.md`);
    expect(field('Preferred-Languages')).toBe('en');
  });

  it('has not expired: renew Expires (at most a year ahead) when this fails', () => {
    const expires = Date.parse(field('Expires') ?? '');
    expect(expires).toBeGreaterThan(Date.now());
    expect(expires - Date.now()).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
  });
});
