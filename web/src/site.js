import './site.css';
import { auth } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { ensurePlayer, normalizeBets } from './player.js';

const app = document.querySelector('#app'), page = document.body.dataset.page;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ngn = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brand = `<a class="site-brand" href="./" aria-label="HeroBet home"><span class="site-mark">H<span>✦</span></span><span>HERO<span>BET</span><small>THE GAME IS ON</small></span></a>`;
const header = `<header class="site-header"><div class="nav-wrap">${brand}<nav class="site-nav" aria-label="Main navigation"><a href="./">Home</a><a href="./game.html">Super Hero</a><a href="./dashboard.html">Dashboard</a></nav><div class="nav-actions" id="navActions"><a href="./login.html" class="nav-login">Log in</a><a href="./signup.html" class="nav-signup">Create account <span>↗</span></a></div></div></header>`;
const footer = `<footer class="site-footer"><div>${brand}<p>A little courage goes a long way.</p></div><div class="footer-links"><a href="./game.html">Play Super Hero</a><a href="./dashboard.html">Dashboard</a><a href="./login.html">Log in</a></div><div class="footer-note"><b>18+ &nbsp; PLAY RESPONSIBLY</b><p>Play-money demo only. No real-money deposits, withdrawals or winnings.</p><small>© 2026 HEROBET</small></div></footer>`;

