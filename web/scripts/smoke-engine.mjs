// Smoke test: engine math + hedge guarantee (run from web/ via node)
import {
  BETTING_MS,
  SETTLE_MS,
  crashPointFor,
  multiplierAt,
  currentRoundIndex,
  roundPhase,
  roundStart,
} from "../src/engine.js";

// 1. crash distribution
const N = 200000;
let under = 0,
  over2 = 0,
  over10 = 0,
  max = 0,
  bad = 0;
for (let i = 0; i < N; i++) {
  const cp = crashPointFor(i);
  if (!(cp >= 1 && cp <= 100)) bad++;
  if (cp < 1.5) under++;
  if (cp >= 2) over2++;
  if (cp >= 10) over10++;
  max = Math.max(max, cp);
}
console.log(`crash<1.5: ${(under / N * 100).toFixed(2)}% (target 36.27%)`);
console.log(`crash>=2:  ${(over2 / N * 100).toFixed(2)}% (target ~47.8%)`);
console.log(`crash>=10: ${(over10 / N * 100).toFixed(2)}% (target ~9.56%)`);
console.log(`max: ${max.toFixed(2)}x, invalid: ${bad}`);

// 2. hedge guarantee: ₦1000 @1.5 auto + ₦544 Under 1.5 (coeff 2.757)
let worst = 0,
  best = 0,
  totalReturn = 0;
for (let i = 0; i < 20000; i++) {
  const cp = crashPointFor(i + 5_000_000);
  const ret = cp >= 1.5 ? 1500 : 544 * 2.757;
  worst = Math.min(worst, ret - 1544);
  best = Math.max(best, ret - 1544);
  totalReturn += ret;
}
console.log(`hedge: worst ${worst.toFixed(2)}, best ${best.toFixed(2)}, avg return ${(totalReturn / 20000).toFixed(2)} (staked 1544 → expect ~1500, i.e. -44)`);

// 3. schedule sanity
const now = Date.now();
const i = currentRoundIndex(now);
console.log(`current round index: ${i}, phase: ${roundPhase(i).phase}`);
let ok = true;
for (let k = i - 3; k <= i; k++) {
  const len = roundStart(k + 1) - roundStart(k);
  const cp = crashPointFor(k);
  const expected = BETTING_MS + SETTLE_MS + (Math.log(cp) / 0.1) * 1000;
  if (Math.abs(len - expected) > 1) ok = false;
}
console.log(`schedule lengths match formula: ${ok}`);
console.log(`multiplierAt(0)=${multiplierAt(0)}, At(10s)=${multiplierAt(10000).toFixed(3)} (expect ~2.718)`);
