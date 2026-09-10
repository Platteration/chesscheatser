// End-to-end suite: builds nothing itself; run `npm run e2e` (which exports the
// web bundle first) or point it at an existing export with E2E_ROOT.
import fs from 'node:fs';
import path from 'node:path';
import { assert, cellCounts, clickSquares, draftCount, exact, gameOver, launch, makeAnyMove, openApp, resetDraftCount, serve, text, unlockPro, waitHuman } from './lib.mjs';

const root = process.env.E2E_ROOT || path.resolve('dist-web');
const port = Number(process.env.E2E_PORT || 4190);
const url = `http://localhost:${port}/`;
const shots = process.env.E2E_SHOTS || '';
const KIND_ORDER = ['double-1', 'mate-1', 'win-2'];
const puzzles = JSON.parse(fs.readFileSync(path.resolve('assets/puzzles.json'), 'utf8')).sort(
  (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.pieces - b.pieces,
);

const scenarios = {
  async 'home settings persist'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'Light').click();
    await exact(page, 'Marble').click();
    await page.reload();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => localStorage.getItem('twokings.appsettings.v1'));
    assert(saved && saved.includes('"boardTheme":"marble"') && saved.includes('"colorScheme":"light"'), 'settings saved: ' + saved);
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'game vs computer with hint, undo and resume'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'White').first().click();
    await exact(page, 'Never').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    assert(await makeAnyMove(page), 'human move played');
    await waitHuman(page);
    assert((await text(page, '/^1\\. /')) !== null, 'move list shows move 1');
    await page.locator('text=/^Hint/').click();
    await page.waitForTimeout(2500);
    await exact(page, 'Undo').click();
    await page.waitForTimeout(300);
    assert((await page.locator('text=/^1\\. /').count()) === 0, 'undo cleared the move list');
    assert(await makeAnyMove(page), 'human move after undo');
    await waitHuman(page);
    await page.getByText('‹ Home').click();
    await page.waitForTimeout(300);
    assert((await exact(page, 'Resume game').count()) === 1, 'resume offered');
    await exact(page, 'Resume game').click();
    await page.waitForTimeout(500);
    assert((await text(page, '/^1\\. /')) !== null, 'resumed game keeps moves');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'computer cheating: accuse every move'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'Easy').click();
    await exact(page, 'White').first().click();
    await exact(page, 'Often').click();
    await exact(page, 'Chaos').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    const outcomes = new Set();
    for (let turn = 0; turn < 16; turn++) {
      await waitHuman(page);
      if (await gameOver(page)) break;
      if (await exact(page, 'Cheater!').count()) {
        await exact(page, 'Cheater!').click();
        await page.waitForTimeout(250);
        const s = await text(page, '/Caught cheating|That move was legal/');
        if (s) outcomes.add(s.includes('Caught') ? 'caught' : 'legal');
      }
      await waitHuman(page);
      if (await gameOver(page)) break;
      if (!(await makeAnyMove(page))) break;
    }
    assert(outcomes.size > 0, 'at least one accusation resolved: ' + [...outcomes]);
    if (!(await gameOver(page))) {
      await exact(page, 'Resign').click();
      await page.waitForTimeout(300);
    }
    const report = await text(page, '/The computer cheated|never cheated/');
    assert(report !== null, 'cheat report shown');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'player cheat mode'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'White').first().click();
    await exact(page, 'Yes, once per game').click();
    await exact(page, 'Never').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    await exact(page, 'Cheat').click();
    await page.waitForTimeout(150);
    assert((await page.locator('text=/Cheat mode/').count()) === 1, 'cheat mode status');
    assert(await makeAnyMove(page), 'cheat move played');
    await page.waitForTimeout(300);
    const busted = await page.locator('text=/Busted/').count();
    const skipped = await text(page, '/\\(skip\\)/');
    assert(busted === 0 || skipped !== null, 'busted implies a skip in the move list');
    await waitHuman(page);
    assert((await exact(page, 'Cheat').count()) === 0, 'only one cheat per game');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'daily challenge records a result'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'Play').first().click();
    await page.waitForTimeout(500);
    assert((await text(page, '/Daily challenge/')) !== null, 'daily subtitle');
    await exact(page, 'Resign').click();
    await page.waitForTimeout(300);
    assert((await exact(page, 'Share result').count()) === 1, 'share button');
    await exact(page, 'Home').click();
    await page.waitForTimeout(300);
    assert((await text(page, '/today/')) !== null, 'card shows today result');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'ranked ladder records rank'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'Play').nth(1).click();
    await page.waitForTimeout(500);
    assert((await text(page, '/Ranked · rank 1/')) !== null, 'ranked subtitle');
    await exact(page, 'Resign').click();
    await page.waitForTimeout(300);
    assert((await text(page, '/Down to rank 1/')) !== null, 'rank note');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'puzzles solve and advance'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await page.locator('text=/^Puzzles ·/').click();
    await page.waitForTimeout(500);
    const sol = puzzles[0].solution;
    await clickSquares(page, sol.slice(0, 2), sol.slice(2, 4));
    assert((await text(page, '/Solved!/')) !== null, 'first puzzle solved');
    await exact(page, 'Next ▶').click();
    await page.waitForTimeout(300);
    assert((await text(page, '/Puzzle 2\\//')) !== null, 'advanced to puzzle 2');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'pass and play with clock and review scrubber'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'Pass & play').click();
    await exact(page, '1').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(400);
    assert(await makeAnyMove(page), 'first ply');
    assert(await makeAnyMove(page), 'second ply');
    await page.waitForTimeout(1500);
    const clocks = await page.locator('text=/^\\d:\\d\\d$/').allTextContents();
    assert(clocks.some((c) => c !== '1:00'), 'a clock is running: ' + clocks);
    await exact(page, '◀').click();
    await page.waitForTimeout(200);
    assert((await text(page, '/Reviewing 1\\/2/')) !== null, 'scrubber reviewing');
    await exact(page, '⏭').click();
    await page.waitForTimeout(200);
    assert((await text(page, '/^Move 2$/')) !== null, 'back to live');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'first-run tip shows once'(browser) {
    const { page, context, errors } = await openApp(browser, url, undefined, { intro: true });
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    assert((await text(page, '/Two kings, one rule/')) !== null, 'tip shown on first game');
    await exact(page, 'Got it').click();
    await page.waitForTimeout(300);
    await page.getByText('‹ Home').click();
    await page.waitForTimeout(300);
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    assert((await page.locator('text=/Two kings, one rule/').count()) === 0, 'tip not shown again');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'landscape layout'(browser) {
    const { page, context, errors } = await openApp(browser, url, { width: 844, height: 390 });
    await exact(page, 'White').first().click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(500);
    assert((await text(page, '/White to move/')) !== null, 'status visible');
    if (shots) await page.screenshot({ path: `${shots}/landscape.png` });
    const box = await page.locator('[aria-label^="a1"]').boundingBox();
    assert(box && box.y + box.height <= 390 && box.x + box.width <= 844, 'board fits the landscape viewport: ' + JSON.stringify(box));
    assert(await makeAnyMove(page), 'move in landscape');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'stats screen'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await page.locator('text=/^Stats ·/').click();
    await page.waitForTimeout(300);
    for (const h of ['Versus computer', 'Cheat detection', 'Ranked ladder', 'Daily challenge', 'Puzzles']) {
      assert((await exact(page, h).count()) === 1, 'stats section ' + h);
    }
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'comeback powers appear for the side that is behind'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    // Pass-and-play makes this deterministic: both colours are human, so whichever
    // side falls behind is *shown* the draft rather than the computer taking it
    // silently. Chaos armies guarantee somebody is behind within a few plies.
    await exact(page, 'Pass & play').click();
    await exact(page, 'Chaos').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(700);

    resetDraftCount();
    for (let ply = 0; ply < 14 && draftCount() === 0; ply++) {
      if (shots && (await page.locator('[data-testid="power-draft"]').count())) {
        await page.screenshot({ path: `${shots}/draft.png` });
      }
      if (await gameOver(page)) break;
      if (!(await makeAnyMove(page))) break; // settles a draft if one is open
    }
    assert(draftCount() > 0, 'a draft was offered within fourteen plies of a chaos game');
    // The meter shows a star per power once a side has drafted one.
    assert((await text(page, '/★/')) !== null, 'the meter shows a drafted power');
    if (shots) await page.screenshot({ path: `${shots}/comeback.png` });
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'handicap chess gives each side one king'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'One (handicap)').click();
    await page.waitForTimeout(200);
    // The double-check rule means nothing with a single king, so its control goes away.
    assert((await exact(page, 'Must be answered').count()) === 0, 'double-check control hidden');
    assert((await text(page, '/one king/')) !== null, 'settings summary mentions one king');
    await exact(page, 'White').first().click();
    await exact(page, 'Never').click();
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(600);
    const kings = await page.$$eval('[aria-label]', (els) =>
      els.map((e) => e.getAttribute('aria-label') || '').filter((l) => l.endsWith(' king')),
    );
    assert(kings.filter((l) => l.includes('white')).length === 1, 'one white king: ' + kings);
    assert(kings.filter((l) => l.includes('black')).length === 1, 'one black king: ' + kings);
    assert(await makeAnyMove(page), 'move played in handicap chess');
    await waitHuman(page);
    assert((await text(page, '/^1\\. /')) !== null, 'the game plays on');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'pro gating'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    assert((await exact(page, 'Neon 🔒').count()) === 1, 'neon starts locked');
    // Hints and mid-game review must never be behind a purchase.
    assert((await page.locator('text=/Hint \\(/').count()) === 0, 'hints are not rationed');
    await exact(page, 'Neon 🔒').click();
    await page.waitForTimeout(300);
    assert((await page.locator('text=/Support the game/').count()) > 0, 'store opened');
    assert((await page.locator('text=/Win 5 games/').count()) > 0, 'the store shows how to earn it instead');
    await page.locator('text=/Unlock everything/').click();
    await page.waitForTimeout(300);
    await page.getByText('‹ Back').click();
    await page.waitForTimeout(300);
    assert((await exact(page, 'Neon').count()) === 1, 'neon unlocked');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },
};

const only = process.argv.slice(2);
const server = await serve(root, port);
const browser = await launch();
let failed = 0;
for (const [name, fn] of Object.entries(scenarios)) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const started = Date.now();
  try {
    await fn(browser);
    console.log(`PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
    if (shots) fs.mkdirSync(shots, { recursive: true });
  }
}
await browser.close();
server.close();
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
