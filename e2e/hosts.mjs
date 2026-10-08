// How each host reads the site's config, enough to ask what it does with one path. Test tooling
// only, free of Playwright like serve.mjs: src/__tests__/website.test.ts runs every tracked file
// of the repository through these readers, and e2e/run.mjs every file of a real build.
//
//  - nginx (deploy/nginx.conf): a location is chosen the way nginx chooses one (an exact match,
//    else the longest prefix if it is `^~`, else the first regular expression that matches, else
//    the longest prefix), and a path is refused when that location answers `return 404`.
//  - Apache (public/.htaccess): a `RewriteRule <pattern> - [R=404,L]` with no RewriteCond above
//    it refuses what its pattern matches, or with `!` what it does not; per-directory patterns
//    see the path without its leading slash.
//  - Netlify (public/_redirects): a forced `404!` rule to /404.html refuses its path, where `*` at
//    the end matches anything that follows and a `:name` placeholder matches one segment.

/** @typedef {{ name: string, args: string[], children?: NginxDirective[] }} NginxDirective */

/**
 * One character of a token after a backslash, as nginx copies it: `\"`, `\'` and `\\` lose the
 * backslash, `\t`, `\r` and `\n` become the control character, and any other pair is kept
 * whole, so the `\.` of a regular expression reaches PCRE as written.
 */
const unescape = (next) => (next === '"' || next === "'" || next === '\\' ? next : next === 't' ? '\t' : next === 'r' ? '\r' : next === 'n' ? '\n' : '\\' + next);

/** nginx.conf's words, quoted strings (unquoted) and `{`, `}`, `;`, with comments left out. */
function nginxTokens(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '#') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '{' || c === '}' || c === ';') {
      out.push({ punct: c });
      i++;
    } else if (c === '"' || c === "'") {
      let value = '';
      for (i++; i < text.length && text[i] !== c; i++) value += text[i] === '\\' ? unescape(text[++i]) : text[i];
      if (i >= text.length) throw new Error('nginx.conf: a quote is never closed');
      i++;
      out.push({ word: value });
    } else {
      let value = '';
      for (; i < text.length && !/[\s{};"']/.test(text[i]); i++) value += text[i] === '\\' ? unescape(text[++i]) : text[i];
      out.push({ word: value });
    }
  }
  return out;
}

/**
 * nginx.conf as a tree: every directive `{ name, args }`, and every block also `children`.
 * Throws on a brace or a statement that is not closed, as nginx -t would.
 * @param {string} text
 * @returns {NginxDirective[]}
 */
export function parseNginx(text) {
  const tokens = nginxTokens(text);
  let i = 0;
  /** @type {(inBlock: boolean) => NginxDirective[]} */
  const statements = (inBlock) => {
    const items = [];
    for (;;) {
      if (i >= tokens.length) {
        if (inBlock) throw new Error('nginx.conf: a block is never closed');
        return items;
      }
      if (tokens[i].punct === '}') {
        if (!inBlock) throw new Error('nginx.conf: a } closes nothing');
        i++;
        return items;
      }
      const words = [];
      while (i < tokens.length && tokens[i].word !== undefined) words.push(tokens[i++].word);
      const end = tokens[i++];
      if (!end || !words.length) throw new Error(`nginx.conf: a statement that does not end: ${words.join(' ')}`);
      if (end.punct === ';') items.push({ name: words[0], args: words.slice(1) });
      else if (end.punct === '{') items.push({ name: words[0], args: words.slice(1), children: statements(true) });
      else throw new Error(`nginx.conf: unexpected ${end.punct} after ${words.join(' ')}`);
    }
  };
  return statements(false);
}

/**
 * Where each add_header sits, as the names of the blocks around it (`['server']` for one at
 * server level). nginx drops every add_header a server sets from any location that sets one of
 * its own, so one inside a location, however deep, takes the security headers off what it serves.
 * @param {NginxDirective[]} tree
 * @param {string[]} [around]
 * @returns {{ header: string, scope: string[] }[]}
 */
export function addHeaderScopes(tree, around = []) {
  return tree.flatMap((d) => {
    if (d.name === 'add_header') return [{ header: d.args[0], scope: around }];
    return d.children ? addHeaderScopes(d.children, [...around, d.name]) : [];
  });
}

/**
 * The server block that serves the site: the one with a root.
 * @param {NginxDirective[]} tree
 * @returns {{ name: string, args: string[], children: NginxDirective[] }}
 */
export function nginxSiteServer(tree) {
  const servers = tree.filter((d) => d.name === 'server' && d.children.some((c) => c.name === 'root'));
  if (servers.length !== 1) throw new Error(`nginx.conf: ${servers.length} server blocks with a root, not one`);
  return servers[0];
}

/**
 * The location nginx answers `uri` from, in the server block that serves the site.
 * @param {NginxDirective[]} tree
 * @param {string} uri
 * @returns {NginxDirective | null}
 */
export function nginxLocation(tree, uri) {
  const locations = nginxSiteServer(tree).children.filter((d) => d.name === 'location');
  const parsed = locations.map((d) => {
    const [first, second] = d.args;
    const modifier = d.args.length === 2 ? first : '';
    return { modifier, pattern: d.args.length === 2 ? second : first, location: d };
  });
  const exact = parsed.find((l) => l.modifier === '=' && l.pattern === uri);
  if (exact) return exact.location;
  const prefixes = parsed.filter((l) => (l.modifier === '' || l.modifier === '^~') && uri.startsWith(l.pattern)).sort((a, b) => b.pattern.length - a.pattern.length);
  if (prefixes[0]?.modifier === '^~') return prefixes[0].location;
  const regex = parsed.find((l) => (l.modifier === '~' || l.modifier === '~*') && new RegExp(l.pattern, l.modifier === '~*' ? 'i' : '').test(uri));
  if (regex) return regex.location;
  return prefixes[0]?.location ?? null;
}

/**
 * Whether nginx refuses the site path `path` (no leading slash; '' is the page itself).
 * @param {NginxDirective[]} tree
 * @param {string} path
 */
export function nginxRefuses(tree, path) {
  const location = nginxLocation(tree, '/' + path);
  return !location?.children || location.children.some((d) => d.name === 'return' && d.args[0] === '404');
}

/**
 * Whether Apache, reading `htaccess`, refuses the site path `path`.
 * @param {string} htaccess
 * @param {string} path
 */
export function apacheRefuses(htaccess, path) {
  const lines = htaccess.split('\n').map((l) => l.trim());
  return lines.some((line, i) => {
    const m = /^RewriteRule (\S+) - \[R=404,L\]$/.exec(line);
    if (!m || lines[i - 1]?.startsWith('RewriteCond')) return false;
    const negated = m[1].startsWith('!');
    const matches = new RegExp(negated ? m[1].slice(1) : m[1]).test(path);
    return negated ? !matches : matches;
  });
}

/**
 * Whether Netlify, reading `redirects`, refuses the site path `path`.
 * @param {string} redirects
 * @param {string} path
 */
export function netlifyRefuses(redirects, path) {
  const rules = redirects
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    .filter((f) => f.length === 3 && f[1] === '/404.html' && f[2] === '404!');
  return rules.some(([from]) => {
    const source = from
      .split('/')
      .map((segment, i, all) => (i === all.length - 1 && segment === '*' ? '.*' : segment.startsWith(':') ? '[^/]+' : segment.replace(/[.+?^${}()|[\]\\*]/g, '\\$&')))
      .join('/');
    return new RegExp(`^${source}$`).test('/' + path);
  });
}
