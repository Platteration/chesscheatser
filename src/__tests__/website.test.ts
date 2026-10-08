/**
 * The website layer: what the hosts send and refuse, written once per host (public/_headers for
 * Netlify and Cloudflare Pages, public/.htaccess for Apache, deploy/nginx.conf for nginx) plus the
 * <meta> copy scripts/build-web.mjs puts in every page for GitHub Pages, which sends no headers.
 * A header changed in one of them and not the others is a site that is protected on one host and
 * not on the next, so the values are read back out of every file and compared. The browser suite
 * (e2e/run.mjs) then plays the built site with these headers on every response.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { metaPolicy, OUT_FOLDERS, pageReferences, sitePolicy, underBase, withPolicyMeta } from '../../scripts/build-web.mjs';
import { addHeaderScopes, apacheRefuses, netlifyRefuses, nginxRefuses, nginxSiteServer, parseNginx } from '../../e2e/hosts.mjs';
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
/** What a webroot ACME client writes for a certificate check, which nginx and Apache serve. */
const ACME = '.well-known/acme-challenge/Xb4_kM-0aZ9';
/**
 * What a checkout holds that is never part of the site, should one be published by mistake:
 * every file git tracks, what git, npm and Expo keep beside them, the usual .env files, and the
 * site's own host configs, which the hosts that read them consume rather than serve.
 */
