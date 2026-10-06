// HeroBet — data layer.
// Primary backend: Firebase Auth + Cloud Firestore.
// Fallback backend: localStorage ("demo mode") used automatically when
// Firestore is not reachable / rules are not deployed yet, so the platform
// is always usable. Same API for both — pages never branch on mode.
//
// Money rule: the wallet balance is only ever changed through credit()/debit()
// which append a ledger entry in the same transaction. When Cloud Functions
// take over settlement (see docs/SETUP-FIREBASE.md) the client loses write
// access to wallets and the same ledger keeps working.

import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { toast } from "./ui.js";

export const DEMO_GRANT = 10000; // welcome demo credit (simulated NGN)
export const UNDER15_COEFF = 2.757; // O/U Under 1.5 coefficient per Gift Drop spec

export let mode = "firestore"; // 'firestore' | 'local'
export let modeReason = "";
export let crashSeed = "herobet-default-seed-v1";

let user = null; // {uid, name, email, local?}

// ---------- local (demo mode) primitives ----------
const LS = {
  uid: "hb_local_uid",
  user: "hb_local_user",
  wallet: "hb_local_wallet",
  ledger: "hb_local_ledger",
  bets: "hb_local_bets",
};

const listeners = { auth: [], wallet: [], ledger: [], bets: [] };
const emit = (k, v) => listeners[k].forEach((f) => f(v));

const lsGet = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v === null || v === undefined ? d : v;
  } catch {
    return d;
  }
};
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function localUid() {
  let u = localStorage.getItem(LS.uid);
  if (!u) {
    u = "local-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(LS.uid, u);
  }
  return u;
}

function localUser() {
  const existing = lsGet(LS.user, null);
  if (existing) return existing;
  const u = {
    uid: localUid(),
    name: "Hero-" + (1000 + Math.floor(Math.random() * 9000)),
    email: null,
    local: true,
  };
  lsSet(LS.user, u);
  return u;
}

function localWallet() {
  let w = lsGet(LS.wallet, null);
  if (!w) {
    w = { balance: DEMO_GRANT };
    lsSet(LS.wallet, w);
    lsSet(LS.ledger, [
      {
        id: "welcome",
        type: "demo-grant",
        amount: DEMO_GRANT,
        balanceAfter: DEMO_GRANT,
        note: "Welcome demo credit",
        createdAt: Date.now(),
      },
    ]);
  }
  return w;
}

function localApply(delta, type, note, ref) {
  const w = localWallet();
  const bal = w.balance + delta;
  if (bal < 0) throw new Error("INSUFFICIENT");
  w.balance = bal;
  lsSet(LS.wallet, w);
  const led = lsGet(LS.ledger, []);
  led.unshift({
    id: "t" + Date.now() + Math.random().toString(36).slice(2, 6),
    type,
    amount: delta,
    balanceAfter: bal,
    note: note || "",
    ref: ref || null,
    createdAt: Date.now(),
  });
  lsSet(LS.ledger, led.slice(0, 300));
  emit("wallet", { balance: bal });
  emit("ledger", null);
  return bal;
}

// ---------- Firestore primitives ----------
async function fsApply(uid, delta, type, note, ref) {
  return runTransaction(db, async (tx) => {
    const wref = doc(db, "wallets", uid);
    const snap = await tx.get(wref);
    if (!snap.exists()) throw new Error("NO_WALLET");
    const bal = snap.data().balance + delta;
    if (bal < 0) throw new Error("INSUFFICIENT");
    tx.update(wref, { balance: bal, updatedAt: Date.now() });
    tx.set(doc(collection(db, "wallets", uid, "ledger")), {
      type,
      amount: delta,
      balanceAfter: bal,
      note: note || "",
      ref: ref || null,
      createdAt: Date.now(),
    });
    return bal;
  });
}

async function fsEnsureUser(u) {
  // Create users/{uid} + wallets/{uid} (with welcome demo credit) if missing.
  await runTransaction(db, async (tx) => {
    const uref = doc(db, "users", u.uid);
    const wref = doc(db, "wallets", u.uid);
    const [usnap, wsnap] = await Promise.all([tx.get(uref), tx.get(wref)]);
    if (!usnap.exists()) {
      tx.set(uref, {
        uid: u.uid,
        name: u.name,
        email: u.email || null,
        createdAt: Date.now(),
      });
    }
    if (!wsnap.exists()) {
      tx.set(wref, { uid: u.uid, balance: DEMO_GRANT, currency: "NGN", updatedAt: Date.now() });
      tx.set(doc(db, "wallets", u.uid, "ledger", "welcome"), {
        type: "demo-grant",
        amount: DEMO_GRANT,
        balanceAfter: DEMO_GRANT,
        note: "Welcome demo credit",
        createdAt: Date.now(),
      });
    }
  });
}

