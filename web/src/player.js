// Play-money accounts only. Client-writable values are not suitable for real money.
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDocFromServer, runTransaction, setDoc } from 'firebase/firestore';

export function normalizeBets(bets) {
  return (Array.isArray(bets) ? bets : []).filter(b => b && typeof b === 'object' && Number.isFinite(b.stake) && b.stake >= 0 && Number.isFinite(b.multiplier) && b.multiplier >= 0 && Number.isFinite(b.payout) && b.payout >= 0 && ['won', 'lost'].includes(b.status)).slice(0, 30).map(b => ({ stake: b.stake, multiplier: b.multiplier, payout: b.payout, status: b.status, mode: typeof b.mode === 'string' ? b.mode.slice(0, 80) : 'Classic' }));
}
export const playerRef = uid => doc(db, 'demoPlayers', uid);
export function authReady() {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, user => { unsubscribe(); resolve(user); }, reject);
  });
}
export async function ensurePlayer(user) {
  const ref = playerRef(user.uid);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) tx.set(ref, { balance: 10000, bets: [], updatedAt: Date.now() });
  });
  return ref;
}
export async function loadGameAccount() {
  const user = await authReady();
  if (!user) return { user: null };
  const ref = await ensurePlayer(user);
  const snapshot = await getDocFromServer(ref);
  const data = snapshot.data();
  if (!data || !Number.isFinite(data.balance) || data.balance < 0 || !Array.isArray(data.bets)) throw new Error('Your demo account data is invalid.');
  return { user, balance: data.balance, bets: normalizeBets(data.bets) };
}
export async function saveGameAccount(user, data) {
  if (!user || auth.currentUser?.uid !== user.uid) throw new Error('Your session changed. Reload and sign in again.');
  await setDoc(playerRef(user.uid), { balance: data.balance, bets: data.bets.slice(0, 30), updatedAt: Date.now() });
}

// A session change in another tab must never continue using the previous account.
export function watchGameAccount(initialUser, onChange) {
  const initialUid = initialUser?.uid || null;
  return onAuthStateChanged(auth, user => { if ((user?.uid || null) !== initialUid) onChange(); });
}
