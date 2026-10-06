// HeroBet — data layer for the paper-trading desk.
//
// Primary backend : Firebase Auth + Cloud Firestore (your `herobet` project)
// Fallback backend: localStorage, used automatically when Firestore isn't
// reachable yet, so the terminal always works. Identical API for both — pages
// never branch on mode.
//
// Money rule: cash and positions only ever move inside execute(), which writes
// the account, the position, the order, a fill and a ledger entry in ONE
// transaction. When you move settlement to Cloud Functions, flip the client
// write rules off and this same ledger keeps working.

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
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit as fsLimit,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { instrument, DEFAULT_WATCHLIST } from "./market/instruments.js";
import { applyTrade, feeFor, checkAffordable, round2 } from "./engine/paper.js";

export const STARTING_CASH = 100000; // USD paper capital
export const ACCOUNT_CURRENCY = "USD";

export let mode = "firestore"; // 'firestore' | 'local'
export let modeReason = "";

let user = null;

/** Firestore doc ids can't contain "/" — FX symbols need encoding. */
export const docKey = (symbol) => String(symbol).replace(/\//g, "_");

// ─────────────────────────── tiny event bus (local mode) ───────────────────────────
const bus = new Map();
const on = (k, cb) => {
  if (!bus.has(k)) bus.set(k, new Set());
  bus.get(k).add(cb);
  return () => bus.get(k).delete(cb);
};
const fire = (k) => {
  for (const cb of bus.get(k) || []) {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  }
};

// ─────────────────────────── localStorage store ───────────────────────────
const LS = {
  user: "hb_t_user",
  account: "hb_t_account",
  positions: "hb_t_positions",
  orders: "hb_t_orders",
  fills: "hb_t_fills",
  ledger: "hb_t_ledger",
  watch: "hb_t_watch",
  tape: "hb_t_tape",
};

const lsGet = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v === null || v === undefined ? d : v;
  } catch {
    return d;
  }
};

const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota / private mode */
  }
};

function localUser() {
  let u = lsGet(LS.user, null);
  if (!u) {
    u = {
      uid: "local-" + Math.random().toString(36).slice(2, 10),
      name: "Trader-" + (1000 + Math.floor(Math.random() * 9000)),
      email: null,
      local: true,
    };
    lsSet(LS.user, u);
  }
  return u;
}

function freshAccount() {
  return {
    cash: STARTING_CASH,
    reserved: 0,
    startingCash: STARTING_CASH,
    deposits: STARTING_CASH,
    currency: ACCOUNT_CURRENCY,
    trades: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function localAccount() {
  let a = lsGet(LS.account, null);
  if (!a) {
    a = freshAccount();
    lsSet(LS.account, a);
    lsSet(LS.ledger, [
      {
        id: "open",
        type: "deposit",
        amount: STARTING_CASH,
        balanceAfter: STARTING_CASH,
        note: "Opening paper capital",
        createdAt: Date.now(),
      },
    ]);
  }
  return a;
}

// ─────────────────────────── in-memory caches ───────────────────────────
// Kept hot so the order monitor and the order ticket can validate instantly.
const cache = {
  account: null,
  positions: [],
  orders: [],
  watchlist: [],
};

export function state() {
  return cache;
}

export function positionFor(symbol) {
  return cache.positions.find((p) => p.symbol === symbol) || { symbol, qty: 0, avgPrice: 0, realized: 0, fees: 0 };
}

export function openOrders() {
  return cache.orders.filter((o) => o.status === "open");
}

// ─────────────────────────── init / auth ───────────────────────────
export function currentUser() {
  return user;
}

export async function initBackend() {
  try {
    await Promise.race([
      getDoc(doc(db, "config", "app")),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 7000)),
    ]);
    mode = "firestore";
  } catch (e) {
    mode = "local";
    modeReason = e?.code || e?.message || "unreachable";
  }
  return { mode, modeReason };
}

