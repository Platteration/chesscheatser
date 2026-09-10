// Shared helpers for the end-to-end suite (web build driven by Playwright).
import { chromium } from 'playwright';

export { serve } from './serve.mjs';

export async function launch() {
  const executablePath = process.env.PW_CHROMIUM || undefined;
  return chromium.launch({ executablePath });
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

export async function waitHuman(page, ms = 12000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!(await page.locator('text=/Computer is thinking|takes its extra move|Opponent is defending/').count())) return;
    await page.waitForTimeout(100);
  }
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
  const base = await cellCounts(page);
  for (const label of Object.keys(base)) {
    await sq(page, label).click();
    if (await settlePicker(page)) return true; // an empty home square opened the resurrect picker
    await page.waitForTimeout(30);
    const now = await cellCounts(page);
    const targets = Object.keys(now).filter((l) => l !== label && now[l] > base[l]);
    if (targets.length) {
      await sq(page, targets[Math.floor(Math.random() * targets.length)]).click({ timeout: 3000 });
      await settlePicker(page);
      await page.waitForTimeout(200);
      return true;
    }
    await sq(page, label).click().catch(() => {});
  }
  return false;
}

/** Locator for a board square by name; labels read "e2" or "e2, white pawn". */
export const sq = (page, name) => page.locator(`[aria-label="${name}"], [aria-label^="${name},"]`).first();

export async function clickSquares(page, from, to) {
  await sq(page, from).click();
  await page.waitForTimeout(100);
  await sq(page, to).click();
  await page.waitForTimeout(300);
}

export const text = (page, re) => page.locator(`text=${re}`).first().textContent().catch(() => null);
export const exact = (page, t) => page.getByText(t, { exact: true });

export async function unlockPro(page) {
  await exact(page, 'Two Kings Pro').click();
  await page.waitForTimeout(300);
  await page.locator('text=/Unlock Pro/').click();
  await page.waitForTimeout(300);
  await page.getByText('‹ Back').click();
  await page.waitForTimeout(300);
}

export function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
