import './game.css';

const app = document.querySelector('#app');
const money = n => Math.max(0, n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const savedBalance = Number(localStorage.getItem('herobet-demo-balance'));
const state = {
  balance: Number.isFinite(savedBalance) && savedBalance >= 0 && localStorage.getItem('herobet-demo-balance') !== null ? savedBalance : 10000,
  phase: 'waiting', multiplier: 1, crash: 1, phaseStart: performance.now(),
  history: [], bets: [], tab: 'all', mode: 'classic', ouSlot: 0, tickets: [null, null], nextTickets: [null, null], ouTickets: [null, null], nextOuTickets: [null, null], autoBet: [false, false], autoCash: [false, false]
};

const ticketMarkup = i => `
  <section class="ticket" data-ticket="${i}" aria-label="Bet ticket ${i + 1}">
    <div class="ticket-top"><span class="ticket-label"><span class="ticket-number">0${i + 1}</span> BET SLIP</span><span class="ticket-note">PLAY MONEY</span></div>
    <div class="ticket-body">
      <div class="stake-side">
        <div class="field-label"><label for="stake-${i}">Bet amount</label><span>MIN 20 · MAX 150,000</span></div>
        <div class="amount-control"><button class="adjust" data-adjust="-1" aria-label="Decrease bet amount">−</button><div><span class="currency">₦</span><input id="stake-${i}" class="stake-input" type="number" min="20" max="150000" step="10" value="100" aria-label="Bet amount" /></div><button class="adjust" data-adjust="1" aria-label="Increase bet amount">+</button></div>
        <div class="presets"><button data-preset="100">100</button><button data-preset="500">500</button><button data-preset="1000">1,000</button><button data-preset="5000">5,000</button></div>
      </div>
      <button class="bet-button" data-bet="${i}"><strong>PLACE BET</strong><span>₦100.00</span></button>
    </div>
    <button class="next-bet-button" data-next-bet="${i}" hidden></button>
    <div class="ticket-options"><label class="toggle-label"><input type="checkbox" data-auto-bet="${i}"><span class="switch"></span> Auto bet</label><div class="auto-cash"><label class="toggle-label"><input type="checkbox" data-auto-cash="${i}"><span class="switch"></span> Auto cashout</label><div class="cash-target"><input type="number" min="1.01" max="1000" step="0.01" value="2.00" data-target="${i}" aria-label="Auto cashout multiplier for bet ${i + 1}"><span>×</span></div></div></div>
  </section>`;


const ouMarkup = i => `
  <section class="ou-slip" data-ou-slip="${i}" ${i ? 'hidden' : ''} aria-label="Over Under bet ${i + 1}">
    <div class="ou-fields">
      <div class="ou-field"><div class="field-label"><label for="ou-stake-${i}">Bet amount</label><span>MIN 20 · MAX 150,000</span></div>
        <div class="amount-control"><button data-ou-adjust="stake:-10" aria-label="Decrease O/U bet amount">−</button><div><span class="currency">₦</span><input id="ou-stake-${i}" data-ou-stake="${i}" type="number" min="20" max="150000" step="10" value="100" aria-label="Over Under bet amount"></div><button data-ou-adjust="stake:10" aria-label="Increase O/U bet amount">+</button></div>
        <div class="presets"><button data-ou-preset="50">50</button><button data-ou-preset="100">100</button><button data-ou-preset="500">500</button><button data-ou-preset="5000">5,000</button></div>
      </div>
      <div class="ou-field"><div class="field-label"><label for="ou-coeff-${i}">Flight coefficient</label><span>1.10× – 100.00×</span></div>
        <div class="amount-control"><button data-ou-adjust="coeff:-0.1" aria-label="Decrease coefficient">−</button><div><input id="ou-coeff-${i}" data-ou-coeff="${i}" type="number" min="1.1" max="100" step="0.01" value="1.50" aria-label="Flight coefficient"><span class="currency">×</span></div><button data-ou-adjust="coeff:0.1" aria-label="Increase coefficient">+</button></div>
        <p class="ou-explainer">Over includes the selected coefficient. Under is below it.</p>
      </div>
    </div>
    <p class="ou-status" data-ou-status="${i}">Predict where the next flight ends.</p>
    <div class="ou-actions"><button class="ou-over" data-ou-bet="over" data-slot="${i}"><strong>OVER</strong><small></small></button><button class="ou-under" data-ou-bet="under" data-slot="${i}"><strong>UNDER</strong><small></small></button><button class="ou-cancel" data-ou-cancel="${i}" hidden>Cancel next-round bet</button></div>
  </section>`;

app.innerHTML = `
  <header class="topbar"><div class="top-inner">
    <a href="./" class="brand" aria-label="HeroBet home"><span class="brand-mark">H<span>✦</span></span><span>HERO<span>BET</span><small>THE GAME IS ON</small></span></a>
    <div class="header-center"><span class="live-dot"></span> YOUR NEXT ADVENTURE AWAITS</div>
    <div class="header-right"><div class="balance"><span>DEMO BALANCE</span><strong id="balance">₦0.00</strong></div><button class="reset-btn" id="reset">Reset balance</button></div>
  </div></header>
  <main class="layout">
    <div class="page-heading"><div><div class="eyebrow"><span></span> THE ULTIMATE CRASH GAME</div><h1>SUPER <em>HERO</em><span class="heading-star">✦</span></h1><p>Ready for takeoff? Place your bet and cash out before the hero flies away.</p></div><div class="demo-pill"><span></span> FREE PLAY MODE</div></div>
    <div class="content-grid"><div class="main-column">
      <section class="game-shell" aria-label="Super Hero game">
        <div class="game-toolbar"><div class="game-title"><span class="game-icon">✦</span><div><strong>SUPER HERO</strong><small>THE SKY IS NOT THE LIMIT</small></div></div><div class="toolbar-right"><span class="round-indicator"><i></i> LIVE SIMULATION</span><span class="sound-mark" title="Sound is off">♪ <small>OFF</small></span></div></div>
        <div class="history-bar"><span class="history-label">PREVIOUS FLIGHTS <span>↗</span></span><div id="history" class="history-list"><span class="history-empty">Your round history will appear here</span></div></div>
        <div class="flight-scene" id="scene"><div class="scene-grid"></div><div class="scene-overlay"></div><div class="scene-top"><span><i></i> HERO FLIGHT</span><span>ROUND IN PROGRESS</span></div><div class="flight-center"><div id="phaseLabel" class="phase-label">GET READY FOR TAKEOFF</div><div id="multiplier" class="multiplier">1.00<span>×</span></div><div id="phaseMessage" class="phase-message">Place your bets for the next round</div><div class="progress-track" id="progressTrack"><div id="progress"></div></div></div><div class="scene-bottom"><span>✦ &nbsp; THE SKY IS YOURS</span><span>HERO<span class="gold">BET</span> / 01</span></div></div>
        <div class="game-foot"><div><span class="foot-icon">✧</span><span><strong>HOW TO PLAY</strong><small>Bet. Watch it fly. Cash out in time.</small></span></div><button id="howBtn">Game rules <span>↗</span></button></div>
      </section>
      <div class="section-heading"><div><span class="section-index">01 / YOUR BETS</span><h2>Make your move<span>.</span></h2></div><p>Choose your stake and get ready to fly.</p></div>
      <div class="mode-tabs" role="tablist" aria-label="Game mode"><button role="tab" data-mode="classic" aria-selected="true" class="active">Classic</button><button role="tab" data-mode="ou" aria-selected="false">O/U <span>OVER / UNDER</span></button></div>
      <div class="tickets" id="classicPanel">${ticketMarkup(0)}${ticketMarkup(1)}</div>
      <section class="ou-panel" id="ouPanel" hidden><div class="ou-heading"><div><span class="section-index">PREDICT THE FLIGHT</span><h3>Over or under<span>.</span></h3><p>Pick a coefficient and predict where the next flight will end.</p></div><span class="ticket-note">PLAY MONEY</span></div><div class="ou-slot-tabs" role="tablist" aria-label="Over Under bet slip"><button data-ou-slot="0" role="tab" aria-selected="true" class="active">Bet 1</button><button data-ou-slot="1" role="tab" aria-selected="false">Bet 2</button></div>${ouMarkup(0)}${ouMarkup(1)}</section>
    </div>
    <aside class="side-column"><section class="activity-panel"><div class="panel-heading"><div><span class="section-index">THE FLIGHT LOG</span><h2>Bet activity<span>.</span></h2></div><span class="activity-icon">↗</span></div><p class="panel-description">Keep track of your recent flights.</p><div class="activity-tabs" role="tablist"><button data-tab="all" class="active" role="tab" aria-selected="true">All bets</button><button data-tab="mine" role="tab" aria-selected="false">My bets</button></div><div class="table-head"><span>BET</span><span>FLIGHT</span><span>PAYOUT</span></div><div id="betList" class="bet-list"></div><div class="activity-foot"><span class="live-dot"></span> YOUR LOCAL GAME ACTIVITY</div></section>
      <section class="guide-card"><div class="guide-icon">✦</div><div><span class="section-index">FIRST TIME FLYING?</span><h3>Be your own hero.</h3><p>Place a bet, watch the multiplier climb and cash out before the hero flies away.</p><button id="guideBtn">Learn how to play <span>↗</span></button></div></section>
      <div class="responsible"><span>18+</span><p><strong>PLAY RESPONSIBLY</strong><br>This is a play-money demo. No real money can be deposited or won.</p></div>
    </aside></div>
    <footer><span>© 2026 HEROBET <b>✦</b> MADE FOR THE MOMENT.</span><span>DEMO GAME · NO REAL MONEY</span></footer>
  </main><div id="toast" class="toast" role="status" aria-live="polite"></div>
  <dialog id="rules"><div class="dialog-head"><span class="section-index">THE BASICS</span><button id="closeRules" aria-label="Close rules">×</button></div><h2>Ready for takeoff<span>.</span></h2><p>Super Hero is a crash game. Here's how to play:</p><ol><li>Choose your play-money stake and place a bet for the next round, even while a flight is in progress.</li><li>Watch the multiplier rise as the hero flies. Cash out at any time to win your stake multiplied by the current multiplier.</li><li>If the hero flies away before you cash out, your stake is lost. Auto cashout can do the work for you at your chosen multiplier.</li><li>In O/U, predict whether the next flight ends at or above your selected coefficient (Over), or below it (Under). Winning bets pay the displayed fixed multiplier; there is no cashout.</li></ol><div class="dialog-note">This is a browser-only simulation using play money. Outcomes are random, and past results do not predict future rounds. No deposits or withdrawals are available.</div><button class="dialog-action" id="gotIt">LET'S FLY <span>↗</span></button></dialog>`;

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const persist = () => { try { localStorage.setItem('herobet-demo-balance', String(state.balance)); } catch {} };
let toastTimer;
function notify(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000); }
function stakeFor(i) { return Number($(`#stake-${i}`).value); }
function validStake(n) { return Number.isFinite(n) && n >= 20 && n <= 150000 && Math.abs(Math.round(n * 100) - n * 100) < 1e-7; }
function placeBet(i, automatic = false) {
  if (state.nextTickets[i]) return;
  const stake = stakeFor(i);
  if (!validStake(stake)) { if (!automatic) notify('Enter a bet between ₦20 and ₦150,000.'); return; }
  if (stake > state.balance) { if (!automatic) notify('Not enough demo balance for this bet.'); else { state.autoBet[i] = false; $(`[data-auto-bet="${i}"]`).checked = false; notify('Auto bet stopped: not enough demo balance.'); } return; }
  const target = Number($(`[data-target="${i}"]`).value);
  if (state.autoCash[i] && (!Number.isFinite(target) || target < 1.01 || target > 1000)) { if (!automatic) notify('Auto cashout must be between 1.01× and 1000×.'); return; }
  state.balance = Math.round((state.balance - stake) * 100) / 100;
  state.nextTickets[i] = { stake, target: state.autoCash[i] ? target : null, status: 'queued' };
  persist(); render();
}
function cashout(i, multiplier = state.multiplier) {
  const bet = state.tickets[i];
  if (state.phase !== 'flying' || !bet || bet.status !== 'active') return;
  const payout = Math.round(bet.stake * multiplier * 100) / 100;
  state.balance = Math.round((state.balance + payout) * 100) / 100;
  bet.status = 'cashed'; bet.payout = payout; bet.multiplier = multiplier;
  state.bets.unshift({ stake: bet.stake, multiplier, payout, status: 'won', mode: 'Classic' }); state.bets = state.bets.slice(0, 30);
  persist(); notify(`Cashed out at ${multiplier.toFixed(2)}×!`); render();
}
function cancelBet(i) { const bet = state.nextTickets[i]; if (!bet) return; state.balance = Math.round((state.balance + bet.stake) * 100) / 100; state.nextTickets[i] = null; persist(); render(); }
function ouOdds(coefficient, side) {
  // The demo crash generator has P(crash >= c) = 0.97 / c for c > 1.
  const probability = side === 'over' ? 0.97 / coefficient : 1 - 0.97 / coefficient;
  return Math.floor((0.97 / probability) * 100 + 1e-9) / 100;
}
function placeOu(i, side) {
  if (state.nextOuTickets[i]) return;
  const stake = Number($(`[data-ou-stake="${i}"]`).value), coefficient = Number($(`[data-ou-coeff="${i}"]`).value);
  if (!validStake(stake)) return notify('Enter a bet between ₦20 and ₦150,000.');
  if (!Number.isFinite(coefficient) || coefficient < 1.1 || coefficient > 100 || Math.abs(coefficient * 100 - Math.round(coefficient * 100)) > 1e-7) return notify('Choose a coefficient between 1.10× and 100×, with at most two decimals.');
  if (stake > state.balance) return notify('Not enough demo balance for this bet.');
  state.balance = Math.round((state.balance - stake) * 100) / 100;
  state.nextOuTickets[i] = { stake, coefficient, side, odds: ouOdds(coefficient, side), status: 'queued' };
  persist(); render();
}
function cancelOu(i) { const bet = state.nextOuTickets[i]; if (!bet) return; state.balance = Math.round((state.balance + bet.stake) * 100) / 100; state.nextOuTickets[i] = null; persist(); render(); }
function randomCrash() { const values = new Uint32Array(1); crypto.getRandomValues(values); const u = values[0] / 4294967296; return Math.max(1, Math.min(100, Math.floor((0.97 / (1 - u)) * 100) / 100)); }
function startFlight(now) {
  state.phase = 'flying'; state.phaseStart = now; state.crash = randomCrash(); state.multiplier = 1;
  state.tickets = state.nextTickets; state.nextTickets = [null, null];
  state.ouTickets = state.nextOuTickets; state.nextOuTickets = [null, null];
  state.tickets.forEach(bet => { if (bet) bet.status = 'active'; });
  state.ouTickets.forEach(bet => { if (bet) bet.status = 'active'; });
}
function endFlight(now) {
  state.phase = 'crashed'; state.phaseStart = now; state.multiplier = state.crash;
  state.tickets.forEach(bet => { if (bet?.status === 'active') { bet.status = 'lost'; state.bets.unshift({ stake: bet.stake, multiplier: state.crash, payout: 0, status: 'lost', mode: 'Classic' }); } });
  state.ouTickets.forEach(bet => {
    if (!bet || bet.status !== 'active') return;
    const won = bet.side === 'over' ? state.crash >= bet.coefficient : state.crash < bet.coefficient;
    const payout = won ? Math.round(bet.stake * bet.odds * 100) / 100 : 0;
    state.balance = Math.round((state.balance + payout) * 100) / 100;
    bet.status = won ? 'won' : 'lost'; bet.payout = payout;
    state.bets.unshift({ stake: bet.stake, multiplier: state.crash, payout, status: bet.status, mode: `O/U ${bet.side === 'over' ? 'Over' : 'Under'} ${bet.coefficient.toFixed(2)}×` });
  });
  persist(); state.bets = state.bets.slice(0, 30); state.history.unshift(state.crash); state.history = state.history.slice(0, 8);
}
function startWaiting(now) { state.phase = 'waiting'; state.phaseStart = now; state.multiplier = 1; state.tickets = [null, null]; state.ouTickets = [null, null]; state.autoBet.forEach((enabled, i) => { if (enabled && !state.nextTickets[i]) placeBet(i, true); }); }
function tick(now) {
  if (state.phase === 'waiting' && now - state.phaseStart >= 7000) startFlight(now);
  else if (state.phase === 'flying') {
    const next = Math.floor(Math.exp((now - state.phaseStart) / 13000) * 100) / 100;
    state.tickets.forEach((bet, i) => { if (bet?.status === 'active' && bet.target && bet.target <= next && bet.target < state.crash) cashout(i, bet.target); });
    if (next >= state.crash) endFlight(now); else state.multiplier = next;
  } else if (state.phase === 'crashed' && now - state.phaseStart >= 3500) startWaiting(now);
  render(); requestAnimationFrame(tick);
}
let lastList = '';
function render() {
  $('#balance').textContent = `₦${money(state.balance)}`;
  const scene = $('#scene'); scene.classList.toggle('crashed', state.phase === 'crashed'); scene.classList.toggle('waiting', state.phase === 'waiting');
  $('#phaseLabel').textContent = state.phase === 'waiting' ? 'GET READY FOR TAKEOFF' : state.phase === 'crashed' ? 'FLEW AWAY!' : 'THE HERO IS FLYING';
  $('#multiplier').innerHTML = `${state.multiplier.toFixed(2)}<span>×</span>`;
  $('#phaseMessage').textContent = state.phase === 'waiting' ? 'Place your bets for the next round' : state.phase === 'crashed' ? 'Better luck on the next flight' : 'Cash out before the hero flies away';
  $('#progressTrack').hidden = state.phase !== 'waiting'; $('#progress').style.width = `${Math.min(100, (performance.now() - state.phaseStart) / 70)}%`;
  $('.scene-top span:last-child').textContent = state.phase === 'waiting' ? 'NEXT ROUND SOON' : state.phase === 'crashed' ? 'FLIGHT ENDED' : 'ROUND IN PROGRESS';
  $('#history').innerHTML = state.history.length ? state.history.map(n => `<span class="history-chip ${n >= 10 ? 'pink' : n >= 2 ? 'purple' : 'blue'}">${n.toFixed(2)}×</span>`).join('') : '<span class="history-empty">Your round history will appear here</span>';
  state.tickets.forEach((bet, i) => {
    const next = state.nextTickets[i], button = $(`[data-bet="${i}"]`), nextButton = $(`[data-next-bet="${i}"]`), stake = stakeFor(i), input = $(`#stake-${i}`);
    input.disabled = !!next; const ticket = input.closest('.ticket'); ticket.querySelectorAll('.adjust, [data-preset], [data-auto-cash], [data-target]').forEach(el => el.disabled = !!next);
    const active = state.phase === 'flying' && bet?.status === 'active';
    button.classList.toggle('cashout', active); button.classList.toggle('cancel', !active && !!next);
    button.disabled = false;
    if (active) button.innerHTML = `<strong>CASH OUT <span>↗</span></strong><small>₦${money(bet.stake * state.multiplier)}</small>`;
    else if (next) button.innerHTML = '<strong>CANCEL BET</strong><small>Queued for next flight</small>';
    else button.innerHTML = `<strong>${state.phase === 'waiting' ? 'PLACE BET' : 'BET NEXT ROUND'} <span>↗</span></strong><small>₦${money(Number.isFinite(stake) ? stake : 0)}</small>`;
    nextButton.hidden = !active; nextButton.textContent = next ? `Cancel next-round bet · ₦${money(next.stake)}` : '＋ Queue bet for next round';
  });
  [0, 1].forEach(i => {
    const next = state.nextOuTickets[i], current = state.ouTickets[i], slip = $(`[data-ou-slip="${i}"]`);
    slip.hidden = state.ouSlot !== i;
    slip.querySelectorAll('input, [data-ou-adjust], [data-ou-preset]').forEach(el => el.disabled = !!next);
    const coefficient = Number($(`[data-ou-coeff="${i}"]`).value), valid = Number.isFinite(coefficient) && coefficient >= 1.1 && coefficient <= 100;
    slip.querySelectorAll('[data-ou-bet]').forEach(button => { button.hidden = !!next; button.querySelector('small').textContent = valid ? `Pays ${ouOdds(coefficient, button.dataset.ouBet).toFixed(2)}×` : 'Set coefficient'; });
    slip.querySelector('[data-ou-cancel]').hidden = !next;
    const parts = [];
    if (current?.status === 'active') parts.push(`Current flight: ${current.side.toUpperCase()} ${current.coefficient.toFixed(2)}× · awaiting result`);
    else if (current && state.phase === 'crashed') parts.push(`Last flight: ${current.status === 'won' ? `won ₦${money(current.payout)}` : 'bet lost'}`);
    if (next) parts.push(`Next flight: ${next.side.toUpperCase()} ${next.coefficient.toFixed(2)}× · ₦${money(next.stake)} · pays ${next.odds.toFixed(2)}×`);
    $(`[data-ou-status="${i}"]`).textContent = parts.join(' | ') || 'Predict where the next flight ends.';
  });
  const listKey = JSON.stringify(state.bets); if (listKey !== lastList) { lastList = listKey; $('#betList').innerHTML = state.bets.length ? state.bets.map(b => `<div class="bet-row"><span><i class="player-avatar">Y</i><span><strong>${b.mode || 'Classic'}</strong><small>₦${money(b.stake)}</small></span></span><b class="${b.status === 'won' ? 'win' : ''}">${b.multiplier.toFixed(2)}×</b><strong class="${b.status === 'won' ? 'win' : 'loss'}">${b.status === 'won' ? '+' : ''}₦${money(b.payout)}</strong></div>`).join('') : '<div class="empty-state"><div class="empty-orbit">✦</div><strong>No flights just yet</strong><p>Place a bet and your activity<br>will show up here.</p></div>'; }
}
app.addEventListener('click', e => {
  const mode = e.target.closest('[data-mode]'); if (mode) { state.mode = mode.dataset.mode; document.querySelectorAll('[data-mode]').forEach(el => { const active = el === mode; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); }); $('#classicPanel').hidden = state.mode !== 'classic'; $('#ouPanel').hidden = state.mode !== 'ou'; return; }
  const slot = e.target.closest('[data-ou-slot]'); if (slot) { state.ouSlot = Number(slot.dataset.ouSlot); document.querySelectorAll('[data-ou-slot]').forEach(el => { const active = el === slot; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); }); render(); return; }
  const ouBet = e.target.closest('[data-ou-bet]'); if (ouBet) { placeOu(Number(ouBet.dataset.slot), ouBet.dataset.ouBet); return; }
  const ouCancel = e.target.closest('[data-ou-cancel]'); if (ouCancel) { cancelOu(Number(ouCancel.dataset.ouCancel)); return; }
  const ouAdjust = e.target.closest('[data-ou-adjust]'); if (ouAdjust) { const [type, delta] = ouAdjust.dataset.ouAdjust.split(':'); const input = ouAdjust.closest('.ou-slip').querySelector(type === 'stake' ? '[data-ou-stake]' : '[data-ou-coeff]'); const min = type === 'stake' ? 20 : 1.1, max = type === 'stake' ? 150000 : 100; input.value = (Math.max(min, Math.min(max, (Number(input.value) || min) + Number(delta)))).toFixed(type === 'stake' ? 0 : 2); render(); return; }
  const ouPreset = e.target.closest('[data-ou-preset]'); if (ouPreset) { ouPreset.closest('.ou-slip').querySelector('[data-ou-stake]').value = ouPreset.dataset.ouPreset; render(); return; }
  const nextButton = e.target.closest('[data-next-bet]'); if (nextButton) { const i = Number(nextButton.dataset.nextBet); if (state.nextTickets[i]) cancelBet(i); else placeBet(i); return; }
  const betButton = e.target.closest('[data-bet]'); if (betButton) { const i = Number(betButton.dataset.bet), bet = state.tickets[i]; if (state.phase === 'flying' && bet?.status === 'active') cashout(i); else if (state.nextTickets[i]) cancelBet(i); else placeBet(i); return; }
  const adjust = e.target.closest('[data-adjust]'); if (adjust) { const input = adjust.closest('.ticket').querySelector('.stake-input'); input.value = Math.max(20, Math.min(150000, (Number(input.value) || 20) + Number(adjust.dataset.adjust) * 10)); render(); }
  const preset = e.target.closest('[data-preset]'); if (preset) { preset.closest('.ticket').querySelector('.stake-input').value = preset.dataset.preset; render(); }
  const tab = e.target.closest('[data-tab]'); if (tab) { state.tab = tab.dataset.tab; document.querySelectorAll('[data-tab]').forEach(el => { const active = el === tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); }); }
});
app.addEventListener('change', e => { if (e.target.matches('[data-auto-bet]')) state.autoBet[Number(e.target.dataset.autoBet)] = e.target.checked; if (e.target.matches('[data-auto-cash]')) state.autoCash[Number(e.target.dataset.autoCash)] = e.target.checked; render(); });
app.addEventListener('input', e => { if (e.target.matches('.stake-input, [data-ou-stake], [data-ou-coeff]')) render(); });
$('#reset').addEventListener('click', () => { if ([...state.tickets, ...state.nextTickets, ...state.ouTickets, ...state.nextOuTickets].some(b => b?.status === 'queued' || b?.status === 'active')) return notify('Finish or cancel your active bets before resetting.'); state.balance = 10000; persist(); render(); notify('Demo balance reset to ₦10,000.00.'); });
$('#howBtn').addEventListener('click', () => $('#rules').showModal()); $('#guideBtn').addEventListener('click', () => $('#rules').showModal()); $('#closeRules').addEventListener('click', () => $('#rules').close()); $('#gotIt').addEventListener('click', () => $('#rules').close());
render(); requestAnimationFrame(tick);