const TRACKED = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const REPOSITORY = [...TRACKED, '.git/config', '.git/HEAD', 'node_modules/expo/package.json', '.expo/settings.json', '.env', '.env.local', '.env.production', '_headers', '_redirects', '.htaccess'];
/** Addresses that are neither, which nginx and Apache, serving the site's paths alone, refuse too. */
const ELSEWHERE = ['no-such-page', 'index.htm', 'index_html', 'dist-web/index.html', '.env.staging', '.well-known/', '.well-known/other.txt', 'assets/', 'assets/assets/fonts/ChessGlyphs.ttf', '_expo/static/js/web/', `_expo/static/js/web/index-${HASH}.js.map`];
const NGINX_TREE = parseNginx(NGINX);

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
    // 'unsafe-inline' is expo-font's runtime @font-face <style>, and only for styles.
    expect(directives.filter((d) => d.includes("'unsafe-inline'"))).toEqual(["style-src 'self' 'unsafe-inline'"]);
    expect(fromHeaders().get('x-frame-options')).toBe('DENY');
  });

  it('puts the same policy in every page as a <meta>, less only what a <meta> cannot carry', () => {
    expect(metaPolicy(policy.csp)).toBe(policy.csp.replace("frame-ancestors 'none'; ", ''));
    const page = withPolicyMeta(read('public/index.html'), policy);
    const metas = [...page.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/g)].map((m) => m[1]);
    expect(metas).toEqual([metaPolicy(policy.csp)]);
    expect(page).toContain(`<meta name="referrer" content="${policy.referrer}" />`);
    // Straight after the charset, before guard.js and the stylesheet it governs.
    const meta = page.indexOf('<meta http-equiv="Content-Security-Policy"');
    expect(meta).toBeLessThan(page.indexOf('<script src="guard.js">'));
    expect(meta).toBeLessThan(page.indexOf('<link rel="stylesheet" href="site.css" />'));
    expect(page.indexOf('<meta charset="utf-8" />')).toBeLessThan(meta);
    // The pages in public/ carry none of their own: the build writes the one copy.
    for (const file of ['public/index.html', 'public/404.html']) expect(read(file)).not.toMatch(/http-equiv="Content-Security-Policy"|name="referrer"/);
  });

  it('documents the policy the hosts send, the permissions policy as it is written', () => {
    expect(read('README.md')).toContain('`' + policy.csp + '`');
    expect(read('README.md')).toContain('`' + fromHeaders().get('permissions-policy') + '`');
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
  it('refuses every file of the repository, dotfiles above all', () => {
    expect(TRACKED.length).toBeGreaterThan(100);
    for (const path of REPOSITORY) {
      expect(nginxRefuses(NGINX_TREE, path), `nginx: ${path}`).toBe(true);
      expect(apacheRefuses(HTACCESS, path), `Apache: ${path}`).toBe(true);
      // Netlify consumes its own two configs rather than serving them.
      if (path !== '_headers' && path !== '_redirects') expect(netlifyRefuses(REDIRECTS, path), `Netlify: ${path}`).toBe(true);
    }
  });

  it('serves the paths of the site and refuses every other address on nginx and Apache', () => {
    for (const path of ELSEWHERE) {
      expect(nginxRefuses(NGINX_TREE, path), `nginx: ${path}`).toBe(true);
      expect(apacheRefuses(HTACCESS, path), `Apache: ${path}`).toBe(true);
    }
    // ...and an asset of a kind the game does not have yet, named by its content as the export names one.
    for (const path of [ACME, `assets/assets/images/board.${HASH}.png`]) {
      expect(nginxRefuses(NGINX_TREE, path), `nginx: ${path}`).toBe(false);
      expect(apacheRefuses(HTACCESS, path), `Apache: ${path}`).toBe(false);
    }
  });

  it('serves every file of the site, the .well-known folder included', () => {
    expect(SITE).toContain('.well-known/security.txt');
    for (const path of SITE) {
      expect(nginxRefuses(NGINX_TREE, path), `nginx: ${path}`).toBe(false);
      expect(apacheRefuses(HTACCESS, path), `Apache: ${path}`).toBe(false);
      expect(netlifyRefuses(REDIRECTS, path), `Netlify: ${path}`).toBe(false);
    }
  });

  it('reads each host the way it reads itself', () => {
    // nginx: an exact location, then a ^~ prefix, then the first regex in file order, then the longest prefix.
    const tree = parseNginx(`server { root /x;
      location = / { try_files /index.html =404; }
      location ^~ /pinned/ { return 404; }
      location ~ "^/[a-z]{3}\\.txt$" { try_files $uri =404; }
      location ~ ^/abc { return 404; }
      location /open/ { try_files $uri =404; }
      location / { return 404; } }`);
    expect(nginxRefuses(tree, '')).toBe(false);
    expect(nginxRefuses(tree, 'pinned/abc.txt')).toBe(true);
    expect(nginxRefuses(tree, 'abc.txt')).toBe(false);
    expect(nginxRefuses(tree, 'abcd.txt')).toBe(true);
    expect(nginxRefuses(tree, 'open/x')).toBe(false);
    expect(nginxRefuses(tree, 'x')).toBe(true);
    expect(() => parseNginx('server { location / { return 404; }')).toThrow(/never closed/);
    // Apache: a negated pattern refuses what it does not match; a rule under a RewriteCond is conditional.
    const htaccess = 'RewriteCond %{HTTPS} !=on\nRewriteRule ^ https://x [R=301,L]\nRewriteCond %{X} y\nRewriteRule ^a$ - [R=404,L]\nRewriteRule !^(a|c/[0-9]+)?$ - [R=404,L]';
    expect(['', 'a', 'c/12', 'b', 'c/x'].map((p) => apacheRefuses(htaccess, p))).toEqual([false, false, false, true, true]);
    // Netlify: an exact path, a splat at the end, a placeholder for one segment.
    const redirects = '# comment\n/a.md  /404.html  404!\n/d/*  /404.html  404!\n/e/:file  /404.html  404!\n/f  /g  301';
    expect(['a.md', 'a.mdx', 'd/x/y', 'e/x', 'e/x/y', 'f'].map((p) => netlifyRefuses(redirects, p))).toEqual([true, false, true, true, false, false]);
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
  });

  it('sets every nginx header at server level, where no location takes them away', () => {
    // nginx drops every server-level add_header from a location that adds one of its own, at
    // whatever depth inside it, and fromNginx() reads only the ones written with `always`.
    const scopes = addHeaderScopes(NGINX_TREE);
    expect(scopes.map((s) => s.header.toLowerCase())).toEqual([...fromNginx().keys(), 'cache-control']);
    for (const { header, scope } of scopes) expect(scope, header).toEqual(['server']);
    // The usual snippet for fonts, added to the assets location after its nested types {} block,
    // is caught however it is written.
    for (const snippet of ['add_header Access-Control-Allow-Origin "*";', 'add_header X-Debug yes;']) {
      const mutated = NGINX.replace(/(audio\/wav wav;\n\s*\}\n\s*try_files \$uri =404;\n)/, `$1        ${snippet}\n`);
      expect(mutated).not.toBe(NGINX);
      expect(addHeaderScopes(parseNginx(mutated)).some((s) => s.scope.length > 1), snippet).toBe(true);
    }
  });

  it('is written for the root of a domain, and offers no sub-path recipe it does not carry out', () => {
    // Every location and cache pattern starts at /, so a sub-path deployment would lose them all.
    const patterns = nginxSiteServer(NGINX_TREE).children.filter((d) => d.name === 'location').map((d) => d.args.at(-1));
    expect(patterns.length).toBeGreaterThan(2);
    for (const p of patterns) expect(p, p).toMatch(/^\^?\//);
    expect(NGINX).toMatch(/serves the site at the root of its domain, and only there/);
    expect(NGINX).not.toMatch(/\balias\b/);
  });
});