// ---------- backend API ----------
export function currentUser() {
  return user;
}

export async function initBackend() {
  try {
    const cfg = await Promise.race([
      getDoc(doc(db, "config", "crash")),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 6000)),
    ]);
    if (cfg.exists() && cfg.data().seed) {
      crashSeed = String(cfg.data().seed);
    } else {
      // try to create the config doc so all clients share the same seed
      try {
        await setDoc(doc(db, "config", "crash"), {
          seed: crashSeed,
          createdAt: Date.now(),
          note: "auto-created default seed — rotate via console for production",
        });
      } catch (e) {
        modeReason = "config-write-denied";
      }
    }
    mode = "firestore";
  } catch (e) {
    mode = "local";
    modeReason = e?.code || e?.message || "unreachable";
  }
  return { mode, modeReason, crashSeed };
}

export function onAuth(cb) {
  if (mode === "local") {
    listeners.auth.push(cb);
    user = localUser();
    cb(user);
    return () => (listeners.auth = listeners.auth.filter((f) => f !== cb));
  }
  return onAuthStateChanged(auth, async (fu) => {
    if (fu) {
      const name = fu.displayName || (fu.email ? fu.email.split("@")[0] : "Hero-" + fu.uid.slice(0, 4));
      user = { uid: fu.uid, name, email: fu.email || null };
      try {
        await fsEnsureUser(user);
      } catch (e) {
        console.warn("ensureUser failed", e);
        toast("Firestore isn't ready — see docs/SETUP-FIREBASE.md", "warn");
      }
    } else {
      user = null;
    }
    cb(user);
  });
}

const authErr = (e) => {
  const code = e?.code || "";
  if (code === "auth/operation-not-allowed")
    return "This sign-in method isn't enabled yet. Enable it in Firebase Console → Authentication → Sign-in method (see docs/SETUP-FIREBASE.md).";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return "Wrong email or password.";
  if (code === "auth/email-already-in-use") return "That email already has an account — sign in instead.";
  if (code === "auth/weak-password") return "Password too weak — use at least 6 characters.";
  if (code === "auth/invalid-email") return "That email address doesn't look right.";
  if (code === "auth/network-request-failed") return "Network problem — check your connection.";
  return e?.message?.replace("Firebase: ", "") || "Something went wrong.";
};

export async function signInGuest() {
  if (mode === "local") {
    user = localUser();
    emit("auth", user);
    return user;
  }
  try {
    const cred = await signInAnonymously(auth);
    const name = "Hero-" + (1000 + Math.floor(Math.random() * 9000));
    await updateProfile(cred.user, { displayName: name });
    return { uid: cred.user.uid, name, email: null };
  } catch (e) {
    throw new Error(authErr(e));
  }
}

export async function signUpEmail(email, password, name) {
  if (mode === "local") throw new Error("Demo mode — email accounts need Firestore (see docs/SETUP-FIREBASE.md).");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = (name || email.split("@")[0]).slice(0, 24);
    await updateProfile(cred.user, { displayName });
    return { uid: cred.user.uid, name: displayName, email };
  } catch (e) {
    throw new Error(authErr(e));
  }
}

export async function signInEmail(email, password) {
  if (mode === "local") throw new Error("Demo mode — email accounts need Firestore (see docs/SETUP-FIREBASE.md).");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { uid: cred.user.uid, name: cred.user.displayName || email.split("@")[0], email };
  } catch (e) {
    throw new Error(authErr(e));
  }
}

export async function signOut() {
  if (mode === "local") {
    localStorage.removeItem(LS.user);
    user = null;
    emit("auth", null);
    return;
  }
  await fbSignOut(auth);
}

// ----- wallet -----
export function subscribeWallet(cb) {
  if (mode === "local") {
    listeners.wallet.push(cb);
    cb({ balance: localWallet().balance });
    return () => (listeners.wallet = listeners.wallet.filter((f) => f !== cb));
  }
  if (!user) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "wallets", user.uid),
    (snap) => cb(snap.exists() ? { balance: snap.data().balance } : null),
    () => cb(null)
  );
}

