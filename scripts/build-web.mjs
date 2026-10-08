#!/usr/bin/env node
// Builds the website: the Expo web export plus the hosting layer in public/, finished for the
// host it is going to.
//
//   node scripts/build-web.mjs [--base-url /chesscheatser] [--output-dir dist-web] [--host <host>]
//
// --base-url  the path the site is served under: /<repo> for a GitHub Pages project site,
//             nothing for a site at the root of its own domain.
// --host      github-pages, netlify, cloudflare, apache or nginx: keep only the config file that
//             host reads (_headers and _redirects for Netlify and Cloudflare Pages, .htaccess for
//             Apache, none for nginx, whose config is deploy/nginx.conf, or for GitHub Pages,
//             which reads none), so the others are not published as files. Without it all
//             three stay, and each host ignores the others'.
//
// `expo export` copies public/ into the site and fills in public/index.html; this then
//  - adds the Content-Security-Policy and referrer <meta> tags to every page, from the policy
//    in public/_headers, so a host that cannot send headers (GitHub Pages) still enforces it.
//    They are added here rather than written into public/index.html because that file is also
//    the dev server's page, and the policy would block its live reload;
//  - points 404.html's addresses and .htaccess's ErrorDocument lines at the base URL, since a
//    not-found page is served at whatever depth the missing address had;
//  - removes metadata.json, which the export writes for EAS Update and no page loads;
//  - and refuses a site in which a page names a file the export does not hold.
//
// The output folder is emptied before the export writes it (the exporter empties it too), so
// --output-dir is checked before anything runs: inside the checkout it is one of OUT_FOLDERS,
// which .gitignore lists; it is never the checkout or a folder that holds it; and a folder
// outside the checkout that already holds files has to be a previous build of this site.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS = {
  'github-pages': [],
  netlify: ['_headers', '_redirects'],
  cloudflare: ['_headers', '_redirects'],
  apache: ['.htaccess'],
  nginx: [],
};
const CONFIGS = ['_headers', '_redirects', '.htaccess'];
/** What every published site holds besides the bundle, whichever host it is for. */
const SITE_FILES = ['index.html', '404.html', 'site.css', 'guard.js', 'favicon.ico', 'robots.txt', '.well-known/security.txt'];
/** The folders inside the checkout the site may be written to: .gitignore lists each one. */
export const OUT_FOLDERS = ['dist-web', 'dist', 'web-build'];

/** Whether `child` is `parent` or lies somewhere below it. */
function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/**
 * Why `out` may not be emptied and written, or null when it may. `root` is the checkout. A
 * folder outside it that already holds something must hold a previous build (its index.html
 * and _expo/), so a mistyped path cannot empty another project or a home folder.
 */
export function outputRefusal(root, out) {
  // Compared as the folders they really are, so a link named dist-web cannot stand for `..`; a
  // folder that does not exist yet is its nearest existing parent's real path plus the rest.
  const real = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(real(path.dirname(p)), path.basename(p)));
  root = real(root);
  out = real(out);
  if (within(out, root)) return `${out} holds the checkout, which the export would empty first`;
  if (within(root, out)) {
    const inside = path.relative(root, out).split(path.sep).join('/');
    return OUT_FOLDERS.includes(inside) ? null : `inside the checkout the output folder is one of ${OUT_FOLDERS.join(', ')}, which the export empties first; not ${inside}`;
  }
  if (!fs.existsSync(out)) return null;
  if (!fs.statSync(out).isDirectory()) return `${out} is a file, not a folder`;
  const entries = fs.readdirSync(out);
  if (entries.length === 0 || (entries.includes('index.html') && entries.includes('_expo'))) return null;
  return `${out} already holds files that are not a build of this site, and the export empties it first: name a new or empty folder, or a previous build`;
}

/** The policy and the referrer policy, as public/_headers writes them for every path. */
export function sitePolicy(headersText) {
  const block = /^\/\*\n((?:[ \t]+.*\n?)*)/m.exec(headersText);
  if (!block) throw new Error('public/_headers has no /* rule');
  const value = (name) => {
    const m = new RegExp(`^[ \\t]+${name}:[ \\t]*(.+)$`, 'mi').exec(block[1]);
    if (!m) throw new Error(`public/_headers sets no ${name} for /*`);
    return m[1].trim();
  };
  return { csp: value('Content-Security-Policy'), referrer: value('Referrer-Policy') };
}

/**
 * The policy as a <meta> tag can carry it. A browser ignores frame-ancestors there and says so
 * in the console, so it is left out: framing is refused by the header alone, on the hosts that
 * can send one.
 */
