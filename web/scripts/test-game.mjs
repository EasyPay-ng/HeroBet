import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

async function game(account = { user: null }, api = null) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.com', runScripts: 'outside-only' });
  const w = dom.window;
  let now = 0, frame;
  Object.defineProperty(w.performance, 'now', { value: () => now });
  w.requestAnimationFrame = cb => { frame = cb; };
  // A 1.94× crash: 0.97 / (1 - 0.5).
  Object.defineProperty(w.crypto, 'getRandomValues', { value: a => { a[0] = 2147483648; return a; } });
  const saves = [];
  w.loadGameAccount = () => Promise.resolve(account);
  w.saveGameAccount = (user, data) => { saves.push({ user, data }); return Promise.resolve(); };
  w.watchGameAccount = () => () => {};
  w.fetchSharedGameState = api ? () => Promise.resolve(api.snapshot) : () => Promise.reject(new Error('API offline'));
  w.fetchSharedRoundHistory = api ? async () => api.history || [] : async () => { throw new Error('API offline'); };
  w.eval(fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, ''));
  await new Promise(resolve => setTimeout(resolve, 0));
  const q = s => w.document.querySelector(s);
  return { w, q, saves, click: s => q(s).click(), tick: t => { now = t; const cb = frame; cb(t); }, input: (s, v) => { q(s).value = v; q(s).dispatchEvent(new w.Event('input', { bubbles: true })); }, close: () => w.close() };
}

{
  const g = await game(), { q, click, tick, input } = g;
  assert.equal(q('#balance').textContent, '₦10,000.00');
  click('[data-bet="0"]');
  assert.equal(q('#balance').textContent, '₦9,900.00');
  tick(7001);
  assert.match(q('[data-bet="0"]').textContent, /CASH OUT/);
  assert.equal(q('[data-next-bet="0"]').hidden, false);
  input('#stake-0', '500');
  click('[data-next-bet="0"]');
  assert.equal(q('#balance').textContent, '₦9,400.00');
  assert.match(q('[data-next-bet="0"]').textContent, /Cancel/);
  click('[data-next-bet="0"]');
  assert.equal(q('#balance').textContent, '₦9,900.00');
  click('[data-next-bet="0"]');
  tick(8000);
  click('[data-bet="0"]');
  assert.match(q('[data-bet="0"]').textContent, /CANCEL BET/);
  assert.equal(q('#balance').textContent, '₦9,507.00');
  click('#reset');
  assert.equal(q('#balance').textContent, '₦9,507.00', 'reset cannot erase a queued bet');
  tick(30000); tick(33501); tick(40502);
  assert.match(q('[data-bet="0"]').textContent, /CASH OUT/, 'queued bet becomes active on next flight');
  assert.match(q('[data-bet="0"]').textContent, /₦500.00/);
  tick(70000);
  assert.equal(q('#balance').textContent, '₦9,507.00', 'losing bet is not charged twice');
  assert.match(q('#betList').textContent, /Classic/);
  g.close();
}

{
  const g = await game(), { q, click, tick, input } = g;
  click('[data-mode="ou"]');
  assert.equal(q('#ouPanel').hidden, false);
  assert.equal(q('#classicPanel').hidden, true);
  input('#ou-coeff-0', '1.94');
  click('[data-slot="0"][data-ou-bet="over"]');
  assert.equal(q('#balance').textContent, '₦9,900.00');
  click('[data-ou-slot="1"]');
  input('#ou-coeff-1', '2');
  assert.match(q('[data-slot="1"][data-ou-bet="under"] small').textContent, /1.88/);
  click('[data-slot="1"][data-ou-bet="under"]');
  assert.equal(q('#balance').textContent, '₦9,800.00');
  tick(7001);
  assert.match(q('[data-ou-status="1"]').textContent, /awaiting result/);
  assert.equal(q('#scene').classList.contains('flying'), true, 'flight animation runs in O/U mode');
  assert.ok(q('#scene .flight-art'), 'shared flight artwork is visible in O/U mode');
  tick(8500);
  assert.notEqual(q('#multiplier').textContent, '1.00×', 'multiplier advances while viewing O/U');
  click('[data-mode="classic"]'); click('[data-mode="ou"]');
  assert.equal(q('#scene').classList.contains('flying'), true, 'switching modes keeps the same animated flight');
  // A second bet can be queued on the same O/U slip while the first is active.
  click('[data-slot="1"][data-ou-bet="over"]');
  assert.equal(q('#balance').textContent, '₦9,700.00');
  assert.match(q('[data-ou-status="1"]').textContent, /Next flight/);
  click('[data-ou-cancel="1"]');
  assert.equal(q('#balance').textContent, '₦9,800.00');
  tick(30000);
  assert.equal(q('#scene').classList.contains('crashed'), true, 'flight animation transitions to crash');
  assert.equal(q('#scene').classList.contains('flying'), false);
  assert.equal(q('#balance').textContent, '₦10,182.00', 'Over includes equality and Under wins below threshold');
  assert.match(q('#betList').textContent, /O\/U Over 1.94×/);
  assert.match(q('#betList').textContent, /O\/U Under 2.00×/);
  g.close();
}

