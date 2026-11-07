import './site.css';
import './account.css';
import { auth } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { ensurePlayer, ensureWallet, normalizeBets } from './player.js';
import { isAdminUser } from './access.js';
import { getDepositAccount, listWalletTransactions, submitDepositRequest, submitWithdrawalRequest } from './payments.js';

const app = document.querySelector('#app'), page = document.body.dataset.page;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brand = `<a class="site-brand" href="./" aria-label="HeroBet home"><span class="site-mark">H<span>✦</span></span><span>HERO<span>BET</span><small>THE GAME IS ON</small></span></a>`;

// Small, inline icons keep the account interface sharp without an icon font.
const accountIcons = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8M6.2 6.2C3.4 8.1 2 12 2 12s3.5 6 10 6a10.7 10.7 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  wallet: '<path d="M4 5h13a3 3 0 0 1 3 3v11H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h12"/><path d="M15 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/>',
  withdraw: '<path d="M3 7h13a3 3 0 0 1 3 3v9H6a3 3 0 0 1-3-3V7Z"/><path d="M7 7V5a2 2 0 0 1 2-2h10v11M13 10v6m-3-3 3 3 3-3"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 20h4m-2-7v7M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  transaction: '<circle cx="12" cy="12" r="9"/><path d="M8 9h8m-3-3 3 3-3 3m0 3H8m3-3-3 3 3 3"/>',
  gift: '<path d="M3 10h18v11H3V10Zm-1-4h20v4H2V6Zm10 0v15M12 6H8.5A2.5 2.5 0 1 1 11 3.5L12 6Zm0 0h3.5A2.5 2.5 0 1 0 13 3.5L12 6Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m14 10 6-6m-3 0h3v3"/>',
  headset: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Zm-3 6c0 1-1 2-3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  wishlist: '<path d="m12 3 2.4 5 5.6.8-4 4 .9 5.7-4.9-2.7-4.9 2.7.9-5.7-4-4 5.6-.8L12 3Z"/><path d="m5 17-2 4m16-4 2 4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/><circle cx="5" cy="5" r="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
  menu: '<path d="M5 5h14M5 12h14M5 19h14"/>',
  gamepad: '<path d="M8 7h8a6 6 0 0 1 5.7 7.8l-1 3a2.5 2.5 0 0 1-4.1.9L15 17H9l-1.6 1.7a2.5 2.5 0 0 1-4.1-.9l-1-3A6 6 0 0 1 8 7Z"/><path d="M7 10v4m-2-2h4m7-1h.1m2 2h.1"/>',
  bets: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function accountIcon(name, extra = '') {
  return `<svg class="account-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${accountIcons[name] || accountIcons.info}</svg>`;
}
const accountChevron = '<svg class="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const header = `<header class="site-header"><div class="nav-wrap">${brand}<nav class="site-nav" aria-label="Main navigation"><a href="./">Home</a><a href="./game.html">Super Hero</a><a href="./dashboard.html">Dashboard</a></nav><div class="nav-actions" id="navActions"><a href="./login.html" class="nav-login">Log in</a><a href="./signup.html" class="nav-signup">Create account <span>↗</span></a></div></div></header>`;
const footer = `<footer class="site-footer"><div>${brand}<p>A little courage goes a long way.</p></div><div class="footer-links"><a href="./game.html">Play Super Hero</a><a href="./dashboard.html">Dashboard</a><a href="./login.html">Log in</a></div><div class="footer-note"><b>18+ &nbsp; PLAY RESPONSIBLY</b><p>Play-money demo only. No real-money deposits, withdrawals or winnings.</p><small>© 2026 HEROBET</small></div></footer>`;