describe('the pages', () => {
  const index = read('public/index.html');
  const notFound = read('public/404.html');

  it('loads the safety net first, as a file, before the stylesheet and the bundle Expo adds at the end of the body', () => {
    const scripts = [...index.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!.trim());
    expect(scripts).toEqual(['src="guard.js"']); // no async or defer: it has to listen before the bundle loads
    expect(index.indexOf('<script src="guard.js">')).toBeLessThan(index.indexOf('</head>'));
    // A stylesheet that fails fires its error event once, and only a listener already in place hears it.
    const stylesheets = [...index.matchAll(/<link\b[^>]*rel="stylesheet"/g)].map((m) => m.index);
    expect(stylesheets.length).toBeGreaterThan(0);
    for (const at of stylesheets) expect(index.indexOf('<script src="guard.js">')).toBeLessThan(at);
    expect(index).toMatch(/<noscript>[\s\S]*Two Kings Chess needs JavaScript[\s\S]*<\/noscript>/);
    expect(index).toMatch(/<div id="site-note" class="site-note" role="alert" hidden><\/div>/);
    expect(index).toMatch(/<div id="root"><\/div>/);
  });

  it('writes the safety net in ES5, using nothing in the page newer than IE 9 has', () => {
    // A browser too old for the bundle is one of the things guard.js is for, and one that cannot
    // parse it shows neither the note nor the game: Safari 9 refuses `const` in strict code.
    // The repository's own lint asks for const and let, so guard.js turns no-var off for itself.
    const es5: Linter.Config[] = [
      {
        languageOptions: { ecmaVersion: 5, sourceType: 'script' },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        rules: { 'no-restricted-properties': ['error', { property: 'classList' }, { property: 'hidden' }] },
      },
    ];
    const problems = (source: string) => new Linter().verify(source, es5, 'guard.js').map((m) => `${m.line}:${m.column} ${m.message}`);
    expect(problems(read('public/guard.js'))).toEqual([]);
    // The check reads what it claims to.
    expect(problems("(function () { 'use strict'; const a = 1; })();")).toEqual(["1:30 Parsing error: The keyword 'const' is reserved"]);
    expect(problems('document.documentElement.classList.add("x"); note.hidden = false;')).toHaveLength(2);
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

  /**
   * scripts/build-web.mjs in a sandbox of its own: a copy of the script and of public/ in
   * <tmp>/parent/repo, a folder of someone else's work beside it, and a stand-in for `expo
   * export` that records that it ran and writes what the real one writes (public/ copied with
   * the page filled in, a favicon, metadata.json). The script empties its output folder before
   * the exporter runs, so a guard that let `--output-dir ..` through, tried on the checkout
   * itself, would delete the folder that holds every repository; here it deletes the sandbox.
   */
  function sandbox() {
    const dir = mkdtempSync(join(tmpdir(), 'twokings-build-'));
    const parent = join(dir, 'parent');
    const repo = join(parent, 'repo');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    cpSync(join(root, 'scripts', 'build-web.mjs'), join(repo, 'scripts', 'build-web.mjs'));
    cpSync(join(root, 'public'), join(repo, 'public'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{"name":"sandbox","private":true}');
    writeFileSync(join(repo, 'unpushed.txt'), 'work');
    mkdirSync(join(parent, 'sibling'));
    writeFileSync(join(parent, 'sibling', 'unpushed.txt'), 'work');
    const expo = join(repo, 'node_modules', 'expo', 'bin');
    mkdirSync(expo, { recursive: true });
    writeFileSync(
      join(expo, 'cli'),
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "const out = process.argv[process.argv.indexOf('--output-dir') + 1];",
        "fs.appendFileSync(path.join(process.cwd(), 'exporter-ran.txt'), out + '\\n');",
        "fs.cpSync(path.join(process.cwd(), 'public'), out, { recursive: true });",
        "const page = path.join(out, 'index.html');",
        "fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('%LANG_ISO_CODE%', 'en').replace('%WEB_TITLE%', 'Two Kings Chess'));",
        "fs.mkdirSync(path.join(out, '_expo', 'static', 'js', 'web'), { recursive: true });",
        "fs.writeFileSync(path.join(out, 'favicon.ico'), '');",
        "fs.writeFileSync(path.join(out, 'metadata.json'), '{}');",
      ].join('\n'),
    );
    const run = (...args: string[]) => {
      try {
        execFileSync(process.execPath, [join(repo, 'scripts', 'build-web.mjs'), ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
        return { status: 0, stderr: '' };
      } catch (e) {
        const error = e as { status: number; stderr: Buffer };
        return { status: error.status, stderr: String(error.stderr) };
      }
    };
    const exporterRan = () => (existsSync(join(repo, 'exporter-ran.txt')) ? readFileSync(join(repo, 'exporter-ran.txt'), 'utf8').trim().split('\n') : []);
    const intact = () => existsSync(join(repo, 'unpushed.txt')) && existsSync(join(repo, 'scripts', 'build-web.mjs')) && existsSync(join(parent, 'sibling', 'unpushed.txt'));
    return { dir, parent, repo, run, exporterRan, intact, remove: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('builds into the build folders and into a new or previous build elsewhere', () => {
    expect(OUT_FOLDERS).toEqual(['dist-web', 'dist', 'web-build']);
    for (const folder of OUT_FOLDERS) expect(read('.gitignore')).toMatch(new RegExp(`^${folder}/$`, 'm'));
    const box = sandbox();
    try {
      expect(box.run()).toEqual({ status: 0, stderr: '' });
      expect(box.run('--output-dir', 'web-build', '--host', 'netlify')).toEqual({ status: 0, stderr: '' });
      expect(box.run('--output-dir', join(box.parent, 'site'))).toEqual({ status: 0, stderr: '' });
      writeFileSync(join(box.parent, 'site', 'stale.txt'), 'from the last build');
      expect(box.run('--output-dir', '../site')).toEqual({ status: 0, stderr: '' }); // a previous build, built again
      expect(box.exporterRan()).toEqual([join(box.repo, 'dist-web'), join(box.repo, 'web-build'), join(box.parent, 'site'), join(box.parent, 'site')]);
      expect(existsSync(join(box.parent, 'site', 'stale.txt'))).toBe(false);
      expect(readdirSync(join(box.repo, 'web-build')).filter((f) => CONFIGS.includes(f)).sort()).toEqual(['_headers', '_redirects']);
      expect(box.intact()).toBe(true);
    } finally {
      box.remove();
    }
  });

  it('refuses, before anything is deleted or exported, an output folder that is or holds the checkout, or holds work of its own', () => {
    const box = sandbox();
    try {
      mkdirSync(join(box.repo, 'src'));
      writeFileSync(join(box.repo, 'src', 'game.ts'), 'source');
      symlinkSync(box.parent, join(box.repo, 'dist'));
      const refused = ['.', '..', '../..', 'src', 'public', 'scripts', 'node_modules', 'dist-web/site', 'dist', '../sibling', box.parent, join(box.parent, 'sibling', 'unpushed.txt')];
      for (const out of refused) {
        const result = box.run('--output-dir', out);
        expect(result.status, out).toBe(1);
        expect(result.stderr, out).toMatch(/^build-web: --output-dir: /);
        expect(box.exporterRan(), out).toEqual([]);
        expect(box.intact(), out).toBe(true);
        expect(existsSync(join(box.repo, 'src', 'game.ts')), out).toBe(true);
        expect(existsSync(join(box.repo, 'public', 'index.html')), out).toBe(true);
      }
    } finally {
      box.remove();
    }
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
