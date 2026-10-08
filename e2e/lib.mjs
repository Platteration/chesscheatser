// Shared helpers for the end-to-end suite (web build driven by Playwright).
import { chromium } from 'playwright';

export { serve } from './serve.mjs';

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

/**
 * Collects on `page` everything that says the site, as published, does not work: an uncaught
 * error, a console error, any console line about the security policy, the permissions policy
 * or Trusted Types at whatever level the browser logs it, a `securitypolicyviolation` event
 * (`watchPolicy` must have run on the context), and any request that leaves the site at
 * `site`, the page's own address included in that prefix. Returns the list it fills.
 */
export function collectFailures(page, site) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Content-Security-Policy|Permissions-Policy|Trusted Type|policy violation/i.test(m.text())) {
      errors.push(`console ${m.type()}: ${m.text()}`);
    }
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(site)) errors.push('request outside the site: ' + r.url());
  });
  return errors;
}

/** Reports every CSP violation in the context's pages as a console error, which collectFailures reads. */
export async function watchPolicy(context) {
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`policy violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });
}

/**
 * Fresh page at the app root with console/page errors, policy violations and requests outside
 * the site collected; `url` is the site's own address, so it is also the prefix every request
 * has to stay under.
 */
export async function openApp(browser, url, viewport = { width: 390, height: 844 }, { intro = false, storage = null, permissions = [] } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, permissions });
  await watchPolicy(context);
  if (storage) {
    // Records already on the device when the app opens, for scenarios about what
    // it does with what it finds there.
    await context.addInitScript((records) => {
      try {
        for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
      } catch {}
    }, storage);
  }
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
  const errors = collectFailures(page, url);
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

/**
 * The whole board read back from the square labels: `{ e2: {color, type}, e4: null }`.
 * The accessibility labels are the only description of the position the page
 * offers, which is the point — a scenario that can read them can steer a game
 * rather than shuffle pieces at random.
 */
export const readBoard = (page) =>
  page.$$eval('[aria-label]', (els) => {
    const out = {};
    for (const el of els) {
      const m = /^([a-h][1-8])(?:, (white|black) (\w+))?$/.exec(el.getAttribute('aria-label') || '');
      if (m) out[m[1]] = m[2] ? { color: m[2], type: m[3] } : null;
    }
    return out;
  });

/**
 * Where the piece on `from` may go, by selecting it and seeing which squares
 * gain a marker. Leaves the piece selected, so the caller either clicks one of
 * the targets or clicks `from` again to put the selection back.
 */
export async function targetsFrom(page, from) {
  const base = await cellCounts(page);
  await sq(page, from).click();
  await page.waitForTimeout(60);
  const now = await cellCounts(page);
  return Object.keys(now).filter((l) => l !== from && now[l] > (base[l] ?? 0));
}

/**
 * Walks a white pawn up its file to the last rank in a pass-and-play game,
 * moving a black piece out of the way between pushes, and stops on the move
 * that would promote it: that click is left to the caller, because it is the
 * one that opens the picker. Returns the promoting move, or null if this
 * army cannot get a pawn through (the caller deals new armies and tries again).
 *
 * Adaptive rather than scripted from a seed: the armies are random, so the
 * scenario reads the board it was dealt instead of pinning one.
 */
export async function walkPawnToLastRank(page) {
  const board = await readBoard(page);
  const clearAhead = (name) => {
    let blocked = 0;
    for (let r = Number(name[1]) + 1; r <= 8; r++) if (board[`${name[0]}${r}`]) blocked++;
    return blocked;
  };
  const pawns = Object.entries(board)
    .filter(([, p]) => p && p.color === 'white' && p.type === 'pawn')
    .map(([name]) => name)
    .sort((a, b) => clearAhead(a) - clearAhead(b) || Number(b[1]) - Number(a[1]));
  if (!pawns.length) return null;
  let at = pawns[0];
  for (let push = 0; push < 8; push++) {
    const rank = Number(at[1]);
    const targets = await targetsFrom(page, at);
    // Straight ahead if it is free, else a capture onto the next rank. Both are
    // checked against the pawn's own square rather than taken from the diff: a
    // marker is counted by the child it adds, and anything else that redraws a
    // square at the same moment would otherwise pass for a legal move.
    const ahead = targets.filter((t) => Number(t[1]) === rank + 1 && Math.abs(t.charCodeAt(0) - at.charCodeAt(0)) <= 1);
    const step = ahead.find((t) => t[0] === at[0]) || ahead[0];
    if (!step) {
      await sq(page, at).click(); // put the selection back and give up on this army
      return null;
    }
    if (Number(step[1]) === 8) {
      await sq(page, at).click(); // leave the selection as it was found: the caller makes this move itself
      return { from: at, to: step };
    }
    await sq(page, step).click();
    await page.waitForTimeout(200);
    if ((await readBoard(page))[at]) return null; // the pawn did not move: this army is not the one
    at = step;
    if (!(await moveOutOfTheWay(page, at))) return null;
  }
  return null;
}

/**
 * Black's reply in a pass-and-play game: the piece furthest from the pawn's
 * file that has somewhere to go which neither takes a white piece nor stands in
 * the pawn's way. Both sides are the tester here, so black plays politely.
 */
async function moveOutOfTheWay(page, pawnAt) {
  const board = await readBoard(page);
  const pieces = Object.entries(board)
    .filter(([name, p]) => p && p.color === 'black' && name[0] !== pawnAt[0])
    .map(([name]) => name)
    .sort((a, b) => Math.abs(b.charCodeAt(0) - pawnAt.charCodeAt(0)) - Math.abs(a.charCodeAt(0) - pawnAt.charCodeAt(0)));
  for (const from of pieces) {
    const targets = (await targetsFrom(page, from)).filter((t) => t[0] !== pawnAt[0] && !(board[t] && board[t].color === 'white'));
    if (targets.length) {
      await sq(page, targets[0]).click();
      await page.waitForTimeout(200);
      if (!(await readBoard(page))[from]) return true; // it really moved, rather than the click landing on a stale marker
    }
    await sq(page, from).click(); // nothing here, or nothing happened: put the selection back
  }
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
