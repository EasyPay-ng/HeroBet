import './admin.css';
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { isAdminUser } from './access.js';
import { getDepositAccount, reviewDeposit, reviewWithdrawal, saveDepositAccount } from './payments.js';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => Number.isFinite(value) ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
let admin = null, bootVersion = 0, stops = [], deposits = [], withdrawals = [], wallets = [], toastTimer;

function gate(title, message, adminUser = null) {
  stops.forEach(stop => stop()); stops = [];
  app.innerHTML = `<main class="admin-gate"><div class="admin-gate-card"><span class="admin-shield">H</span><span class="admin-eyebrow">HEROBET ADMIN</span><h1>${esc(title)}</h1><p>${esc(message)}</p>${adminUser ? `<small>Signed in as ${esc(adminUser.email)}</small>` : ''}<a href="${adminUser ? './dashboard.html' : './login.html'}">${adminUser ? 'Go to my dashboard' : 'Go to login'}</a></div></main>`;
}

function adminLayout() {
  app.innerHTML = `<header class="admin-header"><a class="admin-brand" href="./admin.html"><span class="admin-shield">H</span><span>HERO<strong>BET</strong><small>MANUAL PAYMENTS ADMIN</small></span></a><div><span>${esc(admin.email)}</span><a href="./">View site</a><button type="button" data-admin-action="sign-out">Log out</button></div></header><main class="admin-main"><div class="admin-title"><div><span class="admin-eyebrow">OPERATIONS / MANUAL TRANSFERS</span><h1>Payment control centre.</h1><p>Verify bank transfers before approving. Wallet changes are applied immediately.</p></div><span class="admin-live"><i></i> FIRESTORE LIVE</span></div><section class="admin-metrics"><div><span>Pending deposits</span><strong id="pendingDeposits">0</strong></div><div><span>Pending withdrawals</span><strong id="pendingWithdrawals">0</strong></div><div><span>Total wallet balances</span><strong id="totalBalances">NGN 0.00</strong></div></section><div class="admin-top-grid"><section class="admin-panel"><div class="admin-panel-head"><div><span class="admin-eyebrow">RECEIVING ACCOUNT</span><h2>Deposit instructions</h2></div></div><p class="admin-muted">Users see this account in the manual deposit dialog.</p><form id="depositAccountForm" class="admin-account-form"><label>Bank name<input name="bankName" maxlength="80" required /></label><label>Account name<input name="accountName" maxlength="100" required /></label><label>Account number<input name="accountNumber" inputmode="numeric" minlength="6" maxlength="20" required /></label><div class="admin-form-error" role="alert"></div><button type="submit">Save receiving account</button></form></section><aside class="admin-panel admin-warning"><span class="admin-eyebrow">IMPORTANT</span><h2>Check your bank statement.</h2><p>A deposit request is only a user's claim. Confirm the exact amount and reference in your bank before approving.</p><p>For withdrawals, send the bank transfer first. Then use <strong>Mark paid &amp; debit</strong>; Firestore rejects the review if the wallet has insufficient funds.</p></aside></div><section class="admin-panel admin-requests"><div class="admin-panel-head"><div><span class="admin-eyebrow">INCOMING TRANSFERS</span><h2>Deposit requests</h2></div><span id="depositCount" class="admin-count">0</span></div><div id="depositRequests"></div></section><section class="admin-panel admin-requests"><div class="admin-panel-head"><div><span class="admin-eyebrow">OUTGOING TRANSFERS</span><h2>Withdrawal requests</h2></div><span id="withdrawalCount" class="admin-count">0</span></div><div id="withdrawalRequests"></div></section><section class="admin-panel"><div class="admin-panel-head"><div><span class="admin-eyebrow">LIVE FIRESTORE WALLETS</span><h2>User balances</h2></div><span id="walletCount" class="admin-count">0</span></div><div id="walletList" class="admin-wallet-list"></div></section></main><div id="adminToast" class="admin-toast" role="status" aria-live="polite"></div>`;
}