export function metaPolicy(csp) {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^frame-ancestors\b/.test(d))
    .join('; ');
}

/** `html` with the two <meta> tags added straight after `<meta charset>`, before anything they govern. */
export function withPolicyMeta(html, { csp, referrer }) {
  const charset = /<meta charset="utf-8"\s*\/?>/i;
  if (!charset.test(html)) throw new Error('a page without <meta charset="utf-8"> to put the policy after');
  if (/http-equiv="Content-Security-Policy"/i.test(html)) throw new Error('the page already carries a policy');
  const tags = `<meta http-equiv="Content-Security-Policy" content="${metaPolicy(csp)}" />\n    <meta name="referrer" content="${referrer}" />`;
  return html.replace(charset, (m) => `${m}\n    ${tags}`);
}

/** Every root-absolute href and src in `html` moved under `base` ('' leaves them as they are). */
export function underBase(html, base) {
  return base ? html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`) : html;
}

/** The addresses a page names that resolve inside the site, as paths relative to its root. */
export function pageReferences(html, base) {
  const refs = [];
  for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) continue;
    let p = url.split(/[?#]/)[0];
    if (p.startsWith('/')) {
      if (base && !p.startsWith(base + '/')) {
        refs.push({ url, outside: true });
        continue;
      }
      p = p.slice(base.length + 1);
    }
    refs.push({ url, path: p === '' ? 'index.html' : p.endsWith('/') ? `${p}index.html` : p });
  }
  return refs;
}

function args(argv) {
  const out = { baseUrl: '', outputDir: 'dist-web', host: null };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = inline ?? argv[++i];
    if (flag === '--base-url') out.baseUrl = value.replace(/\/+$/, '');
    else if (flag === '--output-dir') out.outputDir = value;
    else if (flag === '--host') out.host = value;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (out.baseUrl && !/^(\/[A-Za-z0-9._~-]+)+$/.test(out.baseUrl)) throw new Error(`--base-url is a path such as /chesscheatser: ${out.baseUrl}`);
  if (out.host !== null && !Object.hasOwn(HOSTS, out.host)) throw new Error(`--host is one of ${Object.keys(HOSTS).join(', ')}: ${out.host}`);
  return out;
}

function build({ baseUrl, outputDir, host }) {
  const out = path.resolve(ROOT, outputDir);
  const refusal = outputRefusal(ROOT, out);
  if (refusal) throw new Error(`--output-dir: ${refusal}`);
  fs.rmSync(out, { recursive: true, force: true });
  const run = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', out], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CI: process.env.CI || '1', WEB_BASE_URL: baseUrl },
  });
  if (run.status !== 0) throw new Error(`expo export failed (${run.status ?? run.signal})`);

  for (const f of SITE_FILES) {
    if (!fs.existsSync(path.join(out, f))) throw new Error(`the export has no ${f}: is public/ complete?`);
  }
  const policy = sitePolicy(fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8'));
  const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const file = path.join(out, page);
    let html = fs.readFileSync(file, 'utf8');
    // index.html is Expo's, whose addresses already carry the base; 404.html is copied as written.
    if (page !== 'index.html') html = underBase(html, baseUrl);
    fs.writeFileSync(file, withPolicyMeta(html, policy));
  }
  const htaccess = path.join(out, '.htaccess');
  if (fs.existsSync(htaccess) && baseUrl) {
    fs.writeFileSync(htaccess, fs.readFileSync(htaccess, 'utf8').replace(/^(ErrorDocument \d+ )\//gm, `$1${baseUrl}/`));
  }
  fs.rmSync(path.join(out, 'metadata.json'), { force: true });
  if (host !== null) {
    for (const f of CONFIGS) if (!HOSTS[host].includes(f)) fs.rmSync(path.join(out, f), { force: true });
  }

  const missing = [];
  for (const page of pages) {
    for (const ref of pageReferences(fs.readFileSync(path.join(out, page), 'utf8'), baseUrl)) {
      if (ref.outside || !fs.existsSync(path.join(out, ref.path))) missing.push(`${page}: ${ref.url}`);
    }
  }
  if (missing.length) throw new Error(`pages name files the site does not hold:\n  ${missing.join('\n  ')}`);
  console.log(`Website: ${path.relative(ROOT, out) || '.'} for ${host ?? 'any host'}${baseUrl ? ` under ${baseUrl}/` : ' at the root'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build(args(process.argv.slice(2)));
  } catch (e) {
    console.error(`build-web: ${e.message}`);
    process.exit(1);
  }
}