const home = `${header}<main><section class="home-hero"><div class="hero-copy"><div class="kicker"><span></span> YOUR NEXT ADVENTURE AWAITS</div><h1>THE SKY IS<br>NOT THE <em>LIMIT<span>.</span></em></h1><p>Big flights. Bigger moments. Step into Super Hero and see how far you can go.</p><div class="hero-actions"><a class="primary-link" href="./game.html">PLAY SUPER HERO <span>↗</span></a><a class="secondary-link" href="./signup.html">CREATE AN ACCOUNT</a></div><div class="hero-meta"><span>✦ &nbsp; ONE GAME. ENDLESS FLIGHTS.</span><span>18+ &nbsp; PLAY RESPONSIBLY</span></div></div><div class="hero-visual"><div class="hero-orbit"></div><img src="./flying-hero.png" alt="A superhero flying through space" /><div class="hero-visual-label"><span>FEATURED GAME / 01</span><strong>SUPER <em>HERO</em></strong><small>YOUR NEXT FLIGHT IS CALLING</small></div></div></section><div class="ticker"><span>✦ &nbsp; AIM HIGHER</span><span>✦ &nbsp; YOUR MOMENT TO FLY</span><span>✦ &nbsp; PLAY YOUR WAY</span><span>✦ &nbsp; AIM HIGHER</span></div><section class="home-section"><div class="section-top"><div><div class="kicker"><span></span> YOUR GAME, YOUR RULES</div><h2>ONE HERO. <em>ENDLESS</em> POSSIBILITIES<span>.</span></h2></div><p>Choose your mode and make every flight count.</p></div><div class="feature-grid"><a class="feature-card featured" href="./game.html"><div><span class="feature-number">01 / FEATURED GAME</span><h3>SUPER<br><em>HERO</em></h3><p>Take off, watch the multiplier climb and make your move.</p><span class="feature-cta">TAKE FLIGHT &nbsp; ↗</span></div><img src="./flying-hero.png" alt="" /></a><div class="feature-side"><div class="mini-feature"><span class="mini-icon">↗</span><div><h3>CLASSIC</h3><p>Cash out before the hero flies away.</p></div></div><div class="mini-feature"><span class="mini-icon gold">◈</span><div><h3>OVER / UNDER</h3><p>Predict where the next flight will end.</p></div></div><div class="demo-callout"><strong>JUST HERE FOR THE THRILL?</strong><p>Start with play money. No deposit needed.</p><a href="./game.html">Try the demo ↗</a></div></div></div></section><section class="steps-section"><div class="kicker"><span></span> IT'S EASY TO GET STARTED</div><h2>READY FOR <em>TAKEOFF?</em></h2><div class="steps"><div><b>01</b><h3>CREATE YOUR ACCOUNT</h3><p>Sign up and make HeroBet your own.</p></div><div><b>02</b><h3>CHOOSE YOUR MODE</h3><p>Play Classic or predict with Over / Under.</p></div><div><b>03</b><h3>ENJOY THE FLIGHT</h3><p>Place your demo bet and watch the hero soar.</p></div></div></section></main>${footer}`;
function authPage(signup) { return `${header}<main class="auth-layout"><div class="auth-art"><div class="auth-art-copy"><span class="kicker"><span></span> THE GAME IS ON</span><h1>YOUR NEXT<br><em>GREAT FLIGHT</em><br>STARTS HERE<span>.</span></h1><p>Join the adventure. Your moment is waiting.</p></div><img src="./flying-hero.png" alt="" /><span class="art-bottom">HEROBET &nbsp; / &nbsp; SUPER HERO</span></div><section class="auth-content"><div class="auth-box"><div class="kicker"><span></span> ${signup ? 'JOIN THE ADVENTURE' : 'WELCOME BACK'}</div><h1>${signup ? 'CREATE YOUR ACCOUNT' : 'READY TO FLY AGAIN'}<span>.</span></h1><p>${signup ? 'Your next adventure is just a few details away.' : 'Log in to pick up where you left off.'}</p><form id="authForm">${signup ? '<label>Display name<input name="name" autocomplete="name" placeholder="What should we call you?" maxlength="40" required></label>' : ''}<label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" placeholder="${signup ? 'At least 6 characters' : 'Enter your password'}" required></label>${signup ? '<label class="check-label"><input type="checkbox" name="adult" required> <span>I am 18 or older and understand this is a play-money demo.</span></label>' : '<button class="text-button forgot" type="button" id="forgot">Forgot password?</button>'}<div class="form-error" id="formError" role="alert"></div><button class="primary-link form-submit" type="submit">${signup ? 'CREATE ACCOUNT' : 'LOG IN'} <span>↗</span></button></form><div class="auth-switch">${signup ? 'Already have an account? <a href="./login.html">Log in</a>' : 'New to HeroBet? <a href="./signup.html">Create an account</a>'}</div><a class="guest-link" href="./game.html">Continue to the demo without an account ↗</a></div></section></main>`; }
const dashboard = `${header}<main class="dashboard-wrap"><div class="dash-heading"><div><div class="kicker"><span></span> YOUR HERO HQ</div><h1>WELCOME BACK<span>.</span></h1><p id="welcome">Your next adventure awaits.</p></div><a href="./game.html" class="primary-link">PLAY SUPER HERO <span>↗</span></a></div><div id="dashboardContent"><div class="dashboard-loading">Loading your account…</div></div></main>${footer}`;
app.innerHTML = page === 'home' ? home : page === 'dashboard' ? dashboard : authPage(page === 'signup');
const actions = document.querySelector('#navActions');
let dashUnsubscribe;
onAuthStateChanged(auth, user => {
  if (user) {
    actions.innerHTML = `<a class="nav-login" href="./dashboard.html">${esc(user.displayName || user.email || 'My account')}</a><button class="nav-signup sign-out" id="signOut">Log out <span>↗</span></button>`;
    document.querySelector('#signOut').addEventListener('click', async e => { e.currentTarget.disabled = true; try { await signOut(auth); location.href = './'; } catch (error) { e.currentTarget.disabled = false; alert('Could not log out. Please try again.'); } });
  } else actions.innerHTML = '<a href="./login.html" class="nav-login">Log in</a><a href="./signup.html" class="nav-signup">Create account <span>↗</span></a>';
  if (page === 'dashboard') showDashboard(user);
});
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
      location.href = './dashboard.html';
    } catch (err) { error.textContent = authMessage(err); }
    finally { button.disabled = false; button.innerHTML = original; }
  });
  document.querySelector('#forgot')?.addEventListener('click', async () => {
    const error = document.querySelector('#formError'), email = form.elements.email.value.trim();
    if (!email) { error.textContent = 'Enter your email above to reset your password.'; return; }
    try { await sendPasswordResetEmail(auth, email); error.textContent = 'If an account exists for this email, a reset link has been sent.'; } catch (err) { error.textContent = authMessage(err); }
  });
}
async function showDashboard(user) {
  const root = document.querySelector('#dashboardContent'); dashUnsubscribe?.();
  if (!user) { root.innerHTML = `<div class="dashboard-empty"><div class="dash-symbol">✦</div><h2>YOUR HERO HQ AWAITS<span>.</span></h2><p>Log in to see your demo balance and activity across devices.</p><a class="primary-link" href="./login.html">LOG IN <span>↗</span></a><a class="guest-link" href="./signup.html">Don't have an account? Sign up ↗</a></div>`; return; }
  document.querySelector('#welcome').textContent = `Good to see you, ${user.displayName || user.email || 'hero'}. Ready for your next flight?`;
  root.innerHTML = '<div class="dashboard-loading">Loading your demo account…</div>';
  try {
    const ref = await ensurePlayer(user); if (auth.currentUser?.uid !== user.uid) return;
    dashUnsubscribe = onSnapshot(ref, snapshot => {
      const data = snapshot.data(); if (!data) { root.innerHTML = '<div class="dashboard-loading">Demo account unavailable. Reload to try again.</div>'; return; }
      const bets = normalizeBets(data.bets);
      root.innerHTML = `<div class="dash-grid"><div class="dash-main"><section class="dash-balance"><div><span class="section-index">YOUR DEMO BALANCE</span><h2>${ngn(data.balance)}</h2><p><i></i> PLAY MONEY · NO REAL FUNDS</p></div><div class="balance-decoration">✦</div></section><section class="dash-activity"><div class="card-heading"><div><span class="section-index">YOUR FLIGHT LOG</span><h2>RECENT ACTIVITY<span>.</span></h2></div><a href="./game.html">PLAY NOW ↗</a></div>${bets.length ? `<div class="activity-table"><div class="activity-labels"><span>GAME</span><span>BET</span><span>FLIGHT</span><span>PAYOUT</span></div>${bets.slice(0, 10).map(b => `<div class="activity-row"><span><b>${esc(b.mode || 'Classic')}</b><small>Super Hero</small></span><span>${ngn(b.stake)}</span><span>${Number(b.multiplier || 0).toFixed(2)}×</span><span class="${b.status === 'won' ? 'win' : ''}">${ngn(b.payout)}</span></div>`).join('')}</div>` : '<div class="dash-empty-log"><span>✦</span><strong>No flights just yet</strong><p>Your recent demo bets will appear here.</p><a href="./game.html">Take your first flight ↗</a></div>'}</section></div><aside class="dash-aside"><div class="dash-game"><span class="section-index">YOUR NEXT ADVENTURE</span><h2>SUPER<br><em>HERO</em></h2><p>Think you can time it right?</p><img src="./flying-hero.png" alt="" /><a href="./game.html">PLAY NOW ↗</a></div><div class="account-card"><span class="section-index">YOUR ACCOUNT</span><h3>${esc(user.displayName || 'Hero')}</h3><p>${esc(user.email || '')}</p><span class="account-status">● &nbsp; SIGNED IN</span></div><p class="dash-disclaimer">18+ &nbsp; This is a play-money demo. No real deposits, withdrawals or winnings.</p></aside></div>`;
    }, () => { root.innerHTML = '<div class="dashboard-loading">Could not load your account. Check your connection and Firestore rules, then reload.</div>'; });
  } catch (err) { if (auth.currentUser?.uid === user.uid) root.innerHTML = '<div class="dashboard-loading">Could not connect to the demo account. Check your connection and Firestore setup, then reload.</div>'; }
}
