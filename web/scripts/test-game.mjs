import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

function game() {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.com', runScripts: 'outside-only' });
  const w = dom.window;
  let now = 0, frame;
  Object.defineProperty(w.performance, 'now', { value: () => now });
  w.requestAnimationFrame = cb => { frame = cb; };
  // A 1.94× crash: 0.97 / (1 - 0.5).
  Object.defineProperty(w.crypto, 'getRandomValues', { value: a => { a[0] = 2147483648; return a; } });
  w.eval(fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').replace("import './game.css';", ''));
  const q = s => w.document.querySelector(s);
  return { w, q, click: s => q(s).click(), tick: t => { now = t; const cb = frame; cb(t); }, input: (s, v) => { q(s).value = v; q(s).dispatchEvent(new w.Event('input', { bubbles: true })); }, close: () => w.close() };
}

{
  const g = game(), { q, click, tick, input } = g;
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
  const g = game(), { q, click, tick, input } = g;
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
  // A second bet can be queued on the same O/U slip while the first is active.
  click('[data-slot="1"][data-ou-bet="over"]');
  assert.equal(q('#balance').textContent, '₦9,700.00');
  assert.match(q('[data-ou-status="1"]').textContent, /Next flight/);
  click('[data-ou-cancel="1"]');
  assert.equal(q('#balance').textContent, '₦9,800.00');
  tick(30000);
  assert.equal(q('#balance').textContent, '₦10,182.00', 'Over includes equality and Under wins below threshold');
  assert.match(q('#betList').textContent, /O\/U Over 1.94×/);
  assert.match(q('#betList').textContent, /O\/U Under 2.00×/);
  g.close();
}

{
  const g = game(), { q, click, tick, input } = g;
  click('[data-mode="ou"]');
  input('#ou-coeff-0', '1.001'); click('[data-slot="0"][data-ou-bet="over"]');
  assert.equal(q('#balance').textContent, '₦10,000.00', 'invalid coefficient rejected');
  input('#ou-coeff-0', '1.50'); click('[data-slot="0"][data-ou-bet="under"]');
  tick(7001); tick(30000);
  assert.equal(q('#balance').textContent, '₦9,900.00', 'losing Under is settled with no payout');
  g.close();
}
{
  const g = game(), { q, click, tick, input } = g;
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
  const g = game(), { q, click, tick, input } = g;
  click('[data-mode="ou"]');
  input('#ou-coeff-0', '1.94'); click('[data-slot="0"][data-ou-bet="under"]');
  click('[data-ou-slot="1"]'); input('#ou-coeff-1', '2'); click('[data-slot="1"][data-ou-bet="over"]');
  tick(7001); tick(30000);
  assert.equal(q('#balance').textContent, '₦9,800.00', 'Under excludes equality and Over loses below threshold');
  g.close();
}
console.log('Game tests passed: next-round queuing, cancellation, settlement, O/U and validation.');