const home = `${header}<main><section class="home-hero"><div class="hero-copy"><div class="kicker"><span></span> YOUR NEXT ADVENTURE AWAITS</div><h1>THE SKY IS<br>NOT THE <em>LIMIT<span>.</span></em></h1><p>Big flights. Bigger moments. Step into Super Hero and see how far you can go.</p><div class="hero-actions"><a class="primary-link" href="./game.html">PLAY SUPER HERO <span>↗</span></a><a class="secondary-link" href="./signup.html">CREATE AN ACCOUNT</a></div><div class="hero-meta"><span>✦ &nbsp; ONE GAME. ENDLESS FLIGHTS.</span><span>18+ &nbsp; PLAY RESPONSIBLY</span></div></div><div class="hero-visual"><div class="hero-orbit"></div><img src="./flying-hero.png" alt="A superhero flying through space" /><div class="hero-visual-label"><span>FEATURED GAME / 01</span><strong>SUPER <em>HERO</em></strong><small>YOUR NEXT FLIGHT IS CALLING</small></div></div></section><div class="ticker"><span>✦ &nbsp; AIM HIGHER</span><span>✦ &nbsp; YOUR MOMENT TO FLY</span><span>✦ &nbsp; PLAY YOUR WAY</span><span>✦ &nbsp; AIM HIGHER</span></div><section class="home-section"><div class="section-top"><div><div class="kicker"><span></span> YOUR GAME, YOUR RULES</div><h2>ONE HERO. <em>ENDLESS</em> POSSIBILITIES<span>.</span></h2></div><p>Choose your mode and make every flight count.</p></div><div class="feature-grid"><a class="feature-card featured" href="./game.html"><div><span class="feature-number">01 / FEATURED GAME</span><h3>SUPER<br><em>HERO</em></h3><p>Take off, watch the multiplier climb and make your move.</p><span class="feature-cta">TAKE FLIGHT &nbsp; ↗</span></div><img src="./flying-hero.png" alt="" /></a><div class="feature-side"><div class="mini-feature"><span class="mini-icon">↗</span><div><h3>CLASSIC</h3><p>Cash out before the hero flies away.</p></div></div><div class="mini-feature"><span class="mini-icon gold">◈</span><div><h3>OVER / UNDER</h3><p>Predict where the next flight will end.</p></div></div><div class="demo-callout"><strong>JUST HERE FOR THE THRILL?</strong><p>Start with play money. No deposit needed.</p><a href="./game.html">Try the demo ↗</a></div></div></div></section><section class="steps-section"><div class="kicker"><span></span> IT'S EASY TO GET STARTED</div><h2>READY FOR <em>TAKEOFF?</em></h2><div class="steps"><div><b>01</b><h3>CREATE YOUR ACCOUNT</h3><p>Sign up and make HeroBet your own.</p></div><div><b>02</b><h3>CHOOSE YOUR MODE</h3><p>Play Classic or predict with Over / Under.</p></div><div><b>03</b><h3>ENJOY THE FLIGHT</h3><p>Place your demo bet and watch the hero soar.</p></div></div></section></main>${footer}`;
function authPage(signup) { return `${header}<main class="auth-layout"><div class="auth-art"><div class="auth-art-copy"><span class="kicker"><span></span> THE GAME IS ON</span><h1>YOUR NEXT<br><em>GREAT FLIGHT</em><br>STARTS HERE<span>.</span></h1><p>Join the adventure. Your moment is waiting.</p></div><img src="./flying-hero.png" alt="" /><span class="art-bottom">HEROBET &nbsp; / &nbsp; SUPER HERO</span></div><section class="auth-content"><div class="auth-box"><div class="kicker"><span></span> ${signup ? 'JOIN THE ADVENTURE' : 'WELCOME BACK'}</div><h1>${signup ? 'CREATE YOUR ACCOUNT' : 'READY TO FLY AGAIN'}<span>.</span></h1><p>${signup ? 'Your next adventure is just a few details away.' : 'Log in to pick up where you left off.'}</p><form id="authForm">${signup ? '<label>Display name<input name="name" autocomplete="name" placeholder="What should we call you?" maxlength="40" required></label>' : ''}<label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" placeholder="${signup ? 'At least 6 characters' : 'Enter your password'}" required></label>${signup ? '<label class="check-label"><input type="checkbox" name="adult" required> <span>I am 18 or older and understand this is a play-money demo.</span></label>' : '<button class="text-button forgot" type="button" id="forgot">Forgot password?</button>'}<div class="form-error" id="formError" role="alert"></div><button class="primary-link form-submit" type="submit">${signup ? 'CREATE ACCOUNT' : 'LOG IN'} <span>↗</span></button></form><div class="auth-switch">${signup ? 'Already have an account? <a href="./login.html">Log in</a>' : 'New to HeroBet? <a href="./signup.html">Create an account</a>'}</div><a class="guest-link" href="./game.html">Continue to the demo without an account ↗</a></div></section></main>`; }
const accountBottomNav = (active = 'dashboard') => `<nav class="account-bottom-nav" aria-label="Account navigation">
  <a class="${active === 'home' ? 'active' : ''}" href="./app-home.html" ${active === 'home' ? 'aria-current="page"' : ''}>${accountIcon('home')}<span>Home</span>${active === 'home' ? '<i></i>' : ''}</a>
  <button type="button" data-account-action="az-menu">${accountIcon('menu')}<span>AZ Menu</span></button>
  <a href="./game.html">${accountIcon('gamepad')}<span>Games</span></a>
  <button type="button" data-account-action="bet-history">${accountIcon('bets')}<span>My Bets</span></button>
  <a class="${active === 'dashboard' ? 'active' : ''}" href="./dashboard.html" ${active === 'dashboard' ? 'aria-current="page"' : ''}>${accountIcon('user')}<span>Account</span>${active === 'dashboard' ? '<i></i>' : ''}</a>
</nav>`;
const dashboard = `<main class="account-page"><div id="dashboardContent"><div class="account-loading" role="status"><span class="account-loading-mark">H</span><strong>Loading your account…</strong></div></div></main>${accountBottomNav('dashboard')}<dialog id="accountDialog" class="account-dialog" aria-labelledby="accountDialogTitle"><div id="accountDialogContent"></div></dialog><div id="accountToast" class="account-toast" role="status" aria-live="polite"></div>`;
const appHome = `<main class="app-home-page"><header class="app-home-header"><a class="app-home-brand" href="./app-home.html"><span class="site-mark">H<span>✦</span></span><span>HERO<span>BET</span><small>PLAYER LOBBY</small></span></a><a class="app-home-account" href="./dashboard.html">My account ↗</a></header><section class="app-home-welcome"><span class="app-home-kicker"><i></i> YOUR PLAYER LOBBY</span><h1>Welcome back<span id="lobbyName">, Hero</span><span class="app-home-dot">.</span></h1><p>Your place for the game, your bets, rewards, and referrals.</p></section><section class="app-home-feature"><div class="app-home-feature-copy"><span>FEATURED GAME · 01</span><h2>SUPER<br><em>HERO</em></h2><p>Enter the flight and follow the current practice round.</p><a href="./game.html">OPEN SUPER HERO <b>↗</b></a></div><img src="./flying-hero.png" alt="Super Hero flying" /></section><section class="app-home-status"><div class="app-home-status-icon">✦</div><div><span>GAME STATUS</span><strong>Practice mode · rounds are not yet shared</strong><p>Every browser currently runs its own play-money simulation. A server engine is required before everyone can see the same always-on flight.</p></div></section><section class="app-home-shortcuts"><a href="./dashboard.html"><span>◉</span><strong>Account & wallet</strong><small>View your account summary</small><b>↗</b></a><div><span>♧</span><strong>Loyalty rewards</strong><small>0.01% target rate · pending secure settlement</small><b>LOCKED</b></div><div><span>⌁</span><strong>Refer a player</strong><small>Upline reward target: 0.01% of eligible downline bets</small><b>SOON</b></div></section><p class="app-home-disclaimer">Real-money betting and cash rewards are not enabled. Do not deposit for gameplay. Rewards and referral commissions must be settled by a trusted server ledger.</p></main>${accountBottomNav('home')}`;
app.innerHTML = page === 'home' ? home : page === 'dashboard' ? dashboard : page === 'app-home' ? appHome : authPage(page === 'signup');
const actions = document.querySelector('#navActions');
let dashUnsubscribe, dashboardUser = null, dashboardData = null, dashboardWallet = null, dashboardRequest = 0;
let balanceVisible = true, accountToastTimer;
function authMessage(error) {
  const code = error?.code || '';
  if (code.includes('email-already-in-use')) return 'This email already has an account. Try logging in.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('weak-password')) return 'Please choose a password with at least 6 characters.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect. Please try again.';
  if (code.includes('network-request-failed')) return 'Connection failed. Check your internet and try again.';
  if (code.includes('operation-not-allowed')) return 'Email sign-in is not enabled in Firebase yet.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait and try again.';
  return 'Something went wrong. Please try again.';
}
const form = document.querySelector('#authForm');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'), error = document.querySelector('#formError'); error.textContent = ''; button.disabled = true; const original = button.innerHTML; button.textContent = page === 'signup' ? 'CREATING ACCOUNT…' : 'LOGGING IN…';
    const data = new FormData(form);
    try {
      if (page === 'signup') {
        const name = String(data.get('name')).trim(); if (!name) { error.textContent = 'Please enter a display name.'; return; }
        const credential = await createUserWithEmailAndPassword(auth, String(data.get('email')).trim(), String(data.get('password')));
        try { await updateProfile(credential.user, { displayName: name }); } catch { /* account remains usable */ }
      } else await signInWithEmailAndPassword(auth, String(data.get('email')).trim(), String(data.get('password')));
      location.href = isAdminUser(auth.currentUser) ? './admin.html' : './dashboard.html';
    } catch (err) { error.textContent = authMessage(err); }
    finally { button.disabled = false; button.innerHTML = original; }
  });
  document.querySelector('#forgot')?.addEventListener('click', async () => {
    const error = document.querySelector('#formError'), email = form.elements.email.value.trim();
    if (!email) { error.textContent = 'Enter your email above to reset your password.'; return; }
    try { await sendPasswordResetEmail(auth, email); error.textContent = 'If an account exists for this email, a reset link has been sent.'; } catch (err) { error.textContent = authMessage(err); }
  });
}
const accountNumber = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const accountMoney = value => `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NEXT_TIER_POINTS = 1980000;

function accountIdentity(user) {
  if (user.displayName) return user.displayName;
  const local = String(user.email || 'Hero').split('@')[0];
  if (/^\+?[\d\s-]+$/.test(local) && local.length > 4) return `${local.slice(0, 2)}*******${local.slice(-1)}`;
  return local;
}

function accountLoyalty(data) {
  const bets = data?.bets || [];
  const eligibleStake = bets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const points = Math.min(NEXT_TIER_POINTS, Math.floor(eligibleStake));
  return {
    points,
    remaining: Math.max(0, NEXT_TIER_POINTS - points),
    progress: Math.min(100, points / NEXT_TIER_POINTS * 100),
    // A display-only demo reward; it has no cash value and is not withdrawable.
    reward: Math.floor(eligibleStake * 0.0001 * 100) / 100,
  };
}

function accountQuickActions() {
  return `<div class="account-quick-actions" aria-label="Account shortcuts">
    <button type="button" data-account-action="bet-history">${accountIcon('receipt')}<span>Bet History</span></button>
    <button type="button" data-account-action="transactions">${accountIcon('transaction')}<span>Transactions</span></button>
    <button type="button" data-account-action="gifts">${accountIcon('gift')}<span>Gifts (0)</span></button>
  </div>`;
}

function accountMenuRow(action, icon, label, service = false) {
  return `<button class="account-menu-row" type="button" data-account-action="${action}">${accountIcon(icon)}<span>${label}</span>${service ? '<i class="account-service-dot" aria-hidden="true"></i>' : ''}${accountChevron}</button>`;
}

function accountScreen(user, data, wallet) {
  const signedIn = Boolean(user);
  const loyalty = accountLoyalty(data);
  const rawBalance = signedIn ? (wallet ? accountMoney(wallet.balance) : 'NGN —') : accountMoney(0);
  const balance = balanceVisible ? rawBalance : 'NGN ••••••';
  const reward = signedIn && data ? accountMoney(loyalty.reward) : '—';
  return `<div class="account-screen ${signedIn ? 'is-signed-in' : 'is-signed-out'}">
    <section class="account-hero" aria-label="Account summary">
      <div class="account-profile">
        ${signedIn ? `<button class="account-avatar" type="button" data-account-action="personal" aria-label="Open personal page"><img src="./flying-hero.png" alt="" /></button>` : `<a class="account-avatar account-avatar-guest" href="./login.html" aria-label="Log in">${accountIcon('user')}</a>`}
        ${signedIn ? `<button class="account-profile-link account-name" type="button" data-account-action="personal">${esc(accountIdentity(user))}${accountChevron}</button><button class="account-settings-button" type="button" data-account-action="settings" aria-label="Account settings">${accountIcon('settings')}</button>` : `<a class="account-profile-link" href="./login.html">Login to View${accountChevron}</a><button class="account-settings-button" type="button" data-account-action="appearance" aria-label="Switch colour theme">${accountIcon('sun')}</button>`}
      </div>
      ${signedIn ? `<div class="account-tier">
        <div class="account-tier-line"><span><strong>${accountNumber.format(loyalty.points)}</strong><span> / ${accountNumber.format(NEXT_TIER_POINTS)} Tier Points</span></span><button type="button" data-account-action="loyalty" aria-label="About tier points">${accountIcon('info')}</button></div>
        <div class="account-tier-track" role="progressbar" aria-label="Progress to Galactico" aria-valuemin="0" aria-valuemax="${NEXT_TIER_POINTS}" aria-valuenow="${loyalty.points}"><i style="width:${loyalty.progress}%"><b>H</b></i></div>
        <div class="account-tier-labels"><span>Golden Boot</span><span>${accountNumber.format(loyalty.remaining)} Tier Points to Galactico</span></div>
      </div>` : ''}
      <div class="account-balance">
        <span>Total Balance</span>
        <div><button type="button" data-account-action="toggle-balance" aria-label="${balanceVisible ? 'Hide' : 'Show'} balance" aria-pressed="${!balanceVisible}">${accountIcon(balanceVisible ? 'eye' : 'eyeOff')}</button><strong class="account-balance-value">${balance}</strong></div>
      </div>
    </section>
    <div class="account-main">
      <div class="account-wallet-actions">
        <button class="account-deposit" type="button" data-account-action="deposit">${accountIcon('wallet')}<span>Deposit</span></button>
        <button class="account-withdraw" type="button" data-account-action="withdraw">${accountIcon('withdraw')}<span>Withdraw</span></button>
      </div>
      <button class="account-loyalty-card" type="button" data-account-action="loyalty">
        <span class="account-loyalty-name">${accountIcon('trophy')}<strong>Loyalty Rewards</strong></span>
        <span class="account-reward"><small>Potential Reward</small><strong>${reward}</strong></span>${accountChevron}
      </button>
      ${accountQuickActions()}
      <nav class="account-menu" aria-label="Account options">
        ${accountMenuRow('personal', 'user', 'Personal Page')}
        ${signedIn ? accountMenuRow('missions', 'target', 'Missions') : ''}
        ${accountMenuRow('support', 'headset', '24/7 Customer Service', true)}
        ${accountMenuRow('how-to', 'info', 'How to play')}
        ${accountMenuRow('wishlist', 'wishlist', 'Wishlist')}
        ${accountMenuRow('download', 'download', 'Download App')}
      </nav>
      <p class="account-demo-note">18+ · Super Hero uses play money. Your Firestore wallet is separate.</p>
    </div>
  </div>`;
}

function closeAccountDialog() {
  const dialog = document.querySelector('#accountDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function openAccountDialog(title, body, subtitle = 'MY HEROBET') {
  const dialog = document.querySelector('#accountDialog');
  const content = document.querySelector('#accountDialogContent');
  if (!dialog || !content) return;
  content.innerHTML = `<div class="account-dialog-head"><div><span>${esc(subtitle)}</span><h2 id="accountDialogTitle">${esc(title)}</h2></div><button type="button" data-account-action="close-dialog" aria-label="Close dialog">${accountIcon('close')}</button></div><div class="account-dialog-body">${body}</div>`;
  if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
  else dialog.setAttribute('open', '');
}

function notifyAccount(message) {
  const toast = document.querySelector('#accountToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(accountToastTimer);
  accountToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function accountLoginPrompt(title, message) {
  openAccountDialog(title, `<div class="account-dialog-empty">${accountIcon('user')}<p>${esc(message)}</p></div><a class="account-dialog-primary" href="./login.html">Log in${accountChevron}</a><a class="account-dialog-secondary" href="./signup.html">Create an account</a>`);
}

function accountHistoryMarkup(bets) {
  if (!bets.length) return `<div class="account-dialog-empty">${accountIcon('receipt')}<h3>No flights just yet</h3><p>Your recent settled demo bets will appear here.</p><a href="./game.html">Take your first flight ↗</a></div>`;
  return `<div class="account-history-labels"><span>GAME</span><span>BET</span><span>FLIGHT</span><span>PAYOUT</span></div><div class="account-history">${bets.slice(0, 15).map(bet => `<div class="account-history-row"><span><strong>${esc(bet.mode || 'Classic')}</strong><small>Super Hero</small></span><span>${accountMoney(bet.stake)}</span><span>${Number(bet.multiplier || 0).toFixed(2)}×</span><strong class="${bet.status === 'won' ? 'win' : ''}">${accountMoney(bet.payout)}</strong></div>`).join('')}</div>`;
}

function showBetHistory() {
  if (!dashboardUser) return accountLoginPrompt('Bet History', 'Log in to see your saved demo bet history across devices.');
  const bets = dashboardData?.bets || [];
  openAccountDialog('Bet History', accountHistoryMarkup(bets), `${bets.length} RECENT SETTLED BETS`);
}

function walletTransactionMarkup(rows) {
  if (!rows.length) return `<div class="account-dialog-empty">${accountIcon('transaction')}<h3>No wallet transactions yet</h3><p>Approved admin-reviewed deposits and completed withdrawals will appear here.</p></div>`;
  return `<div class="account-wallet-transactions">${rows.map(row => `<div><span class="${row.type === 'deposit' ? 'credit' : 'debit'}">${row.type === 'deposit' ? '+' : '−'}${accountMoney(row.amount)}</span><span><strong>${row.type === 'deposit' ? 'Deposit approved' : 'Withdrawal completed'}</strong><small>${row.createdAt ? new Date(row.createdAt).toLocaleString('en-NG') : 'Wallet transaction'}</small></span><strong>${accountMoney(row.balanceAfter)}</strong></div>`).join('')}</div>`;
}

async function showTransactions() {
  if (!dashboardUser) return accountLoginPrompt('Transactions', 'Log in to view your wallet activity.');
  const uid = dashboardUser.uid;
  openAccountDialog('Transactions', `<div class="account-wallet-current"><span>Available wallet balance</span><strong>${dashboardWallet ? accountMoney(dashboardWallet.balance) : 'Loading…'}</strong></div><div class="account-dialog-empty"><p>Loading wallet transactions…</p></div>`, 'NGN WALLET ACTIVITY');
  try {
    const rows = await listWalletTransactions(uid);
    if (dashboardUser?.uid !== uid) return;
    openAccountDialog('Transactions', `<div class="account-wallet-current"><span>Available wallet balance</span><strong>${dashboardWallet ? accountMoney(dashboardWallet.balance) : 'Loading…'}</strong></div>${walletTransactionMarkup(rows)}<div class="account-demo-callout">${accountIcon('info')}<p>Wallet transactions are separate from Super Hero play-money bet history.</p></div>`, 'NGN WALLET ACTIVITY');
  } catch {
    if (dashboardUser?.uid === uid) openAccountDialog('Transactions', '<div class="account-dialog-empty"><h3>Could not load transactions</h3><p>Check your connection and Firestore rules, then try again.</p></div>', 'NGN WALLET ACTIVITY');
  }
}

function showPersonalPage() {
  if (!dashboardUser) return accountLoginPrompt('Personal Page', 'Log in to view and manage your HeroBet account.');
  openAccountDialog('Personal Page', `<div class="account-personal-card"><div class="account-personal-avatar"><img src="./flying-hero.png" alt="" /></div><div><span>SIGNED IN AS</span><h3>${esc(dashboardUser.displayName || accountIdentity(dashboardUser))}</h3><p>${esc(dashboardUser.email || 'Demo player')}</p></div></div><dl class="account-details"><div><dt>Wallet currency</dt><dd>NGN</dd></div><div><dt>Wallet balance</dt><dd>${dashboardWallet ? accountMoney(dashboardWallet.balance) : 'Loading…'}</dd></div><div><dt>Settled bets stored</dt><dd>${dashboardData?.bets?.length || 0} / 30</dd></div></dl><a class="account-dialog-primary" href="./game.html">Play Super Hero${accountChevron}</a><button class="account-dialog-secondary" type="button" data-account-action="sign-out">Log out</button>`, 'YOUR ACCOUNT');
}

function showMissions() {
  const bets = dashboardData?.bets || [];
  const ouPlayed = bets.some(bet => String(bet.mode).startsWith('O/U'));
  openAccountDialog('Missions', `<div class="account-mission"><span>${bets.length ? '✓' : '01'}</span><div><h3>First flight</h3><p>Place and settle your first Super Hero demo bet.</p><strong>${bets.length ? 'COMPLETE' : 'IN PROGRESS'}</strong></div></div><div class="account-mission"><span>${ouPlayed ? '✓' : '02'}</span><div><h3>Make the call</h3><p>Try an Over / Under prediction in demo mode.</p><strong>${ouPlayed ? 'COMPLETE' : 'IN PROGRESS'}</strong></div></div><a class="account-dialog-primary" href="./game.html">Go to game${accountChevron}</a>`, 'DEMO CHALLENGES');
}

function showLoyalty() {
  if (!dashboardUser) return accountLoginPrompt('Loyalty Rewards', 'Log in to track demo tier points from your settled Super Hero bets.');
  const loyalty = accountLoyalty(dashboardData);
  openAccountDialog('Loyalty Rewards', `<div class="account-loyalty-summary"><span>GOLDEN BOOT</span><strong>${accountNumber.format(loyalty.points)}</strong><small>DEMO TIER POINTS</small><div><i style="width:${loyalty.progress}%"></i></div><p>${accountNumber.format(loyalty.remaining)} points to Galactico</p></div><div class="account-demo-callout">${accountIcon('info')}<p>The target rate is 0.01% of eligible settled stake. This estimate uses up to 30 recent demo bets only; no real rewards accrue or can be withdrawn until secure server settlement is enabled.</p></div>`, 'YOUR TIER');
}

function wishlistHasHero() {
  try { return localStorage.getItem('herobet-wishlist') === 'super-hero'; } catch { return false; }
}

function showWishlist() {
  const saved = wishlistHasHero();
  openAccountDialog('Wishlist', `<div class="account-wishlist-game"><img src="./flying-hero.png" alt="" /><div><span>CRASH GAME</span><h3>Super Hero</h3><p>Classic and Over / Under demo modes.</p></div></div><button class="account-dialog-primary" type="button" data-account-action="toggle-wishlist">${saved ? 'Remove from wishlist' : 'Add to wishlist'}${accountChevron}</button><a class="account-dialog-secondary" href="./game.html">Play now</a>`, saved ? '1 SAVED GAME' : 'YOUR SAVED GAMES');
}

function showDownload() {
  openAccountDialog('Download App', `<div class="account-download-icon">H</div><h3 class="account-center-title">Take HeroBet with you</h3><p class="account-dialog-copy">Install this web app from your browser menu. On Android, choose <strong>Add to Home screen</strong>. On iPhone, use Share, then <strong>Add to Home Screen</strong>.</p><div class="account-demo-callout">${accountIcon('info')}<p>This is a web demo, not a native app store download. No real-money betting is available.</p></div>`, 'HEROBET ON THE GO');
}

function showSupport() {
  openAccountDialog('24/7 Customer Service', `<div class="account-dialog-empty">${accountIcon('headset')}<h3>Demo support</h3><p>Live customer service is not connected in this prototype. You can find complete gameplay instructions under How to play.</p></div><button class="account-dialog-primary" type="button" data-account-action="how-to">Open game guide${accountChevron}</button>`, 'HELP CENTRE');
}

function showHowTo() {
  openAccountDialog('How to play', `<ol class="account-rules"><li><strong>Choose a mode</strong>Play Classic or predict the flight in Over / Under.</li><li><strong>Set your demo stake</strong>Place a bet for the next round with play money.</li><li><strong>Watch the hero fly</strong>In Classic, cash out before the hero flies away. O/U bets settle when the round ends.</li><li><strong>Check your history</strong>Your 30 most recent settled bets are saved to your signed-in demo account.</li></ol><div class="account-demo-callout">${accountIcon('info')}<p>Outcomes are randomly simulated in your browser. Past flights do not predict future results. No real money can be deposited, withdrawn or won.</p></div><a class="account-dialog-primary" href="./game.html">Play Super Hero${accountChevron}</a>`, 'THE BASICS');
}

function showAzMenu() {
  openAccountDialog('AZ Menu', `<a class="account-game-link" href="./game.html"><span>${accountIcon('gamepad')}</span><div><strong>Super Hero</strong><small>Classic crash game</small></div>${accountChevron}</a><a class="account-game-link" href="./game.html"><span>${accountIcon('target')}</span><div><strong>Super Hero O/U</strong><small>Over / Under predictions</small></div>${accountChevron}</a>`, 'ALL GAMES · A–Z');
}

function showSettings() {
  openAccountDialog('Settings', `<div class="account-setting-row"><div><strong>Show balance</strong><p>Display your demo balance on this page.</p></div><button type="button" data-account-action="toggle-balance-and-settings" aria-pressed="${balanceVisible}">${balanceVisible ? 'On' : 'Off'}</button></div><div class="account-setting-row"><div><strong>Light theme</strong><p>Switch between dark and light account colours.</p></div><button type="button" data-account-action="appearance-settings" aria-pressed="${document.body.classList.contains('account-light')}">${document.body.classList.contains('account-light') ? 'On' : 'Off'}</button></div><button class="account-dialog-secondary" type="button" data-account-action="sign-out">Log out</button>`, 'PREFERENCES');
}

function depositAccountMarkup(account) {
  return `<dl class="account-bank-details"><div><dt>Bank</dt><dd>${esc(account.bankName)}</dd></div><div><dt>Account name</dt><dd>${esc(account.accountName)}</dd></div><div><dt>Account number</dt><dd>${esc(account.accountNumber)}</dd></div></dl>`;
}

async function showWallet(kind) {
  const deposit = kind === 'deposit';
  const title = deposit ? 'Manual deposit' : 'Request withdrawal';
  if (!dashboardUser) return accountLoginPrompt(title, 'Log in to use your NGN wallet.');
  const uid = dashboardUser.uid;
  if (deposit) {
    openAccountDialog(title, '<div class="account-dialog-empty"><p>Loading the admin deposit account…</p></div>', 'ADMIN-REVIEWED PAYMENT');
    try {
      const account = await getDepositAccount();
      if (dashboardUser?.uid !== uid) return;
      if (!account) {
        openAccountDialog(title, `<div class="account-dialog-empty">${accountIcon('info')}<h3>Deposit account unavailable</h3><p>The admin has not provided a receiving account yet. Contact <a href="mailto:beniwealth70@gmail.com">beniwealth70@gmail.com</a>.</p></div>`, 'ADMIN-REVIEWED PAYMENT');
        return;
      }
      openAccountDialog(title, `<p class="account-dialog-copy account-left-copy">Transfer NGN to the admin account below, then submit your transfer reference. Your wallet is credited only after the admin verifies and approves it.</p>${depositAccountMarkup(account)}<form id="depositRequestForm" class="account-payment-form"><label for="depositAmount">Amount transferred (NGN)</label><div class="account-amount-field"><span>NGN</span><input id="depositAmount" name="amount" type="number" min="20" max="1000000000" step="0.01" inputmode="decimal" required /></div><label for="depositSender">Sender name (optional)</label><input id="depositSender" name="senderName" maxlength="100" autocomplete="name" /><label for="depositReference">Transfer reference</label><input id="depositReference" name="reference" minlength="3" maxlength="80" required /><div class="account-wallet-error" role="alert"></div><button class="account-dialog-primary" type="submit">Submit deposit for review${accountChevron}</button></form>`, 'ADMIN-REVIEWED PAYMENT');
    } catch {
      if (dashboardUser?.uid === uid) openAccountDialog(title, '<div class="account-dialog-empty"><h3>Could not load the deposit account</h3><p>Check your connection and Firestore rules, then try again.</p></div>', 'ADMIN-REVIEWED PAYMENT');
    }
    return;
  }
  openAccountDialog(title, `<div class="account-wallet-current"><span>Available wallet balance</span><strong>${dashboardWallet ? accountMoney(dashboardWallet.balance) : 'Loading…'}</strong></div><p class="account-dialog-copy account-left-copy">The admin reviews each request before making the bank transfer. Your wallet is debited only when the admin marks the withdrawal as paid.</p><form id="withdrawalRequestForm" class="account-payment-form"><label for="withdrawalAmount">Amount (NGN)</label><div class="account-amount-field"><span>NGN</span><input id="withdrawalAmount" name="amount" type="number" min="20" max="1000000000" step="0.01" inputmode="decimal" required /></div><label for="withdrawalBank">Bank name</label><input id="withdrawalBank" name="bankName" maxlength="80" required /><label for="withdrawalName">Account name</label><input id="withdrawalName" name="accountName" maxlength="100" required /><label for="withdrawalNumber">Account number</label><input id="withdrawalNumber" name="accountNumber" type="text" inputmode="numeric" minlength="6" maxlength="20" required /><div class="account-wallet-error" role="alert"></div><button class="account-dialog-primary" type="submit">Submit withdrawal request${accountChevron}</button></form>`, 'ADMIN-REVIEWED PAYMENT');
}

function toggleAppearance() {
  const light = document.body.classList.toggle('account-light');
  try { localStorage.setItem('herobet-account-theme', light ? 'light' : 'dark'); } catch { /* private browsing */ }
  notifyAccount(`${light ? 'Light' : 'Dark'} account theme enabled.`);
}

async function showDashboard(user) {
  const root = document.querySelector('#dashboardContent');
  if (!root) return;
  const request = ++dashboardRequest;
  dashUnsubscribe?.();
  dashUnsubscribe = null;
  dashboardUser = user;
  dashboardData = null;
  dashboardWallet = null;
  if (!user) {
    root.innerHTML = accountScreen(null, null, null);
    return;
  }
  root.innerHTML = accountScreen(user, null, null);
  const render = () => {
    if (request === dashboardRequest) root.innerHTML = accountScreen(user, dashboardData, dashboardWallet);
  };
  const showError = (title, message) => {
    if (request !== dashboardRequest) return;
    root.innerHTML = `<div class="account-loading account-load-error"><strong>${esc(title)}</strong><p>${esc(message)}</p><button type="button" data-account-action="retry-dashboard">Try again</button></div>`;
  };
  try {
    const [playerRef, walletRef] = await Promise.all([ensurePlayer(user), ensureWallet(user)]);
    if (request !== dashboardRequest || auth.currentUser?.uid !== user.uid) return;
    let stopPlayer = () => {}, stopWallet = () => {};
    dashUnsubscribe = () => { stopPlayer(); stopWallet(); };
    stopPlayer = onSnapshot(playerRef, snapshot => {
      if (request !== dashboardRequest) return;
      const data = snapshot.data();
      if (!data) return showError('Game account unavailable', 'Your play-money game account could not be read.');
      dashboardData = { ...data, bets: normalizeBets(data.bets) };
      render();
    }, () => showError('Could not load your game account', 'Check your connection and Firestore rules, then try again.'));
    stopWallet = onSnapshot(walletRef, snapshot => {
      if (request !== dashboardRequest) return;
      const data = snapshot.data();
      if (!data || !Number.isFinite(data.balance) || data.balance < 0 || (data.currency && data.currency !== 'NGN')) {
        return showError('Wallet unavailable', 'The wallet balance is missing or invalid. Contact support before attempting a transaction.');
      }
      dashboardWallet = { balance: data.balance, currency: data.currency || 'NGN' };
      render();
    }, () => showError('Could not load your wallet', 'Check your connection and deploy the updated Firestore wallet rules, then try again.'));
  } catch (error) {
    if (request === dashboardRequest && auth.currentUser?.uid === user.uid) showError('Could not connect your accounts', 'Check your connection and Firebase setup, including the new wallet rules, then try again.');
  }
}

if (page === 'dashboard') {
  try { if (localStorage.getItem('herobet-account-theme') === 'light') document.body.classList.add('account-light'); } catch { /* private browsing */ }
  app.addEventListener('click', async event => {
    const control = event.target.closest('[data-account-action]');
    if (!control) return;
    const action = control.dataset.accountAction;
    if (action === 'close-dialog') return closeAccountDialog();
    if (action === 'toggle-balance' || action === 'toggle-balance-and-settings') {
      balanceVisible = !balanceVisible;
      document.querySelector('#dashboardContent').innerHTML = accountScreen(dashboardUser, dashboardData, dashboardWallet);
      if (action === 'toggle-balance-and-settings') showSettings();
      return;
    }
    if (action === 'appearance') return toggleAppearance();
    if (action === 'appearance-settings') { toggleAppearance(); showSettings(); return; }
    if (action === 'bet-history') return showBetHistory();
    if (action === 'transactions') return showTransactions();
    if (action === 'personal') return showPersonalPage();
    if (action === 'missions') return showMissions();
    if (action === 'loyalty') return showLoyalty();
    if (action === 'wishlist') return showWishlist();
    if (action === 'download') return showDownload();
    if (action === 'support') return showSupport();
    if (action === 'how-to') return showHowTo();
    if (action === 'az-menu') return showAzMenu();
    if (action === 'settings') return showSettings();
    if (action === 'deposit' || action === 'withdraw') return showWallet(action);
    if (action === 'gifts') {
      if (!dashboardUser) return accountLoginPrompt('Gifts', 'Log in to check for demo gifts and rewards.');
      return openAccountDialog('Gifts (0)', `<div class="account-dialog-empty">${accountIcon('gift')}<h3>No gifts yet</h3><p>You have no demo gifts right now. New rewards will appear here when available.</p></div>`, 'YOUR REWARDS');
    }
    if (action === 'toggle-wishlist') {
      const saved = wishlistHasHero();
      try { saved ? localStorage.removeItem('herobet-wishlist') : localStorage.setItem('herobet-wishlist', 'super-hero'); } catch { /* private browsing */ }
      showWishlist();
      return notifyAccount(saved ? 'Removed Super Hero from your wishlist.' : 'Added Super Hero to your wishlist.');
    }
    if (action === 'retry-dashboard') return showDashboard(dashboardUser);
    if (action === 'sign-out') {
      control.disabled = true;
      try { await signOut(auth); location.href = './'; }
      catch { control.disabled = false; notifyAccount('Could not log out. Please try again.'); }
    }
  });
  app.addEventListener('submit', async event => {
    const paymentForm = event.target.closest('#depositRequestForm, #withdrawalRequestForm');
    if (!paymentForm) return;
    event.preventDefault();
    const button = paymentForm.querySelector('[type=submit]');
    const error = paymentForm.querySelector('.account-wallet-error');
    const values = Object.fromEntries(new FormData(paymentForm).entries());
    if (paymentForm.id === 'withdrawalRequestForm' && Number(values.amount) > Number(dashboardWallet?.balance || 0)) {
      error.textContent = 'That is more than your available wallet balance.';
      return;
    }
    button.disabled = true;
    error.textContent = '';
    try {
      if (paymentForm.id === 'depositRequestForm') {
        await submitDepositRequest(dashboardUser, values);
        notifyAccount('Deposit submitted. The admin will verify your transfer before crediting your wallet.');
      } else {
        await submitWithdrawalRequest(dashboardUser, values);
        notifyAccount('Withdrawal request submitted for admin review.');
      }
      closeAccountDialog();
    } catch (err) {
      error.textContent = err?.message || 'Could not submit your request. Please try again.';
      button.disabled = false;
    }
  });
  document.querySelector('#accountDialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeAccountDialog(); });
}

// Register after every dashboard constant and handler has initialized. Firebase
// normally calls back asynchronously, but this also supports synchronous test
// adapters without a temporal-dead-zone race.
onAuthStateChanged(auth, user => {
  if ((page === 'dashboard' || page === 'app-home') && isAdminUser(user)) {
    location.replace('./admin.html');
    return;
  }
  if (actions) {
    if (user) {
      actions.innerHTML = `<a class="nav-login" href="${isAdminUser(user) ? './admin.html' : './dashboard.html'}">${esc(user.displayName || user.email || 'My account')}</a><button class="nav-signup sign-out" id="signOut">Log out <span>↗</span></button>`;
      document.querySelector('#signOut').addEventListener('click', async e => { e.currentTarget.disabled = true; try { await signOut(auth); location.href = './'; } catch (error) { e.currentTarget.disabled = false; alert('Could not log out. Please try again.'); } });
    } else actions.innerHTML = '<a href="./login.html" class="nav-login">Log in</a><a href="./signup.html" class="nav-signup">Create account <span>↗</span></a>';
  }
  if (page === 'dashboard') showDashboard(user);
  if (page === 'app-home') {
    const name = document.querySelector('#lobbyName');
    if (user && name) name.textContent = `, ${esc(accountIdentity(user))}`;
  }
});
