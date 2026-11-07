import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../src/site.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, '');
function site(page, user = null) {
  const dom = new JSDOM(`<body data-page="${page}"><div id="app"></div></body>`, { url: 'https://example.com/', runScripts: 'outside-only' });
  const w = dom.window, errors = [], requests = [];
  w.auth = { currentUser: user };
  w.isAdminUser = account => String(account?.email || '').toLowerCase() === 'beniwealth70@gmail.com';
  w.onAuthStateChanged = (_, cb) => { cb(user); return () => {}; };
  w.ensurePlayer = async () => ({ id: 'player' });
  w.ensureWallet = async () => ({ id: 'wallet' });
  w.normalizeBets = list => Array.isArray(list) ? list : [];
  w.onSnapshot = (ref, cb) => {
    const data = ref.id === 'wallet'
      ? { balance: 3000.11, currency: 'NGN' }
      : { balance: 1250, bets: [{ mode: 'Classic', stake: 100, multiplier: 2, payout: 200, status: 'won' }] };
    cb({ data: () => data });
    return () => {};
  };
  w.getDepositAccount = async () => ({ bankName: 'Example Bank', accountName: 'HeroBet Admin', accountNumber: '0123456789' });
  w.submitDepositRequest = async (account, values) => { requests.push({ type: 'deposit', account, values }); return { id: 'deposit-1' }; };
  w.submitWithdrawalRequest = async (account, values) => { requests.push({ type: 'withdrawal', account, values }); return { id: 'withdrawal-1' }; };
  w.listWalletTransactions = async () => [{ type: 'deposit', amount: 500, balanceAfter: 3500.11, createdAt: 1762531200000 }];
  w.signInWithEmailAndPassword = async () => { throw { code: 'auth/invalid-credential' }; };
  w.createUserWithEmailAndPassword = async () => { throw { code: 'auth/email-already-in-use' }; };
  w.updateProfile = async () => {}; w.signOut = async () => {}; w.sendPasswordResetEmail = async () => {};
  w.addEventListener('error', e => errors.push(e.message));
  w.eval(source);
  return { w, q: s => w.document.querySelector(s), errors, requests, close: () => w.close() };
}
{
  const x = site('home');
  assert.match(x.q('h1').textContent, /THE SKY IS/);
  assert.equal(x.q('.primary-link').getAttribute('href'), './game.html');
  assert.equal(x.q('.nav-signup').getAttribute('href'), './signup.html'); x.close();
}
{
  const x = site('home', { uid: 'admin', email: 'beniwealth70@gmail.com' });
  assert.equal(x.q('.nav-login').getAttribute('href'), './admin.html', 'admin account links to the admin dashboard'); x.close();
}
{
  const user = { uid: 'abc', displayName: '<Hero>', email: 'player@example.com' };
  const x = site('dashboard', user);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('.account-name').textContent, /<Hero>/);
  assert.equal(x.q('.account-name img'), null, 'display name cannot inject markup');
  assert.equal(x.q('.account-balance-value').textContent, 'NGN 3,000.11', 'dashboard uses wallets/{uid}.balance, not demoPlayers.balance');
  assert.ok(x.q('.is-signed-in .account-tier'));
  assert.ok(x.q('[data-account-action="missions"]'), 'signed-in account includes Missions');
  assert.equal(x.q('.account-bottom-nav').children.length, 5);
  x.q('[data-account-action="bet-history"]').click();
  assert.match(x.q('.account-history-row').textContent, /Classic/);
  assert.match(x.q('.account-history-row').textContent, /NGN 200.00/);
  x.q('[data-account-action="close-dialog"]').click();
  x.q('[data-account-action="deposit"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('#accountDialog').textContent, /0123456789/, 'user sees the admin receiving account');
  x.q('#depositAmount').value = '500'; x.q('#depositReference').value = 'TRF-12345';
  x.q('#depositRequestForm').dispatchEvent(new x.w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(x.requests[0].type, 'deposit');
  assert.equal(x.requests[0].values.reference, 'TRF-12345');
  assert.equal(x.requests[0].account.uid, 'abc');
  x.q('[data-account-action="transactions"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('.account-wallet-transactions').textContent, /Deposit approved/);
  assert.equal(x.errors.length, 0); x.close();
}
{
  const x = site('dashboard');
  assert.match(x.q('.account-profile-link').textContent, /Login to View/);
  assert.equal(x.q('.account-balance-value').textContent, 'NGN 0.00');
  assert.ok(x.q('.is-signed-out'));
  assert.equal(x.q('[data-account-action="missions"]'), null, 'guest account matches the shorter menu');
  x.q('[data-account-action="deposit"]').click();
  assert.match(x.q('#accountDialog').textContent, /Log in/);
  x.close();
}
{
  const x = site('login');
  x.q('[name=email]').value = 'person@example.com'; x.q('[name=password]').value = 'password';
  x.q('form').dispatchEvent(new x.w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('#formError').textContent, /incorrect/);
  assert.equal(x.q('[type=submit]').disabled, false); x.close();
}
{
  const x = site('signup');
  x.q('[name=name]').value = 'Hero'; x.q('[name=email]').value = 'person@example.com'; x.q('[name=password]').value = 'password'; x.q('[name=adult]').checked = true;
  x.q('form').dispatchEvent(new x.w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('#formError').textContent, /already has an account/); x.close();
}
{
  const pages = ['index.html', 'dashboard.html', 'admin.html', 'game.html', 'login.html', 'signup.html', '404.html', 'markets.html'];
  for (const file of pages) {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /rel="icon"[^>]+href="\/favicon\.svg"/, `${file} links the favicon`);
  }
  assert.ok(fs.existsSync(new URL('../public/favicon.svg', import.meta.url)));
  const firebase = fs.readFileSync(new URL('../src/firebase.js', import.meta.url), 'utf8');
  assert.match(firebase, /AIzaSyBbMT9mMiEc2Sh9xr3Qz1hdYxAD7pU5cCc/, 'configured Firebase API key is preserved exactly');
  assert.match(source, /isAdminUser\(auth\.currentUser\) \? '\.\/admin\.html'/, 'successful admin login redirects to admin.html');
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /request\.auth\.token\.email == 'beniwealth70@gmail\.com'/);
  assert.match(rules, /request\.resource\.data\.balance == 0/, 'clients can only bootstrap an empty wallet');
  assert.match(rules, /match \/depositRequests\/\{requestId\}/);
  assert.match(rules, /match \/withdrawalRequests\/\{requestId\}/);
  assert.match(rules, /allow update: if isAdmin\(\)/, 'only admin reviews can update wallets and requests');
}
console.log('Site tests passed: account states, Firestore wallet, manual requests, admin routing, history, auth, rules, config and favicons.');