{
  const g = await game(), { q, click, tick, input } = g;
  click('[data-mode="ou"]');
  input('#ou-coeff-0', '1.001'); click('[data-slot="0"][data-ou-bet="over"]');
  assert.equal(q('#balance').textContent, '₦10,000.00', 'invalid coefficient rejected');
  input('#ou-coeff-0', '1.50'); click('[data-slot="0"][data-ou-bet="under"]');
  tick(7001); tick(30000);
  assert.equal(q('#balance').textContent, '₦9,900.00', 'losing Under is settled with no payout');
  g.close();
}
{
  const g = await game(), { q, click, tick, input } = g;
  q('[data-auto-bet="0"]').click();
  q('[data-auto-cash="0"]').click();
  input('[data-target="0"]', '1.10');
  click('[data-bet="0"]'); tick(7001); tick(8500);
  assert.equal(q('#balance').textContent, '₦10,010.00', 'auto cashout pays at the configured target');
  click('[data-bet="0"]');
  assert.equal(q('#balance').textContent, '₦9,910.00');
  tick(30000); tick(33501);
  assert.equal(q('#balance').textContent, '₦9,910.00', 'auto bet does not duplicate an existing queued bet');
  tick(40502); tick(42000);
  assert.equal(q('#balance').textContent, '₦10,020.00', 'queued auto cashout settles on the next flight');
  g.close();
}

{
  const g = await game(), { q, click, tick, input } = g;
  click('[data-mode="ou"]');
  input('#ou-coeff-0', '1.94'); click('[data-slot="0"][data-ou-bet="under"]');
  click('[data-ou-slot="1"]'); input('#ou-coeff-1', '2'); click('[data-slot="1"][data-ou-bet="over"]');
  tick(7001); tick(30000);
  assert.equal(q('#balance').textContent, '₦9,800.00', 'Under excludes equality and Over loses below threshold');
  g.close();
}

{
  const user = { uid: 'firebase-player' };
  const g = await game({ user, balance: 1234, bets: [{ stake: 100, multiplier: 2, payout: 200, status: 'won', mode: 'Classic' }] });
  assert.equal(g.q('#balance').textContent, '₦1,234.00', 'signed-in game loads the Firebase demo balance');
  assert.match(g.q('#betList').textContent, /Classic/, 'signed-in activity is restored');
  g.click('[data-bet="0"]');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(g.saves.at(-1).user.uid, 'firebase-player');
  assert.equal(g.saves.at(-1).data.balance, 1134, 'placing a bet saves the new demo balance');
  assert.match(g.q('#syncStatus').textContent, /DEMO SYNCED/);
  g.close();
}

{
  const now = Date.now();
  const api = {
    snapshot: { serverTime: now, round: { id: 'shared-841', phase: 'flying', startsAt: now - 12000, bettingClosesAt: now - 5000, multiplier: 1.47, commitment: 'a'.repeat(64) } },
    history: [{ crashMultiplier: 2.4 }, { crashMultiplier: 1.1 }],
  };
  const g = await game({ user: null }, api);
  assert.match(g.q('#roundIndicator').textContent, /GLOBAL ROUND #shared-841/);
  assert.equal(g.q('#scene').classList.contains('flying'), true, 'scene follows the shared server round');
  assert.equal(g.q('#multiplier').textContent, '1.47×', 'display uses the API multiplier');
  assert.equal(g.q('[data-bet="0"]').disabled, true, 'betting remains disabled until server bet endpoints exist');
  assert.equal(g.q('#reset').disabled, true, 'local demo balance cannot be reset against the shared viewer');
  assert.match(g.q('#activityFoot').textContent, /BET API NOT ENABLED/);
  assert.match(g.q('#phaseMessage').textContent, /server betting is not enabled yet/);
  assert.match(g.q('#gameSummary').textContent, /Everyone sees this same/);
  assert.match(g.q('#history').textContent, /2.40×/);
  g.close();
}

console.log('Game tests passed: local practice, shared round display, locked shared bet controls, next-round queuing, settlement and O/U.');
