# HeroBet — Firebase setup guide

The web app (`web/`) is wired to the `herobet` Firebase project. Do these
console steps once (~5 minutes) to move from **Demo mode** (browser-local
data) to **Firestore live** (real accounts, shared bets, live feeds).

## 1. Enable Firestore

Firebase Console → **Build → Firestore Database → Create database**
- Mode: **Start in production mode** (the rules below lock it down properly)
- Location: `europe-west1` or `us-central1` (pick closest to your users — NG → europe-west)

## 2. Enable Authentication providers

Firebase Console → **Build → Authentication → Get started → Sign-in method**
- Enable **Anonymous** (guest heroes)
- Enable **Email/Password** (permanent accounts)

Also add your deploy domains under **Authentication → Settings → Authorized
domains** (localhost is already allowed for development).

## 3. Deploy the security rules

Option A (console): **Firestore → Rules** → paste the contents of
`firestore.rules` from the repo root → Publish.

Option B (CLI):
```bash
npm i -g firebase-tools
firebase login
firebase init firestore   # select project "herobet", keep default files, then overwrite with repo rules
firebase deploy --only firestore:rules
```

## 4. Verify

Reload the app — the top bar chip should show **"Firestore live"**.
Sign in as guest → you get a ₦10,000 demo credit → place a Crash bet →
check Firestore console: `users/`, `wallets/{uid}`, `wallets/{uid}/ledger/`,
`bets/` documents appear.

## Data model

| Path | Contents |
|---|---|
| `users/{uid}` | profile: name, email, createdAt |
| `wallets/{uid}` | cached balance (NGN) — always changed together with a ledger entry |
| `wallets/{uid}/ledger/{id}` | append-only transactions: deposit, withdrawal, bet, payout, demo-grant, rain-demo |
| `bets/{id}` | every bet: game, roundId, mode, stake, autoCashout, status, multiplier, payout, `hedge` flag, `qualifyVolume` (Classic crash-side volume counting toward Gift Drop eligibility) |
| `config/crash` | shared seed for deterministic crash rounds (rotate for production fairness) |

## Crash rounds without a server (current design)

All clients compute identical rounds from the shared seed: round `i`'s crash
point is `H(seed, i)`, and the schedule (8s betting → flight → 4s settle) is
anchored to a fixed epoch. This gives shared, time-synchronised rounds with
zero backend — good enough for the demo. **Caveat:** anyone who knows the
seed can precompute outcomes, so production must move round generation
server-side (commit/reveal) — see below.

## Production lockdown checklist (before real money)

1. **Cloud Functions**: bet settlement, wallet credits, dice rolls, crash
   round generation (commit/reveal), Gift Drop rain draws & eligibility
   (the 30% draw must be server-side — a client draw is cheatable).
2. Flip the demo-grade allowances in `firestore.rules` to `if false` for
   `wallets` and `bets` writes; only Functions (Admin SDK) write them.
3. Enable **App Check** (reCAPTCHA v3) to block non-app traffic.
4. Rotate `config/crash` seed; publish hash chain for provable fairness.
5. Payments: Paystack/Flutterwave for deposits & withdrawals; KYC flow.
6. Licensing & responsible-gambling requirements for your target markets.
