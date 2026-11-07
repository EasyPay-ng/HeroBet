// Manual payments: users submit requests, and the designated admin reviews
// them directly from admin.html. No Cloud Functions or payment provider is used.
import { auth, db } from './firebase.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { isAdminUser } from './access.js';
import { walletRef } from './player.js';

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const amountOf = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 20 || amount > 1000000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    throw new Error('Enter an amount from NGN 20.00 to NGN 1,000,000,000.00, with at most two decimals.');
  }
  return Math.round(amount * 100) / 100;
};
const currentUser = user => {
  if (!user || auth.currentUser?.uid !== user.uid) throw new Error('Your session changed. Log in again.');
  return user;
};
const currentAdmin = admin => {
  currentUser(admin);
  if (!isAdminUser(auth.currentUser)) throw new Error('Admin access required.');
  return auth.currentUser;
};

export async function getDepositAccount() {
  const snapshot = await getDoc(doc(db, 'config', 'depositAccount'));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveDepositAccount(admin, details) {
  const actor = currentAdmin(admin);
  const value = {
    bankName: clean(details.bankName, 80),
    accountName: clean(details.accountName, 100),
    accountNumber: clean(details.accountNumber, 20).replace(/\s/g, ''),
    updatedAt: Date.now(),
    updatedBy: actor.email,
  };
  if (!value.bankName || !value.accountName || !/^\d{6,20}$/.test(value.accountNumber)) {
    throw new Error('Enter the bank name, account name, and a valid account number.');
  }
  await setDoc(doc(db, 'config', 'depositAccount'), value);
  return value;
}

export async function submitDepositRequest(user, details) {
  const actor = currentUser(user);
  const reference = clean(details.reference, 80);
  if (reference.length < 3) throw new Error('Enter the transfer reference (at least 3 characters).');
  const request = {
    uid: actor.uid,
    userEmail: actor.email || '',
    amount: amountOf(details.amount),
    reference,
    senderName: clean(details.senderName, 100),
    status: 'pending',
    createdAt: Date.now(),
  };
  const ref = await addDoc(collection(db, 'depositRequests'), request);
  return { id: ref.id, ...request };
}

export async function submitWithdrawalRequest(user, details) {
  const actor = currentUser(user);
  const request = {
    uid: actor.uid,
    userEmail: actor.email || '',
    amount: amountOf(details.amount),
    bankName: clean(details.bankName, 80),
    accountName: clean(details.accountName, 100),
    accountNumber: clean(details.accountNumber, 20).replace(/\s/g, ''),
    status: 'pending',
    createdAt: Date.now(),
  };
  if (!request.bankName || !request.accountName || !/^\d{6,20}$/.test(request.accountNumber)) {
    throw new Error('Enter your bank name, account name, and a valid account number.');
  }
  const ref = await addDoc(collection(db, 'withdrawalRequests'), request);
  return { id: ref.id, ...request };
}

export async function listWalletTransactions(uid) {
  const snapshot = await getDocs(query(
    collection(db, 'wallets', uid, 'transactions'),
    orderBy('createdAt', 'desc'),
    limit(30),
  ));
  return snapshot.docs.map(row => ({ id: row.id, ...row.data() }));
}

function reviewFields(status, admin) {
  return { status, reviewedAt: Date.now(), reviewedBy: admin.email };
}

export async function reviewDeposit(admin, requestId, approve) {
  const actor = currentAdmin(admin);
  return runTransaction(db, async tx => {
    const ref = doc(db, 'depositRequests', requestId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Deposit request not found.');
    const request = snapshot.data();
    if (request.status !== 'pending') throw new Error('This request has already been reviewed.');
    if (!approve) {
      tx.update(ref, reviewFields('rejected', actor));
      return { status: 'rejected' };
    }
    const amount = amountOf(request.amount);
    const wallet = walletRef(request.uid);
    const walletSnapshot = await tx.get(wallet);
    if (!walletSnapshot.exists()) throw new Error('The user wallet does not exist.');
    const current = walletSnapshot.data();
    if (!Number.isFinite(current.balance) || current.balance < 0) throw new Error('The user wallet is invalid.');
    const balance = Math.round((current.balance + amount) * 100) / 100;
    tx.update(wallet, { balance, updatedAt: Date.now() });
    tx.set(doc(db, 'wallets', request.uid, 'transactions', requestId), {
      type: 'deposit', amount, balanceAfter: balance, requestId, createdAt: Date.now(),
    });
    tx.update(ref, reviewFields('approved', actor));
    return { status: 'approved', balance };
  });
}

export async function reviewWithdrawal(admin, requestId, approve) {
  const actor = currentAdmin(admin);
  return runTransaction(db, async tx => {
    const ref = doc(db, 'withdrawalRequests', requestId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Withdrawal request not found.');
    const request = snapshot.data();
    if (request.status !== 'pending') throw new Error('This request has already been reviewed.');
    if (!approve) {
      tx.update(ref, reviewFields('rejected', actor));
      return { status: 'rejected' };
    }
    const amount = amountOf(request.amount);
    const wallet = walletRef(request.uid);
    const walletSnapshot = await tx.get(wallet);
    if (!walletSnapshot.exists()) throw new Error('The user wallet does not exist.');
    const current = walletSnapshot.data();
    if (!Number.isFinite(current.balance) || current.balance < amount) throw new Error('The wallet has insufficient funds.');
    const balance = Math.round((current.balance - amount) * 100) / 100;
    tx.update(wallet, { balance, updatedAt: Date.now() });
    tx.set(doc(db, 'wallets', request.uid, 'transactions', requestId), {
      type: 'withdrawal', amount, balanceAfter: balance, requestId, createdAt: Date.now(),
    });
    tx.update(ref, reviewFields('completed', actor));
    return { status: 'completed', balance };
  });
}
