import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, '');
function adminPage(user) {
  const dom = new JSDOM('<body data-page="admin"><div id="app"></div></body>', { url: 'https://example.com/admin.html', runScripts: 'outside-only' });
  const w = dom.window, reviews = [], errors = [];
  w.auth = { currentUser: user }; w.db = {};
  w.isAdminUser = account => account?.email === 'beniwealth70@gmail.com';
  w.onAuthStateChanged = (_, cb) => { cb(user); return () => {}; };
  w.signOut = async () => {};
  w.collection = (_, path) => ({ path }); w.query = value => value; w.orderBy = () => null; w.limit = () => null;
  w.onSnapshot = (ref, cb) => {
    let docs = [];
    if (ref.path === 'depositRequests') docs = [{ id: 'd1', data: () => ({ uid: 'u1', userEmail: 'player@example.com', amount: 500, reference: 'REF-1', status: 'pending', createdAt: 1762531200000 }) }];
    if (ref.path === 'wallets') docs = [{ id: 'u1', data: () => ({ balance: 3000.11, currency: 'NGN', updatedAt: 1762531200000 }) }];
    cb({ docs });
    return () => {};
  };
  w.getDepositAccount = async () => ({ bankName: 'Admin Bank', accountName: 'HeroBet Admin', accountNumber: '0123456789' });
  w.saveDepositAccount = async (_, values) => values;
  w.reviewDeposit = async (_, id, approve) => { reviews.push({ type: 'deposit', id, approve }); return { status: approve ? 'approved' : 'rejected' }; };
  w.reviewWithdrawal = async (_, id, approve) => { reviews.push({ type: 'withdrawal', id, approve }); return { status: approve ? 'completed' : 'rejected' }; };
  w.confirm = () => true;
  w.addEventListener('error', event => errors.push(event.message));
  w.eval(source);
  return { w, q: selector => w.document.querySelector(selector), reviews, errors, close: () => w.close() };
}
{
  const x = adminPage({ uid: 'user', email: 'player@example.com' });
  assert.match(x.q('.admin-gate').textContent, /Admin access only/);
  assert.equal(x.q('.admin-metrics'), null); x.close();
}
{
  const x = adminPage({ uid: 'admin', email: 'beniwealth70@gmail.com' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(x.q('.admin-metrics'));
  assert.equal(x.q('#pendingDeposits').textContent, '1');
  assert.match(x.q('#totalBalances').textContent, /3,000.11/);
  assert.equal(x.q('[name=bankName]').value, 'Admin Bank');
  x.q('[data-type="deposit"][data-approve="true"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(x.reviews, [{ type: 'deposit', id: 'd1', approve: true }]);
  x.q('[name=accountNumber]').value = '9876543210';
  x.q('#depositAccountForm').dispatchEvent(new x.w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(x.q('#adminToast').textContent, /Receiving account saved/);
  assert.equal(x.errors.length, 0); x.close();
}
console.log('Admin tests passed: access gate, request queues, wallet totals, receiving account and review actions.');