export function subscribeLedger(cb) {
  if (mode === "local") {
    listeners.ledger.push(cb);
    cb(lsGet(LS.ledger, []));
    return () => (listeners.ledger = listeners.ledger.filter((f) => f !== cb));
  }
  if (!user) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "wallets", user.uid, "ledger"), orderBy("createdAt", "desc"), limit(60)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export async function credit({ type, amount, note, ref }) {
  if (!user) throw new Error("AUTH");
  if (mode === "local") return localApply(Math.round(amount), type, note, ref);
  return fsApply(user.uid, Math.round(amount), type, note, ref);
}

export async function debit({ type, amount, note, ref }) {
  if (!user) throw new Error("AUTH");
  if (mode === "local") return localApply(-Math.round(amount), type, note, ref);
  return fsApply(user.uid, -Math.round(amount), type, note, ref);
}

// ----- bets -----
// bet: {game, roundId?, marketId?, roundStart?, mode, stake, autoCashout?, hedge?, rainLeg?}
export async function placeBet(bet) {
  if (!user) throw new Error("AUTH");
  const betNote = bet.game === "prediction" ? `Prediction · ${bet.marketTitle || bet.mode}` : bet.game + " · " + bet.mode;
  if (mode === "local") {
    localApply(-bet.stake, "bet", betNote, null);
    const bets = lsGet(LS.bets, []);
    const id = "b" + Date.now() + Math.random().toString(36).slice(2, 6);
    bets.unshift({
      ...bet,
      id,
      uid: user.uid,
      name: user.name,
      status: "placed",
      payout: 0,
      multiplier: null,
      createdAt: Date.now(),
    });
    lsSet(LS.bets, bets.slice(0, 200));
    emit("bets", null);
    return id;
  }
  await fsApply(user.uid, -bet.stake, "bet", betNote, null);
  const ref = await addDoc(collection(db, "bets"), {
    ...bet,
    uid: user.uid,
    name: user.name,
    status: "placed",
    payout: 0,
    multiplier: null,
    createdAt: Date.now(),
  });
  return ref.id;
}

// settle a bet; when creditAmount > 0 the payout is credited to the wallet
export async function settleBet(betId, patch, creditAmount = 0, note = "payout") {
  if (mode === "local") {
    const bets = lsGet(LS.bets, []);
    const b = bets.find((x) => x.id === betId);
    if (b && b.status === "placed") {
      Object.assign(b, patch);
      lsSet(LS.bets, bets);
    }
    if (creditAmount > 0) localApply(creditAmount, "payout", note, betId);
    emit("bets", null);
    return;
  }
  try {
    await updateDoc(doc(db, "bets", betId), patch);
  } catch (e) {
    console.warn("settle failed", e);
  }
  if (creditAmount > 0) {
    try {
      await fsApply(user.uid, creditAmount, "payout", note, betId);
    } catch (e) {
      console.warn("payout credit failed", e);
    }
  }
}

export function subscribeRecentBets(cb, max = 15) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.bets, []).slice(0, max));
    listeners.bets.push(send);
    send();
    return () => (listeners.bets = listeners.bets.filter((f) => f !== send));
  }
  return onSnapshot(
    query(collection(db, "bets"), orderBy("createdAt", "desc"), limit(max)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeRoundBets(roundId, cb) {
  if (mode === "local") {
    const send = () =>
      cb(
        lsGet(LS.bets, [])
          .filter((b) => b.roundId === roundId)
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    listeners.bets.push(send);
    send();
    return () => (listeners.bets = listeners.bets.filter((f) => f !== send));
  }
  return onSnapshot(
    query(collection(db, "bets"), where("roundId", "==", roundId)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      ),
    () => cb([])
  );
}


export function subscribePredictionBets(marketId, cb) {
  if (mode === "local") {
    const send = () =>
      cb(
        lsGet(LS.bets, [])
          .filter((b) => b.game === "prediction" && b.marketId === marketId)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      );
    listeners.bets.push(send);
    send();
    return () => (listeners.bets = listeners.bets.filter((f) => f !== send));
  }
  return onSnapshot(
    query(collection(db, "bets"), where("marketId", "==", marketId)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((b) => b.game === "prediction")
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      ),
    () => cb([])
  );
}
