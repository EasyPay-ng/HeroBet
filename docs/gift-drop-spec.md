# HeroBet Gift Drop — Functional Specification

**Version:** 0.1 (draft for review)
**Tagline:** Catch it. Claim it. Win it.
**Status:** Concept agreed, defaults marked ⚠ are my calls — veto any of them.

---

## 1. Overview

Gift Drop is HeroBet's hourly rain promotion. A gift rain randomly fires once per
hour during active hours. Eligible players tap during the rain to claim from a
fixed prize pool, visualised as falling gifts with a depleting progress bar
("gifts running out"). Only a random 30% of eligible players are winnable each
round.

The eligibility mechanic is a **calibrated hedge** on Classic crash that
guarantees the house a small profit from every qualifying player, making the
promotion self-funding at any participation level.

---

## 2. Round schedule

| Item | Rule |
|---|---|
| Active hours | 15 rounds/day — 9:35am round through 11:35pm round |
| Inactive | No rounds between midnight and the 9:35am round |
| Rain start | Randomly at **any second strictly inside the :35–:45 window** of the hour. Never at :45 or later. (Exact boundary at :35:00: treat window as `35:00 ≤ t < 45:00` ⚠) |
| Pre-rain banner | A **59-second countdown** appears before rain start ("Gift Drop incoming — 59… 58… 3… 2… 1… TAP!") |
| Rain window | Tapping opens the moment the countdown ends. Rain lasts until the pool is fully claimed or **60 seconds** elapse ⚠ |

Because rain start is random within the window, the qualifying bet cutoff
(`rainStart − 20:00`) lands somewhere between **:15:00 and :25:00**. A bet
placed by **:15:00** always qualifies; later bets qualify only if the rain
fires late enough in the window.

---

## 3. Eligibility

### 3.1 The hedge recipe (the intended qualification path)

Per Classic crash round, the player places both:

| Leg | Stake | Wins when | Return if won |
|---|---|---|---|
| Classic crash, auto-cashout **1.50x** | ₦1,000 | round crashes ≥ 1.50x | ₦1,500 |
| O/U **Under 1.5** | ₦544 | round crashes < 1.50x | 544 × ~2.757 ≈ ₦1,500 |

The legs are exact complements — one of them always wins. Total staked
**₦1,544**, returned **~₦1,500 either way**:

> **Guaranteed loss: ₦44 per pair. Zero variance. This is the house revenue.**

- Crash **exactly 1.50x** counts as a crash-side win (auto-cashout pays,
  Under 1.5 loses) ⚠ — so exactly one leg always pays.
- The ₦544 stake is calibrated to the Under-1.5 coefficient
  (`stake = 1500 ÷ coefficient`). If the coefficient drifts, the recipe stake
  must drift with it or the loss is no longer ₦44 ⚠. (Show players the live
  recipe on the Gift Drop info page.)

### 3.2 Per-round requirements

| Rounds | Crash-side stake required | Pairs needed | Guaranteed player cost | Gift if claimed |
|---|---|---|---|---|
| 9:35am – 5:35pm (9 rounds) | ₦5,000 | 5 × ₦1,000 | ₦220 | ₦500 |
| 6:35pm – 11:35pm (6 rounds) | ₦10,000 | 10 × ₦1,000 | ₦440 | ₦1,000 |

- **Only the crash-side ₦1,000 legs count** toward the ₦5,000/₦10,000
  requirement (5 pairs = exactly ₦5,000 — matches the ₦220/round cost).
- **Timing:** a qualifying bet must be placed **at or before `rainStart − 20:00`**
  (a bet placed exactly 20:00 before rain start **does** count).
- **Qualifying window per round:** bets placed after the previous round's rain
  started and no later than this round's cutoff ⚠. A bet qualifies for the
  **next rain only** — no double-counting across rounds ⚠.
- Eligibility resets every round; players must re-qualify each hour.
- Players who qualify see an **"Eligible ✓ for the [time] Gift Drop"** badge
  immediately ⚠ — this badge is what drives the Classic volume.

### 3.3 Raw bets outside the recipe

> "If users place raw bets outside this and win, they get credited only their
> stake amount — no multiplier."

- Any bet that counts toward rain eligibility but is **not part of the exact
  hedge pattern** (₦1,000 @ 1.50 auto-cashout paired with ₦544 Under 1.5 in
  the same round) pays **stake-only if it wins**.