async function fsEnsureAccount(u) {
  await runTransaction(db, async (tx) => {
    const uref = doc(db, "users", u.uid);
    const aref = doc(db, "accounts", u.uid);
    const [usnap, asnap] = await Promise.all([tx.get(uref), tx.get(aref)]);
    if (!usnap.exists()) {
      tx.set(uref, { uid: u.uid, name: u.name, email: u.email || null, createdAt: Date.now() });
    }
    if (!asnap.exists()) {
      tx.set(aref, { uid: u.uid, ...freshAccount() });
      tx.set(doc(db, "accounts", u.uid, "ledger", "open"), {
        type: "deposit",
        amount: STARTING_CASH,
        balanceAfter: STARTING_CASH,
        note: "Opening paper capital",
        createdAt: Date.now(),
      });
      for (const s of DEFAULT_WATCHLIST) {
        tx.set(doc(db, "accounts", u.uid, "watchlist", docKey(s)), { symbol: s, addedAt: Date.now() });
      }
    }
  });
}

let stopCaches = [];

function startCaches() {
  stopCaches.forEach((f) => f());
  stopCaches = [
    subscribeAccount((a) => (cache.account = a)),
    subscribePositions((p) => (cache.positions = p)),
    subscribeOrders((o) => (cache.orders = o)),
    subscribeWatchlist((w) => (cache.watchlist = w)),
  ];
}

function clearCaches() {
  stopCaches.forEach((f) => f());
  stopCaches = [];
  cache.account = null;
  cache.positions = [];
  cache.orders = [];
  cache.watchlist = [];
}

export function onAuth(cb) {
  if (mode === "local") {
    const off = on("auth", () => cb(user));
    user = localUser();
    localAccount();
    startCaches();
    cb(user);
    return off;
  }
  return onAuthStateChanged(auth, async (fu) => {
    if (fu) {
      const name = fu.displayName || (fu.email ? fu.email.split("@")[0] : "Trader-" + fu.uid.slice(0, 4));
      user = { uid: fu.uid, name, email: fu.email || null, anonymous: fu.isAnonymous };
      try {
        await fsEnsureAccount(user);
      } catch (e) {
        console.warn("ensureAccount failed", e);
      }
      startCaches();
    } else {
      user = null;
      clearCaches();
    }
    cb(user);
  });
}

const authErr = (e) => {
  const code = e?.code || "";
  if (code === "auth/operation-not-allowed")
    return "That sign-in method isn't enabled yet — turn it on in Firebase Console → Authentication → Sign-in method.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code))
    return "Wrong email or password.";
  if (code === "auth/email-already-in-use") return "That email already has an account — sign in instead.";
  if (code === "auth/weak-password") return "Password too weak — use at least 6 characters.";
  if (code === "auth/invalid-email") return "That email address doesn't look right.";
  if (code === "auth/network-request-failed") return "Network problem — check your connection.";
  if (code === "auth/too-many-requests") return "Too many attempts — wait a minute and try again.";
  return e?.message?.replace("Firebase: ", "") || "Something went wrong.";
};

export async function signInGuest() {
  if (mode === "local") {
    user = localUser();
    fire("auth");
    return user;
  }
  try {
    const cred = await signInAnonymously(auth);
    const name = "Trader-" + (1000 + Math.floor(Math.random() * 9000));
    await updateProfile(cred.user, { displayName: name });
    return { uid: cred.user.uid, name, email: null };
  } catch (e) {
    throw new Error(authErr(e));
  }
}

export async function signUpEmail(email, password, name) {
  if (mode === "local") throw new Error("Demo mode — email accounts need Firestore. See docs/SETUP-FIREBASE.md.");
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
  if (mode === "local") throw new Error("Demo mode — email accounts need Firestore. See docs/SETUP-FIREBASE.md.");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { uid: cred.user.uid, name: cred.user.displayName || email.split("@")[0], email };
  } catch (e) {
    throw new Error(authErr(e));
  }
}

