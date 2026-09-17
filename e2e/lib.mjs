// Shared helpers for the end-to-end suite (web build driven by Playwright).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.json': 'application/json', '.png': 'image/png' };

export function serve(root, port) {
  const rootPath = path.resolve(root);
  const server = http.createServer((req, res) => {
    let pathname = req.url?.split('?')[0] ?? '/';
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // If decoding fails, keep the raw URL segment and keep going.
    }
    const safePath = pathname.replace(/^\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(rootPath, safePath || '.');
    const isInsideRoot = resolved === rootPath || resolved.startsWith(rootPath + path.sep);
    let p = isInsideRoot ? resolved : path.join(rootPath, 'index.html');
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export async function launch() {
  const executablePath = process.env.PW_CHROMIUM || undefined;
  return chromium.launch({ executablePath });
}

/**
 * Diagnostics for the runner. Playwright's own error names the locator it
 * waited on; this adds which helper was running and what the app showed at
 * that moment, so a timeout in CI says *why* the click could not land.
 */
let activePage = null;
let activeHelper = null;
export const currentPage = () => activePage;
export const currentHelper = () => activeHelper;
const enter = (name) => {
  activeHelper = name;
};
const leave = () => {
  activeHelper = null;
};

/** One line describing the game screen: status, busy flag, overlays, disabled controls. */
export async function describeApp(page) {
  if (!page || page.isClosed()) return 'page closed';
  try {
    return await page.evaluate(() => {
      const txt = (el) => (el?.textContent || '').trim();
      const all = [...document.querySelectorAll('*')];
      const status = all.find((el) => el.children.length === 0 && /to move|thinking|extra move|Busted|Caught cheating|was legal|wins by|Draw by|Solved/.test(txt(el)));
      const overlays = [];
      if (document.querySelector('[data-testid="power-draft"]')) overlays.push('power-draft');
      for (const t of ['Two kings, one rule', 'Random armies, one rule', 'Promote to', 'Bring back', 'Arrive as a queen?', 'Rematch']) {
        if (all.some((el) => el.children.length === 0 && txt(el) === t)) overlays.push(t);
      }
      const busy = document.querySelectorAll('[aria-busy="true"]').length;
      const disabled = [...document.querySelectorAll('[aria-disabled="true"]')].map(txt).filter((t) => t && t.length < 24);
      return `status=${JSON.stringify(status ? txt(status) : null)} busy=${busy} overlays=[${overlays.join(', ')}] disabled=[${disabled.join(', ')}]`;
    });
  } catch (e) {
    return 'unavailable: ' + (e.message || e).toString().split('\n')[0];
  }
}

/** Fresh page at the app root with console/page errors collected. */
export async function openApp(browser, url, viewport = { width: 390, height: 844 }, { intro = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (!intro) {
    // Skip the one-time explanation unless a scenario wants to test it.
    await context.addInitScript(() => {
      try {
        if (!localStorage.getItem('twokings.appsettings.v1')) {
          localStorage.setItem('twokings.appsettings.v1', JSON.stringify({ seenIntro: true }));
        }
      } catch {}
    });
  }
  const page = await context.newPage();
  activePage = page;
  activeHelper = null;
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(url);
  await page.waitForTimeout(800);
  return { page, context, errors };
}

/** Child-element count per board square, used to detect legal-move markers. */
export const cellCounts = (page) =>
  page.$$eval('[aria-label]', (els) => {
    const out = {};
    for (const el of els) {
      const l = el.getAttribute('aria-label') || '';
      const m = /^([a-h][1-8])(,|$)/.exec(l);
      if (m) out[m[1]] = el.childElementCount;
    }
    return out;
  });

/**
 * The comeback draft opens at the *start* of a turn rather than after a tap, and
 * blocks play until answered, so every wait has to be able to clear it.
 * Takes the first offered power. Returns true if a draft was answered.
 */
let draftsSettled = 0;
/** How many drafts the helpers have answered; scenarios read this instead of racing the modal. */
export const draftCount = () => draftsSettled;
export const resetDraftCount = () => {
  draftsSettled = 0;
};

export async function settleDraft(page) {
  const options = page.locator('[data-testid="power-option"]');
  if ((await options.count()) === 0) return false;
  await options.first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(150);
  draftsSettled++;
  return true;
}

/**
 * Waits until a human can act: the computer has moved, the comeback draft for
 * the new turn has been measured (and answered here if one was offered), and
 * nothing is left thinking. The game screen marks its status box `aria-busy`
 * for exactly that window; the status text is read as well, as a second signal.
 *
 * The draft is measured *after* the computer's move paints, in a timeout plus
 * a short search, so "Computer is thinking" vanishing is not enough: a draft
 * modal could still open under the next click and swallow it.
 *
 * Throws instead of returning quietly, otherwise the next click on a disabled
 * or covered control turns into an opaque 30 s Playwright timeout.
 */
export async function waitHuman(page, ms = 30000) {
  enter('waitHuman');
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await settleDraft(page);
    const busy = await page.locator('[aria-busy="true"]').count();
    const thinking = await page.locator('text=/Computer is thinking|takes its extra move|Opponent is defending/').count();
    if (!busy && !thinking && !(await page.locator('[data-testid="power-draft"]').count())) {
      leave();
      return;
    }
    await page.waitForTimeout(100);
  }
  leave();
  throw new Error(`waitHuman: the human never got the move within ${ms}ms (${await describeApp(page)})`);
}

export const gameOver = (page) => page.locator('text=/Rematch/').count().then((n) => n > 0);

/**
 * Resolves any picker the app may have opened after a tap: pawn promotion
 * (queen), the optional "arrive as a queen" upgrade ("Just move"), or the
 * "Bring back" resurrect picker (first piece). Returns true if a picker was
 * answered in a way that completes a move.
 */
async function settlePicker(page) {
  await page.waitForTimeout(120);
  if (await settleDraft(page)) return false; // a draft is not a move; the caller retries
  if (await page.getByText('Just move', { exact: true }).count()) {
    await page.getByText('Just move', { exact: true }).click();
    return true;
  }
  for (const title of ['Promote to', 'Bring back']) {
    if (await page.getByText(title, { exact: true }).count()) {
      await page.locator(`text=${title}`).locator('..').locator('div').nth(2).click().catch(() => {});
      return true;
    }
  }
  return false;
}

/** Plays some legal move for the side to move by probing squares for markers. */
export async function makeAnyMove(page) {
  // A pending draft blocks every move, and a move tapped before the turn's
  // draft has been recorded is silently dropped, so wait for the turn proper.
  await waitHuman(page);
  enter('makeAnyMove');
  const base = await cellCounts(page);
  for (const label of Object.keys(base)) {
    await sq(page, label).click();
    if (await settlePicker(page)) {
      leave();
      return true; // an empty home square opened the resurrect picker
    }
    await page.waitForTimeout(30);
    const now = await cellCounts(page);
    const targets = Object.keys(now).filter((l) => l !== label && now[l] > base[l]);
    if (targets.length) {
      await sq(page, targets[Math.floor(Math.random() * targets.length)]).click({ timeout: 3000 });
      await settlePicker(page);
      await page.waitForTimeout(200);
      leave();
      return true;
    }
    await sq(page, label).click().catch(() => {});
  }
  leave();
  return false;
}

/** Locator for a board square by name; labels read "e2" or "e2, white pawn". */
export const sq = (page, name) => page.locator(`[aria-label="${name}"], [aria-label^="${name},"]`).first();

export async function clickSquares(page, from, to) {
  await settleDraft(page);
  enter(`clickSquares ${from}-${to}`);
  await sq(page, from).click();
  await page.waitForTimeout(100);
  await sq(page, to).click();
  await page.waitForTimeout(300);
  leave();
}

export const text = (page, re) => page.locator(`text=${re}`).first().textContent().catch(() => null);
export const exact = (page, t) => page.getByText(t, { exact: true });

/** Buys the Supporter tier through the mock store, unlocking every cosmetic. */
export async function unlockPro(page) {
  await exact(page, 'Support the game').click();
  await page.waitForTimeout(300);
  await page.locator('text=/Unlock everything/').click();
  await page.waitForTimeout(300);
  await page.getByText('‹ Back').click();
  await page.waitForTimeout(300);
}

export function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