- The hedge legs themselves pay normal multipliers — the ₦1,500 return is what
  makes the ₦44 loss exact.
- Practical effect: there is no cheaper or luckier path to eligibility than
  the recipe. A raw ₦5,000 shot at 10x returns ₦5,000, not ₦50,000.
- ⚠ Trust optic to resolve at design stage: this must be clearly disclosed on
  the bet slip (e.g. a "Qualify for Gift Drop" mode with visible stake-only
  terms) so nobody feels robbed of a "winning" bet.

---

## 4. Winner selection — the 30% rule

| Item | Rule |
|---|---|
| Selection pool | All eligible players in the round |
| Winners | **Random 30% of eligible players** (10 eligible → 3 winners) |
| Rounding | `floor(0.30 × eligible)`, minimum 1 winner if ≥ 1 eligible ⚠ |
| Hard cap | Day: 100 winners (₦50,000 ÷ ₦500). Evening: 100 winners (₦100,000 ÷ ₦1,000) ⚠ cap = pool ÷ gift; beyond ~334 eligible the odds drop below 30% |
| Unclaimed slots | A selected winner who doesn't tap during the rain forfeits; the slot is **not** reallocated ⚠ |

Selection happens at rain start. All eligible players see the rain and can
tap; only selected players' taps pay out.

---

## 5. Rain experience (UI/animation contract)

1. **:XX:35–45 minus 59s** — countdown banner slides in: "Your surprise has
   landed… in 59s."
2. **Rain start** — gifts fall across the screen; the ₦50,000 (day) /
   ₦100,000 (evening) pool visualised. Tapping unlocked.
3. **Progress bar** — shows gifts remaining out of 100; **depletes downward
   only** as winners claim. No refill. The "running out" animation is the
   urgency driver.
4. **Claim** — tap → gift box opens → reward reveal:
   "Congratulations! You won ₦500." → credited to wallet.
5. **Non-winners** — tap produces a "The heroes got there first" style
   miss message ⚠ (exact copy TBC).

Copy bank: *Tap. Claim. Win.* / *Your surprise has landed.* /
*Claim it before it disappears.* / *A heroic reward just dropped.*

---

## 6. Payouts

| Item | Rule |
|---|---|
| Amount | ₦500 (day rounds) / ₦1,000 (evening rounds) |
| Type | **Real cash, credited instantly to withdrawable balance** ⚠ (bonus credit with wagering would break the "make back with little profit" logic — but confirm) |
| Disclosure | Reward type, round, and full terms shown before/during claim |

---

## 7. House economics

**Per qualifying player per round (guaranteed):** day ₦220 collected,
evening ₦440 collected — regardless of who wins the rain.

| Scenario | Eligible | Winners | Paid out | Collected | Net |
|---|---|---|---|---|---|
| Day, light traffic | 20 | 6 | ₦3,000 | ₦4,400 | **+₦1,400** |
| Day, full pool | ~334 | 100 (cap) | ₦50,000 | ₦73,480 | **+₦23,480** |
| Evening, light | 20 | 6 | ₦6,000 | ₦8,800 | **+₦2,800** |
| Evening, full pool | ~334 | 100 (cap) | ₦100,000 | ₦146,960 | **+₦46,960** |

Expected value per eligible player: day +₦70, evening +₦140 to the house.
The promotion is house-positive at every participation level, including at
full pool. Daily maximum exposure: 9 × ₦50k + 6 × ₦100k = **₦1.05M** (only
reached at ~334 eligible per round).

---

## 8. Defaults I chose (veto any)

1. Rain window boundary `35:00 ≤ t < 45:00` (§2).
2. Rain window lasts 60s or until pool empties (§2).
3. Exact 1.50x crash → crash side wins (§3.1).
4. Recipe stake recalibrates live with the Under-1.5 coefficient (§3.1).
5. Qualifying window = since previous rain, next-rain-only counting (§3.2).
6. Eligibility badge shown on qualification (§3.2).
7. Winner rounding: floor, min 1; hard cap 100; no reallocation of unclaimed
   slots (§4).
8. Reward is real cash, instantly credited (§6).

## 9. Still open

- Exact miss/reveal copy for non-winners (§5.4).
- Whether unspent pool (few winners) is simply kept or rolls over.
- Regulatory framing for stake-only wins on raw qualifying bets (§3.3).
- Anti-abuse: device/IP fingerprinting, one account per claim — assumed, not
  yet specified.
