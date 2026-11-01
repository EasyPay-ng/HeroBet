import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../src/site.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, '');
function site(page, user = null) {
  const dom = new JSDOM(`<body data-page="${page}"><div id="app"></div></body>`, { url: 'https://example.com/', runScripts: 'outside-only' });
  const w = dom.window, errors = [];
  w.auth = { currentUser: user };
  w.onAuthStateChanged = (_, cb) => { cb(user); return () => {}; };
  w.ensurePlayer = async () => ({ id: 'player' });
  w.normalizeBets = list => Array.isArray(list) ? list : [];
  w.onSnapshot = (_, cb) => { cb({ data: () => ({ balance: 1250, bets: [{ mode: 'Classic', stake: 100, multiplier: 2, payout: 200, status: 'won' }] }) }); return () => {}; };
  w.signInWithEmailAndPassword = async () => { throw { code: 'auth/invalid-credential' }; };
  w.createUserWithEmailAndPassword = async () => { throw { code: 'auth/email-already-in-use' }; };
  w.updateProfile = async () => {}; w.signOut = async () => {}; w.sendPasswordResetEmail = async () => {};
  w.addEventListener('error', e => errors.push(e.message));
  w.eval(source);
  return { w, q: s => w.document.querySelector(s), errors, close: () => w.close() };
}
{
  const x = site('home');
  assert.match(x.q('h1').textContent, /THE SKY IS/);
  assert.equal(x.q('.primary-link').getAttribute('href'), './game.html');
  assert.equal(x.q('.nav-signup').getAttribute('href'), './signup.html'); x.close();
}
{
  const x = site('dashboard', { uid: 'abc', displayName: '<Hero>', email: 'player@example.com' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('#welcome').textContent, /<Hero>/);
  assert.match(x.q('.dash-balance').textContent, /₦1,250.00/);
  assert.match(x.q('.activity-row').textContent, /Classic/);
  assert.equal(x.q('.account-card h3').textContent, '<Hero>');
  assert.equal(x.q('.account-card h3').children.length, 0, 'display name is escaped');
  assert.equal(x.errors.length, 0); x.close();
}
{
  const x = site('dashboard');
  assert.match(x.q('.dashboard-empty').textContent, /Log in/); x.close();
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
console.log('Site tests passed: homepage links, dashboard, guest state, login and signup errors.');
