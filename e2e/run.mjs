// End-to-end suite: builds nothing itself; run `npm run test:e2e` (which exports the
// web bundle first) or point it at an existing export with E2E_ROOT.
import fs from 'node:fs';
import path from 'node:path';
import { assert, cellCounts, clickSquares, currentHelper, currentPage, describeApp, draftCount, exact, gameOver, launch, makeAnyMove, openApp, readBoard, resetDraftCount, serve, sq, text, unlockPro, waitHuman, walkPawnToLastRank } from './lib.mjs';

const root = process.env.E2E_ROOT || path.resolve('dist-web');
const port = Number(process.env.E2E_PORT || 4190);
// 127.0.0.1 rather than localhost: the server binds loopback v4 only.
const url = `http://127.0.0.1:${port}/`;
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
    await page.getByRole('switch', { name: 'Sound' }).click();
    await page.reload();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => localStorage.getItem('twokings.appsettings.v1'));
    assert(saved && saved.includes('"boardTheme":"marble"') && saved.includes('"colorScheme":"light"') && saved.includes('"sounds":false'), 'settings saved: ' + saved);
    assert((await page.getByRole('switch', { name: 'Sound' }).isChecked()) === false, 'sound switch reads back off');
    assert((await page.getByRole('link', { name: 'Privacy' }).count()) === 1, 'about card links the privacy statement');
    // A real anchor, not a div that only answers a click: the browser can offer
    // open-in-new-tab, copy link address and a status-bar preview.
    const href = await page.getByRole('link', { name: 'Privacy' }).getAttribute('href');
    assert(href === 'https://github.com/Platteration/chesscheatser/blob/HEAD/PRIVACY.md', 'the privacy link carries its address: ' + href);
    const target = await page.getByRole('link', { name: 'Privacy' }).getAttribute('target');
    assert(target === '_blank', 'the link opens in a new tab: ' + target);
    // Reset asks through the browser's own dialog on the web build (react-native-web's
    // Alert.alert is a no-op): dismissed, nothing changes; accepted, the defaults come
    // back but the intro flag stays as it was.
    page.once('dialog', (d) => d.dismiss());
    await exact(page, 'Reset to defaults').click();
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => localStorage.getItem('twokings.appsettings.v1'));
    assert(kept && kept.includes('"colorScheme":"light"') && kept.includes('"sounds":false'), 'a dismissed dialog changes nothing: ' + kept);
    page.once('dialog', (d) => d.accept());
    await exact(page, 'Reset to defaults').click();
    await page.waitForTimeout(300);
    const reset = await page.evaluate(() => localStorage.getItem('twokings.appsettings.v1'));
    assert(reset && reset.includes('"colorScheme":"system"') && reset.includes('"sounds":true') && reset.includes('"seenIntro":true'), 'reset restored the defaults and kept the intro flag: ' + reset);
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'game vs computer with hint, undo and resume'(browser) {
    const { page, context, errors } = await openApp(browser, url);
    await exact(page, 'White').first().click();
    await exact(page, 'Never').click();
    await exact(page, 'New game with these settings').click();
    // The armies and the moves are both random, and in this variant one move can
    // end the game: a king in check with no rescuing move loses. On seed
    // 1186155712 the first move this picked, Ra2xa7 with the queen on f2
    // guarding a7, mated the king on a8, and the computer can mate a careless
    // move as quickly. The result sheet then covers everything this scenario
    // presses next, Undo is off in a finished game and there is no game left to
    // resume, so a click waited out its 30 s on CI. A finished game is not what
    // this scenario is about: it deals new armies from the sheet, as a player
    // would, and plays the whole of it again on them.
    const exchange = async (what) => {
      assert(await makeAnyMove(page), what);
      await waitHuman(page);
      if (!(await gameOver(page))) return true;
      await page.getByRole('dialog').getByText('New armies', { exact: true }).click();
      await page.waitForTimeout(500);
      return false;
    };
    let played = false;
    for (let armies = 0; armies < 6 && !played; armies++) {
      if (!(await exchange('human move played'))) continue;
      assert((await text(page, '/^1\\. /')) !== null, 'move list shows move 1');
      await page.locator('text=/^Hint/').click();
      // The button reads "…" while the hint search runs and "Hint" again once it is on the board.
      await exact(page, 'Hint').waitFor({ timeout: 30000 });
      await exact(page, 'Undo').click();
      await waitHuman(page); // the rolled-back turn is measured again before a move is accepted
      assert((await page.locator('text=/^1\\. /').count()) === 0, 'undo cleared the move list');
      played = await exchange('human move after undo');
    }
    assert(played, 'a game still running after both exchanges within six armies');
    await page.getByText('‹ Home').click();
    await exact(page, 'Resume game').waitFor({ timeout: 10000 });
    assert((await exact(page, 'Resume game').count()) === 1, 'resume offered');
    await exact(page, 'Resume game').click();
    await waitHuman(page);
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
    let accused = 0;
    for (let turn = 0; turn < 16; turn++) {
      await waitHuman(page);
      if (await gameOver(page)) break;
      if (await exact(page, 'Cheater!').count()) {
        await exact(page, 'Cheater!').click();
        accused++;
        // The verdict shows in the same render as the accusation. "Caught cheating!"
        // stays until the human moves; "That move was legal." is replaced as soon as
        // the computer takes its extra move, within ~150 ms on Easy, so it can be
        // missed under load. The end-of-game report is the durable record.
        const s = await page.locator('text=/Caught cheating|That move was legal/').first().textContent({ timeout: 3000 }).catch(() => null);
        if (s) outcomes.add(s.includes('Caught') ? 'caught' : 'legal');
      }
      await waitHuman(page);
      if (await gameOver(page)) break;
      if (!(await makeAnyMove(page))) break;
    }
    assert(accused > 0, 'at least one accusation made');
    if (!(await gameOver(page))) {
      await exact(page, 'Resign').click();
      await page.waitForTimeout(300);
    }
    const report = await text(page, '/The computer cheated|never cheated/');
    assert(report !== null, 'cheat report shown');
    // Every accusation is a caught cheat or a false accusation in the report.
    const caught = Number(/you caught (\d+)/.exec(report)?.[1] ?? 0);
    const wrong = Number(/False accusations?: (\d+)/.exec(report)?.[1] ?? 0);
    assert(caught + wrong === accused, `report accounts for every accusation (${accused} made): ${report}`);
    // A caught verdict is on screen until the human moves, so it must have been seen.
    assert(caught === 0 || outcomes.has('caught'), 'caught verdict shown: ' + [...outcomes]);
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

  async 'promotion picker: the backdrop cancels, the sheet does not, a choice promotes'(browser) {
    // Nothing drove the picker before, so neither its dismissal nor the way it
    // stacks on the web had ever been exercised: a sheet covered by its own
    // backdrop would cancel every promotion and the suite would not notice.
    // Reduce motion planted rather than clicked: the glide redraws squares, and
    // this scenario reads legal moves from how many children a square has.
    const { page, context, errors } = await openApp(browser, url, undefined, {
      storage: { 'twokings.appsettings.v1': JSON.stringify({ seenIntro: true, reduceMotion: 'on' }) },
    });
    await exact(page, 'Pass & play').click(); // both sides are the tester, so a pawn can be walked up the board
    await exact(page, 'Off').first().click(); // comeback powers off: no power moves among the pawn's targets
    await exact(page, 'Small').click(); // fewer pieces, so a file is more likely to be clear
    let promoting = null;
    for (let armies = 0; armies < 6 && !promoting; armies++) {
      if (armies === 0) await exact(page, 'New game with these settings').click();
      else await exact(page, 'New armies').click();
      await page.waitForTimeout(600);
      promoting = await walkPawnToLastRank(page);
    }
    assert(promoting, 'a pawn reached the last rank within six armies');

    // The modal fades in and out, so the picker is waited for rather than
    // sampled after a fixed pause: a cancel that has been accepted but is still
    // fading looks exactly like one that was ignored.
    const picker = exact(page, 'Promote to');
    const openPicker = async () => {
      await sq(page, promoting.from).click();
      await page.waitForTimeout(100);
      await sq(page, promoting.to).click();
      await picker.waitFor({ state: 'visible', timeout: 5000 });
    };

    await openPicker();
    // The sheet's own surface is not a cancel button: only the backdrop outside
    // it dismisses. The padding above the title, not the title itself — a click
    // on text starts a selection, and react-native-web's press responder then
    // cancels the press after it.
    await picker.locator('..').click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(600); // longer than the fade a cancel would start
    assert((await picker.count()) === 1, 'a tap on the sheet itself keeps the picker open');
    // The backdrop fills the screen behind the sheet, so a corner of it is outside the sheet.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click({ position: { x: 5, y: 5 } });
    await picker.waitFor({ state: 'hidden', timeout: 5000 });
    const cancelled = await readBoard(page);
    assert(cancelled[promoting.from]?.type === 'pawn', 'a cancelled pick plays no move: ' + JSON.stringify(cancelled[promoting.from]));

    // Reopened, the piece chosen is the piece that arrives — a rook, not the default queen.
    await openPicker();
    await page.getByRole('button', { name: 'Rook', exact: true }).click();
    await picker.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(300);
    const promoted = await readBoard(page);
    assert(promoted[promoting.to]?.color === 'white' && promoted[promoting.to]?.type === 'rook', 'the chosen piece promoted: ' + JSON.stringify(promoted[promoting.to]));
    assert(promoted[promoting.from] === null, 'the pawn left its square');
    assert(errors.length === 0, errors.join('\n'));
    await context.close();
  },

  async 'first-run tip shows once'(browser) {
    const { page, context, errors } = await openApp(browser, url, undefined, { intro: true });
    await exact(page, 'New game with these settings').click();
    // The colour is random: the computer may move first, and if that leaves the
    // human two pawns behind the comeback draft opens on top of the tip. Settle
    // the turn (answering any draft) before touching the tip.
    await waitHuman(page);
    assert((await text(page, '/Two kings, one rule/')) !== null, 'tip shown on first game');
    await exact(page, 'Got it').click();
    await page.getByText('‹ Home').click();
    await exact(page, 'New game with these settings').waitFor({ timeout: 10000 });
    // That first game is now the saved game, so starting another asks before
    // replacing it: dismissed, the menu stays put; accepted, the new game opens.
    page.once('dialog', (d) => d.dismiss());
    await exact(page, 'New game with these settings').click();
    await page.waitForTimeout(400);
    assert((await exact(page, 'Resume game').count()) === 1, 'a dismissed prompt leaves the saved game and the menu alone');
    page.once('dialog', (d) => {
      assert(d.message().includes('Start a new game?'), 'the prompt names the action: ' + d.message());
      d.accept();
    });
    await exact(page, 'New game with these settings').click();
    await page.locator('text=/to move|thinking/').first().waitFor({ timeout: 10000 }); // the game screen is up
    await waitHuman(page);
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

  async 'a saved game that cannot be restored as it was says so'(browser) {
    // Both halves used to be silent: the record was removed and Resume simply
    // was not on the menu, which is indistinguishable from a bug.
    const tooLong = JSON.stringify({ seed: 1, humanColor: 'w', config: {}, events: Array.from({ length: 8001 }, () => ({ type: 'pass' })) });
    const clipped = await openApp(browser, url, undefined, { storage: { 'twokings.game.v1': tooLong } });
    assert((await exact(clipped.page, 'Resume game').count()) === 1, 'an over-long game is still offered');
    assert((await clipped.page.locator('text=/too long to restore in full/').count()) === 1, 'home screen says it was clipped');
    assert(clipped.errors.length === 0, clipped.errors.join('\n'));
    await clipped.context.close();

    // 113 bytes that would grow the board array to ten million entries.
    const hostile = '{"seed":1234,"humanColor":"w","config":{},"events":[{"type":"move","move":{"from":0,"to":10000000,"piece":"r"}}]}';
    const dropped = await openApp(browser, url, undefined, { storage: { 'twokings.game.v1': hostile } });
    assert((await exact(dropped.page, 'Resume game').count()) === 0, 'an unreadable game is not offered');
    assert((await dropped.page.locator('text=/could not be read/').count()) === 1, 'home screen says it was removed');
    const left = await dropped.page.evaluate(() => localStorage.getItem('twokings.game.v1'));
    assert(left === null, 'the unreadable record is gone from storage: ' + left);
    assert(dropped.errors.length === 0, dropped.errors.join('\n'));
    await dropped.context.close();
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
    // Playwright's message carries its call log: the locator it waited on and
    // why the action never became possible ("element is not enabled", "<div>
    // intercepts pointer events"). Add which helper was running and what the
    // app showed, so a timeout in CI is diagnosable from the log alone.
    const [head, ...rest] = String(e.message).split('\n');
    console.log(`FAIL  ${name}: ${head}`);
    if (currentHelper()) console.log(`      inside ${currentHelper()}`);
    for (const line of rest.filter((l) => l.trim()).slice(0, 12)) console.log(`      ${line.trim()}`);
    console.log(`      app: ${await describeApp(currentPage())}`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await currentPage()?.screenshot({ path: `${shots}/fail-${name.replace(/[^a-z0-9]+/gi, '-')}.png` }).catch(() => {});
    }
  }
}
await browser.close();
server.close();
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
