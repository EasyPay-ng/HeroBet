// HeroBet — deterministic Classic Crash engine.
// Every client computes identical rounds from the shared seed (Firestore
// config/crash, or the built-in fallback) — global rounds without a server.
// Round i: crashPoint = H(seed, i). Schedule anchored to a fixed epoch:
//   round i = [betting 8s][flight ln(crash)/K seconds][settle 4s]
// Production fairness note: with a public seed anyone could precompute
// outcomes; the Cloud Functions milestone moves round generation server-side
// with commit/reveal (see docs/SETUP-FIREBASE.md).

import { crashSeed } from "./backend.js";

export const BETTING_MS = 8000;
export const SETTLE_MS = 4000;
export const K = 0.1; // multiplier growth: m(t) = e^(K·t)
export const P_UNDER = 0.3627; // P(crash < 1.50) → Under 1.5 coefficient 2.757
export const MAX_CRASH = 100;
const ANCHOR = Date.UTC(2026, 9, 5, 0, 0, 0); // 2026-10-05T00:00:00Z

// --- string hash → seeded RNG ---
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rand01(seed, i) {
  return mulberry32(xmur3(seed + ":" + i)())();
}

export function crashPointFor(i) {
  const r = rand01(crashSeed, i);
  if (r < P_UNDER) {
    // uniform in [1.00, 1.50)
    return 1 + (r / P_UNDER) * 0.5;
  }
  const u = (r - P_UNDER) / (1 - P_UNDER); // [0,1)
  return Math.min(1.5 / (1 - u), MAX_CRASH);
}

export function multiplierAt(elapsedMs) {
  return Math.exp((K * elapsedMs) / 1000);
}

// --- schedule (memoised cumulative starts) ---
const starts = [ANCHOR];
function ensure(now) {
  while (starts[starts.length - 1] <= now) {
    const i = starts.length - 1;
    starts.push(starts[i] + BETTING_MS + SETTLE_MS + (Math.log(crashPointFor(i)) / K) * 1000);
  }
}
export function roundStart(i) {
  ensure(Date.now() + 3600e3);
  return starts[i];
}
export function currentRoundIndex(now = Date.now()) {
  ensure(now);
  let lo = 0,
    hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= now) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
export function roundPhase(i, now = Date.now()) {
  const t = now - starts[i];
  const flight = (Math.log(crashPointFor(i)) / K) * 1000;
  if (t < BETTING_MS) return { phase: "betting", tLeft: BETTING_MS - t, flight };
  if (t < BETTING_MS + flight)
    return { phase: "flight", elapsed: t - BETTING_MS, flight, tLeft: BETTING_MS + flight - t };
  return { phase: "settled", tLeft: Math.max(0, SETTLE_MS - (t - BETTING_MS - flight)), flight };
}

export const roundId = (i) => "r" + i;
