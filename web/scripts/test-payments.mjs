import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const documents = new Map();
let current = { uid: 'user-1', email: 'player@example.com' };
let sequence = 0;
const auth = { get currentUser() { return current; } };
const pathOf = parts => parts.join('/');
const context = vm.createContext({
  auth, db: {}, Date, Number, String, Object, Array, Error, Promise, RegExp,
  isAdminUser: user => user?.email === 'beniwealth70@gmail.com',
  walletRef: uid => `wallets/${uid}`,
  collection: (_, path) => path,
  doc: (_, ...parts) => pathOf(parts),
  addDoc: async (path, data) => {
    const id = `auto-${++sequence}`; documents.set(`${path}/${id}`, data); return { id };
  },
  getDoc: async ref => ({ exists: () => documents.has(ref), data: () => documents.get(ref) }),
  getDocs: async () => ({ docs: [] }),
  query: value => value,
  orderBy: () => null,
  limit: () => null,
  setDoc: async (ref, data) => documents.set(ref, data),
  runTransaction: async (_, work) => work({
    get: async ref => ({ exists: () => documents.has(ref), data: () => documents.get(ref) }),
    set: (ref, data) => documents.set(ref, data),
    update: (ref, data) => documents.set(ref, { ...documents.get(ref), ...data }),
  }),
});
const source = fs.readFileSync(new URL('../src/payments.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, '').replace(/export /g, '');
vm.runInContext(`${source}\nglobalThis.payments = { submitDepositRequest, submitWithdrawalRequest, reviewDeposit, reviewWithdrawal, saveDepositAccount, getDepositAccount };`, context);
const { payments } = context;
const admin = { uid: 'admin-1', email: 'beniwealth70@gmail.com' };

documents.set('wallets/user-1', { balance: 1000, currency: 'NGN', updatedAt: Date.now() });
const deposit = await payments.submitDepositRequest(current, { amount: 500, reference: 'BANK-REF-1', senderName: 'Player One' });
assert.equal(deposit.status, 'pending');
assert.equal(documents.get(`depositRequests/${deposit.id}`).uid, 'user-1');
assert.equal(documents.get('wallets/user-1').balance, 1000, 'request submission never credits a wallet');
current = admin;
const approved = await payments.reviewDeposit(admin, deposit.id, true);
assert.equal(approved.balance, 1500);
assert.equal(documents.get('wallets/user-1').balance, 1500, 'admin approval credits the exact transfer amount');
assert.equal(documents.get(`depositRequests/${deposit.id}`).status, 'approved');
assert.equal(documents.get(`wallets/user-1/transactions/${deposit.id}`).type, 'deposit');
await assert.rejects(payments.reviewDeposit(admin, deposit.id, true), /already been reviewed/);
assert.equal(documents.get('wallets/user-1').balance, 1500, 'a request cannot be credited twice');

current = { uid: 'user-1', email: 'player@example.com' };
const rejectedDeposit = await payments.submitDepositRequest(current, { amount: 200, reference: 'UNVERIFIED' });
current = admin;
await payments.reviewDeposit(admin, rejectedDeposit.id, false);
assert.equal(documents.get(`depositRequests/${rejectedDeposit.id}`).status, 'rejected');
assert.equal(documents.get('wallets/user-1').balance, 1500, 'rejection has no wallet effect');
assert.equal(documents.has(`wallets/user-1/transactions/${rejectedDeposit.id}`), false);

current = { uid: 'user-1', email: 'player@example.com' };
const withdrawal = await payments.submitWithdrawalRequest(current, { amount: 400, bankName: 'Example Bank', accountName: 'Player One', accountNumber: '0123456789' });
assert.equal(documents.get('wallets/user-1').balance, 1500, 'withdrawal request does not debit before admin review');
current = admin;
const paid = await payments.reviewWithdrawal(admin, withdrawal.id, true);
assert.equal(paid.balance, 1100);
assert.equal(documents.get(`withdrawalRequests/${withdrawal.id}`).status, 'completed');
assert.equal(documents.get(`wallets/user-1/transactions/${withdrawal.id}`).type, 'withdrawal');
documents.set('withdrawalRequests/too-large', { uid: 'user-1', amount: 5000, status: 'pending' });
await assert.rejects(payments.reviewWithdrawal(admin, 'too-large', true), /insufficient funds/);
assert.equal(documents.get('wallets/user-1').balance, 1100, 'insufficient withdrawal cannot make a negative balance');

await payments.saveDepositAccount(admin, { bankName: 'Admin Bank', accountName: 'HeroBet Admin', accountNumber: '0123456789' });
assert.equal((await payments.getDepositAccount()).bankName, 'Admin Bank');
current = { uid: 'user-1', email: 'player@example.com' };
await assert.rejects(payments.reviewDeposit(current, deposit.id, true), /Admin access required/);
await assert.rejects(payments.saveDepositAccount(current, { bankName: 'Bad', accountName: 'Bad', accountNumber: '123456' }), /Admin access required/);
console.log('Manual payment tests passed: request-only submission, admin credit/debit, rejection, duplicate protection, funds validation and admin account settings.');