export async function signOut() {
  if (mode === "local") {
    user = null;
    clearCaches();
    fire("auth");
    return;
  }
  await fbSignOut(auth);
}

// ─────────────────────────── subscriptions ───────────────────────────
export function subscribeAccount(cb) {
  if (mode === "local") {
    const send = () => cb(localAccount());
    const off = on("account", send);
    send();
    return off;
  }
  if (!user) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "accounts", user.uid),
    (s) => cb(s.exists() ? s.data() : null),
    () => cb(null)
  );
}

export function subscribePositions(cb) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.positions, []).filter((p) => p.qty));
    const off = on("positions", send);
    send();
    return off;
  }
  if (!user) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, "accounts", user.uid, "positions"),
    (s) => cb(s.docs.map((d) => d.data()).filter((p) => p.qty)),
    () => cb([])
  );
}

export function subscribeOrders(cb, max = 100) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.orders, []).slice(0, max));
    const off = on("orders", send);
    send();
    return off;
  }
  if (!user) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "accounts", user.uid, "orders"), orderBy("createdAt", "desc"), fsLimit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeFills(cb, max = 100) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.fills, []).slice(0, max));
    const off = on("fills", send);
    send();
    return off;
  }
  if (!user) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "accounts", user.uid, "fills"), orderBy("createdAt", "desc"), fsLimit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeLedger(cb, max = 80) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.ledger, []).slice(0, max));
    const off = on("ledger", send);
    send();
    return off;
  }
  if (!user) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "accounts", user.uid, "ledger"), orderBy("createdAt", "desc"), fsLimit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeWatchlist(cb) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.watch, DEFAULT_WATCHLIST));
    const off = on("watch", send);
    send();
    return off;
  }
  if (!user) {
    cb(DEFAULT_WATCHLIST);
    return () => {};
  }
  return onSnapshot(
    collection(db, "accounts", user.uid, "watchlist"),
    (s) => cb(s.docs.map((d) => d.data().symbol).filter(Boolean)),
    () => cb(DEFAULT_WATCHLIST)
  );
}

export async function toggleWatchlist(symbol) {
  if (mode === "local") {
    const w = lsGet(LS.watch, DEFAULT_WATCHLIST);
    const next = w.includes(symbol) ? w.filter((s) => s !== symbol) : [...w, symbol];
    lsSet(LS.watch, next);
    fire("watch");
    return next.includes(symbol);
  }
  if (!user) throw new Error("AUTH");
  const ref = doc(db, "accounts", user.uid, "watchlist", docKey(symbol));
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { symbol, addedAt: Date.now() });
  return true;
}