function notify(message) {
  const toast = document.querySelector('#adminToast');
  if (!toast) return;
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function reviewButtons(type, row) {
  if (row.status !== 'pending') return `<span class="admin-status ${esc(row.status)}">${esc(row.status)}</span>`;
  const approveText = type === 'deposit' ? 'Approve & credit' : 'Mark paid & debit';
  return `<div class="admin-review-actions"><button class="admin-reject" type="button" data-type="${type}" data-id="${esc(row.id)}" data-approve="false">Reject</button><button class="admin-approve" type="button" data-type="${type}" data-id="${esc(row.id)}" data-approve="true">${approveText}</button></div>`;
}

function paintRequests() {
  const depositRoot = document.querySelector('#depositRequests');
  const withdrawalRoot = document.querySelector('#withdrawalRequests');
  if (!depositRoot || !withdrawalRoot) return;
  const pendingDeposits = deposits.filter(row => row.status === 'pending').length;
  const pendingWithdrawals = withdrawals.filter(row => row.status === 'pending').length;
  document.querySelector('#pendingDeposits').textContent = pendingDeposits;
  document.querySelector('#pendingWithdrawals').textContent = pendingWithdrawals;
  document.querySelector('#depositCount').textContent = `${pendingDeposits} pending`;
  document.querySelector('#withdrawalCount').textContent = `${pendingWithdrawals} pending`;
  depositRoot.innerHTML = deposits.length ? deposits.map(row => `<article class="admin-request"><div class="admin-request-main"><span class="admin-request-kind">DEPOSIT</span><strong>${money(row.amount)}</strong><span>${esc(row.userEmail)}<small>${esc(row.uid)}</small></span><span>Reference: <b>${esc(row.reference)}</b><small>${row.senderName ? `Sender: ${esc(row.senderName)}` : 'No sender name supplied'}</small></span><time>${date(row.createdAt)}</time></div>${reviewButtons('deposit', row)}</article>`).join('') : '<div class="admin-empty">No deposit requests yet.</div>';
  withdrawalRoot.innerHTML = withdrawals.length ? withdrawals.map(row => `<article class="admin-request"><div class="admin-request-main"><span class="admin-request-kind withdrawal">WITHDRAWAL</span><strong>${money(row.amount)}</strong><span>${esc(row.userEmail)}<small>${esc(row.uid)}</small></span><span>${esc(row.bankName)} · ${esc(row.accountNumber)}<small>${esc(row.accountName)}</small></span><time>${date(row.createdAt)}</time></div>${reviewButtons('withdrawal', row)}</article>`).join('') : '<div class="admin-empty">No withdrawal requests yet.</div>';
}

function paintWallets() {
  const root = document.querySelector('#walletList');
  if (!root) return;
  const total = wallets.reduce((sum, row) => sum + (Number.isFinite(row.balance) ? row.balance : 0), 0);
  document.querySelector('#totalBalances').textContent = money(total);
  document.querySelector('#walletCount').textContent = `${wallets.length} wallets`;
  root.innerHTML = wallets.length ? [...wallets].sort((a, b) => b.balance - a.balance).map(row => `<div><span><strong>${esc(row.id)}</strong><small>${row.updatedAt ? `Updated ${date(row.updatedAt)}` : 'Firestore wallet'}</small></span><strong>${money(row.balance)}</strong></div>`).join('') : '<div class="admin-empty">No user wallets yet.</div>';
}

async function bootAdmin(user) {
  const version = ++bootVersion;
  if (!user) return gate('Admin login required.', 'Log in with the designated administrator account.');
  if (!isAdminUser(user)) return gate('Admin access only.', 'This account does not have permission to review payments.', user);
  admin = user;
  adminLayout();
  try {
    const account = await getDepositAccount();
    if (version !== bootVersion) return;
    const form = document.querySelector('#depositAccountForm');
    if (form && account) {
      form.elements.bankName.value = account.bankName || '';
      form.elements.accountName.value = account.accountName || '';
      form.elements.accountNumber.value = account.accountNumber || '';
    }
  } catch { notify('Could not load the receiving account. Check Firestore rules.'); }
  stops = [
    onSnapshot(query(collection(db, 'depositRequests'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
      deposits = snapshot.docs.map(row => ({ id: row.id, ...row.data() })); paintRequests();
    }, () => notify('Could not load deposit requests. Check admin Firestore rules.')),
    onSnapshot(query(collection(db, 'withdrawalRequests'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
      withdrawals = snapshot.docs.map(row => ({ id: row.id, ...row.data() })); paintRequests();
    }, () => notify('Could not load withdrawal requests. Check admin Firestore rules.')),
    onSnapshot(query(collection(db, 'wallets'), limit(100)), snapshot => {
      wallets = snapshot.docs.map(row => ({ id: row.id, ...row.data() })); paintWallets();
    }, () => notify('Could not load user wallets. Check admin Firestore rules.')),
  ];
}

app.addEventListener('click', async event => {
  const signout = event.target.closest('[data-admin-action="sign-out"]');
  if (signout) { signout.disabled = true; await signOut(auth); location.href = './login.html'; return; }
  const button = event.target.closest('[data-type][data-approve]');
  if (!button || !admin) return;
  const type = button.dataset.type, approve = button.dataset.approve === 'true', id = button.dataset.id;
  const action = approve ? (type === 'deposit' ? 'credit this deposit' : 'mark this withdrawal as paid and debit the wallet') : 'reject this request';
  if (!window.confirm(`Are you sure you want to ${action}?`)) return;
  const row = button.closest('.admin-request');
  row.querySelectorAll('button').forEach(control => { control.disabled = true; });
  try {
    if (type === 'deposit') await reviewDeposit(admin, id, approve);
    else await reviewWithdrawal(admin, id, approve);
    notify(approve ? 'Request completed and wallet updated.' : 'Request rejected.');
  } catch (error) {
    row.querySelectorAll('button').forEach(control => { control.disabled = false; });
    notify(error?.message || 'Could not review the request.');
  }
});

app.addEventListener('submit', async event => {
  const form = event.target.closest('#depositAccountForm');
  if (!form || !admin) return;
  event.preventDefault();
  const button = form.querySelector('[type=submit]'), error = form.querySelector('.admin-form-error');
  button.disabled = true; error.textContent = '';
  try {
    await saveDepositAccount(admin, Object.fromEntries(new FormData(form).entries()));
    notify('Receiving account saved. Users will now see these deposit instructions.');
  } catch (err) { error.textContent = err?.message || 'Could not save the receiving account.'; }
  finally { button.disabled = false; }
});

onAuthStateChanged(auth, user => { bootAdmin(user).catch(error => gate('Could not open admin.', error?.message || 'Check your connection and try again.', user)); });