/** Public trade tape — every fill from every trader on this Firebase project. */
export function subscribeTape(cb, max = 25) {
  if (mode === "local") {
    const send = () => cb(lsGet(LS.tape, []).slice(0, max));
    const off = on("tape", send);
    send();
    return off;
  }
  return onSnapshot(
    query(collection(db, "tape"), orderBy("createdAt", "desc"), fsLimit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export function subscribeLeaderboard(cb, max = 10) {
  if (mode === "local") {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "profiles"), orderBy("pnlPct", "desc"), fsLimit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

// ─────────────────────────── orders & fills ───────────────────────────

/**
 * Place an order.
 * Market orders execute immediately against the live quote; limit/stop orders
 * rest until the order monitor sees the price trade through them.
 * @returns {Promise<{id:string, status:string}>}
 */
export async function placeOrder({ symbol, side, type, qty, limitPrice, stopPrice }, quote) {
  if (!user) throw new Error("Sign in to trade");
  const inst = instrument(symbol);
  if (!inst) throw new Error("Unknown instrument");
  qty = Number(qty);
  if (!(qty > 0)) throw new Error("Enter a quantity");

  const order = {
    symbol,
    assetClass: inst.class,
    side,
    type,
    qty,
    limitPrice: type === "limit" ? Number(limitPrice) : null,
    stopPrice: type === "stop" ? Number(stopPrice) : null,
    status: "open",
    filledQty: 0,
    avgFill: 0,
    fee: 0,
    realized: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (type === "market") {
    const price = quote?.execPrice || quote?.price;
    if (!price) throw new Error("No live price for this market yet");
    const chk = checkAffordable(
      { cash: cache.account?.cash || 0, reserved: cache.account?.reserved || 0 },
      positionFor(symbol),
      inst,
      { side, qty, price }
    );
    if (!chk.ok) throw new Error(`${chk.reason} — short by $${chk.shortfall.toFixed(2)}`);
    const id = await createOrder(order);
    await execute(id, price);
    return { id, status: "filled" };
  }

  const ref = type === "limit" ? Number(limitPrice) : Number(stopPrice);
  if (!(ref > 0)) throw new Error(type === "limit" ? "Enter a limit price" : "Enter a stop price");
  const id = await createOrder(order);
  return { id, status: "open" };
}

async function createOrder(order) {
  if (mode === "local") {
    const id = "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const list = lsGet(LS.orders, []);
    list.unshift({ id, ...order });
    lsSet(LS.orders, list.slice(0, 200));
    fire("orders");
    return id;
  }
  const ref = await addDoc(collection(db, "accounts", user.uid, "orders"), order);
  return ref.id;
}

export async function cancelOrder(id) {
  if (mode === "local") {
    const list = lsGet(LS.orders, []);
    const o = list.find((x) => x.id === id);
    if (o && o.status === "open") {
      o.status = "cancelled";
      o.updatedAt = Date.now();
      lsSet(LS.orders, list);
      fire("orders");
    }
    return;
  }
  await updateDoc(doc(db, "accounts", user.uid, "orders", id), { status: "cancelled", updatedAt: Date.now() });
}

/**
 * Execute an open order at `price`. Atomically updates account, position,
 * order, fill and ledger. Safe to call twice — a filled order is skipped.
 */
export async function execute(orderId, price) {
  if (!user) throw new Error("AUTH");
  price = Number(price);
  if (!(price > 0)) throw new Error("BAD_PRICE");

  if (mode === "local") return localExecute(orderId, price);

  const uid = user.uid;
  let tapeRow = null;

  await runTransaction(db, async (tx) => {
    const oRef = doc(db, "accounts", uid, "orders", orderId);
    const aRef = doc(db, "accounts", uid);
    const oSnap = await tx.get(oRef);
    if (!oSnap.exists()) throw new Error("ORDER_GONE");
    const order = oSnap.data();
    if (order.status !== "open") return;

    const pRef = doc(db, "accounts", uid, "positions", docKey(order.symbol));
    const [aSnap, pSnap] = await Promise.all([tx.get(aRef), tx.get(pRef)]);
    if (!aSnap.exists()) throw new Error("NO_ACCOUNT");

    const acct = aSnap.data();
    const pos = pSnap.exists() ? pSnap.data() : { symbol: order.symbol, qty: 0, avgPrice: 0, realized: 0, fees: 0 };
    const inst = instrument(order.symbol);
    const notional = order.qty * price;
    const fee = feeFor(inst, notional);

    const chk = checkAffordable({ cash: acct.cash, reserved: acct.reserved || 0 }, pos, inst, {
      side: order.side,
      qty: order.qty,
      price,
    });
    if (!chk.ok) {
      tx.update(oRef, { status: "rejected", reason: chk.reason, updatedAt: Date.now() });
      return;
    }

    const res = applyTrade({ cash: acct.cash, reserved: acct.reserved || 0 }, pos, {
      side: order.side,
      qty: order.qty,
      price,
      fee,
    });

    tx.update(aRef, {
      cash: res.cash,
      reserved: res.reserved,
      trades: (acct.trades || 0) + 1,
      updatedAt: Date.now(),
    });

    if (res.position.qty === 0) {
      tx.set(pRef, { ...res.position, symbol: order.symbol, assetClass: inst.class, closedAt: Date.now() });
    } else {
      tx.set(pRef, {
        ...res.position,
        symbol: order.symbol,
        assetClass: inst.class,
        openedAt: pos.openedAt || Date.now(),
        updatedAt: Date.now(),
      });
    }

    tx.update(oRef, {
      status: "filled",
      filledQty: order.qty,
      avgFill: price,
      fee,
      realized: res.realized,
      filledAt: Date.now(),
      updatedAt: Date.now(),
    });

    tx.set(doc(collection(db, "accounts", uid, "fills")), {
      orderId,
      symbol: order.symbol,
      assetClass: inst.class,
      side: order.side,
      type: order.type,
      qty: order.qty,
      price,
      notional: round2(notional),
      fee,
      realized: res.realized,
      createdAt: Date.now(),
    });

    tx.set(doc(collection(db, "accounts", uid, "ledger")), {
      type: order.side === "buy" ? "buy" : "sell",
      amount: res.cashDelta,
      balanceAfter: res.cash,
      note: `${order.side === "buy" ? "Bought" : "Sold"} ${order.qty} ${order.symbol} @ ${price}`,
      ref: orderId,
      fee,
      createdAt: Date.now(),
    });

    tapeRow = {
      name: user.name,
      symbol: order.symbol,
      assetClass: inst.class,
      side: order.side,
      qty: order.qty,
      price,
      createdAt: Date.now(),
    };
  });

  if (tapeRow) {
    try {
      await addDoc(collection(db, "tape"), tapeRow);
    } catch {
      /* tape is best-effort */
    }
  }
}

function localExecute(orderId, price) {
  const orders = lsGet(LS.orders, []);
  const order = orders.find((o) => o.id === orderId);
  if (!order || order.status !== "open") return;

  const acct = localAccount();
  const positions = lsGet(LS.positions, []);
  let pos = positions.find((p) => p.symbol === order.symbol);
  if (!pos) {
    pos = { symbol: order.symbol, qty: 0, avgPrice: 0, realized: 0, fees: 0 };
    positions.push(pos);
  }

  const inst = instrument(order.symbol);
  const notional = order.qty * price;
  const fee = feeFor(inst, notional);
  const chk = checkAffordable({ cash: acct.cash, reserved: acct.reserved || 0 }, pos, inst, {
    side: order.side,
    qty: order.qty,
    price,
  });
  if (!chk.ok) {
    order.status = "rejected";
    order.reason = chk.reason;
    order.updatedAt = Date.now();
    lsSet(LS.orders, orders);
    fire("orders");
    return;
  }

  const res = applyTrade({ cash: acct.cash, reserved: acct.reserved || 0 }, pos, {
    side: order.side,
    qty: order.qty,
    price,
    fee,
  });

  acct.cash = res.cash;
  acct.reserved = res.reserved;
  acct.trades = (acct.trades || 0) + 1;
  acct.updatedAt = Date.now();
  lsSet(LS.account, acct);

  Object.assign(pos, res.position, { symbol: order.symbol, assetClass: inst.class, updatedAt: Date.now() });
  lsSet(LS.positions, positions);

  Object.assign(order, {
    status: "filled",
    filledQty: order.qty,
    avgFill: price,
    fee,
    realized: res.realized,
    filledAt: Date.now(),
    updatedAt: Date.now(),
  });
  lsSet(LS.orders, orders);

  const fills = lsGet(LS.fills, []);
  fills.unshift({
    id: "f" + Date.now().toString(36),
    orderId,
    symbol: order.symbol,
    assetClass: inst.class,
    side: order.side,
    type: order.type,
    qty: order.qty,
    price,
    notional: round2(notional),
    fee,
    realized: res.realized,
    createdAt: Date.now(),
  });
  lsSet(LS.fills, fills.slice(0, 200));

  const ledger = lsGet(LS.ledger, []);
  ledger.unshift({
    id: "l" + Date.now().toString(36),
    type: order.side,
    amount: res.cashDelta,
    balanceAfter: res.cash,
    note: `${order.side === "buy" ? "Bought" : "Sold"} ${order.qty} ${order.symbol} @ ${price}`,
    ref: orderId,
    fee,
    createdAt: Date.now(),
  });
  lsSet(LS.ledger, ledger.slice(0, 200));

  const tape = lsGet(LS.tape, []);
  tape.unshift({
    id: "t" + Date.now().toString(36),
    name: user?.name || "You",
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    price,
    createdAt: Date.now(),
  });
  lsSet(LS.tape, tape.slice(0, 50));

  fire("account");
  fire("positions");
  fire("orders");
  fire("fills");
  fire("ledger");
  fire("tape");
}

// ─────────────────────────── cash & admin ───────────────────────────
export async function deposit(amount, note = "Paper capital top-up") {
  if (!user) throw new Error("AUTH");
  amount = round2(amount);
  if (!(amount > 0)) throw new Error("Enter an amount");

  if (mode === "local") {
    const a = localAccount();
    a.cash = round2(a.cash + amount);
    a.deposits = round2((a.deposits || 0) + amount);
    a.updatedAt = Date.now();
    lsSet(LS.account, a);
    const led = lsGet(LS.ledger, []);
    led.unshift({
      id: "l" + Date.now().toString(36),
      type: "deposit",
      amount,
      balanceAfter: a.cash,
      note,
      createdAt: Date.now(),
    });
    lsSet(LS.ledger, led.slice(0, 200));
    fire("account");
    fire("ledger");
    return a.cash;
  }

  return runTransaction(db, async (tx) => {
    const aRef = doc(db, "accounts", user.uid);
    const snap = await tx.get(aRef);
    if (!snap.exists()) throw new Error("NO_ACCOUNT");
    const a = snap.data();
    const cash = round2(a.cash + amount);
    tx.update(aRef, { cash, deposits: round2((a.deposits || 0) + amount), updatedAt: Date.now() });
    tx.set(doc(collection(db, "accounts", user.uid, "ledger")), {
      type: "deposit",
      amount,
      balanceAfter: cash,
      note,
      createdAt: Date.now(),
    });
    return cash;
  });
}

/** Wipe positions/orders and restore the opening balance. */
export async function resetAccount() {
  if (!user) throw new Error("AUTH");
  if (mode === "local") {
    lsSet(LS.account, freshAccount());
    lsSet(LS.positions, []);
    lsSet(LS.orders, []);
    lsSet(LS.fills, []);
    lsSet(LS.ledger, [
      {
        id: "open",
        type: "deposit",
        amount: STARTING_CASH,
        balanceAfter: STARTING_CASH,
        note: "Account reset",
        createdAt: Date.now(),
      },
    ]);
    ["account", "positions", "orders", "fills", "ledger"].forEach(fire);
    return;
  }
  const uid = user.uid;
  for (const sub of ["positions", "orders", "fills"]) {
    const snap = await getDocs(collection(db, "accounts", uid, sub));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
  await setDoc(doc(db, "accounts", uid), { uid, ...freshAccount() });
  await addDoc(collection(db, "accounts", uid, "ledger"), {
    type: "deposit",
    amount: STARTING_CASH,
    balanceAfter: STARTING_CASH,
    note: "Account reset",
    createdAt: Date.now(),
  });
}

// ─────────────────────────── public profile (leaderboard) ───────────────────────────
let lastPush = 0;

export async function publishPerformance(summary) {
  if (mode !== "firestore" || !user) return;
  if (Date.now() - lastPush < 60000) return;
  lastPush = Date.now();
  try {
    await setDoc(
      doc(db, "profiles", user.uid),
      {
        uid: user.uid,
        name: user.name,
        equity: summary.equity,
        pnlPct: summary.totalPnlPct,
        trades: cache.account?.trades || 0,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch {
    /* rules may block it — not critical */
  }
}
