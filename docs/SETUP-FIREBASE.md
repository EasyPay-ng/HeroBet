# HeroBet — Firebase setup

The app is wired to the **`herobet`** Firebase project
(`web/src/firebase.js`). Until Firestore answers, HeroBet runs in **local
mode**: everything works, but your desk is stored in that browser only and the
leaderboard and shared trade tape stay empty. The chip in the top bar tells you
which mode you're in.

These console steps take about five minutes.

## 1. Enable Firestore

Firebase Console → **Build → Firestore Database → Create database**

- Mode: **Start in production mode** (the rules below lock it down properly)
- Location: pick the region closest to your users — for Nigeria, `europe-west1`

## 2. Enable Authentication

Firebase Console → **Build → Authentication → Get started → Sign-in method**

- Enable **Anonymous** — powers the "Continue as guest" button
- Enable **Email/Password** — permanent accounts

Then **Authentication → Settings → Authorized domains**: add wherever you host
it (`easypay-ng.github.io`, any custom domain, and the Arena preview host if you
want sign-in to work in the live preview). `localhost` is allowed by default.

## 3. Deploy the security rules

**Option A — console:** Firestore → **Rules** → paste
[`firestore.rules`](../firestore.rules) from the repo root → **Publish**.

**Option B — CLI:**

```bash
npm i -g firebase-tools
firebase login
firebase init firestore     # select project "herobet", keep defaults
cp firestore.rules .        # then overwrite the generated file with the repo copy
firebase deploy --only firestore:rules
```

## 4. Verify

Reload the app. The top-bar chip should stop saying *Local mode*. Then:

1. Click **Open account → Continue as guest**
2. Open the terminal and buy something
3. In the Firestore console you should now see
   `users/`, `accounts/{uid}`, `accounts/{uid}/positions/`,
   `accounts/{uid}/orders/`, `accounts/{uid}/fills/`,
   `accounts/{uid}/ledger/` and a row in `tape/`

## Data model

| Path | Contents |
|---|---|
| `users/{uid}` | private profile: name, email, createdAt |
| `profiles/{uid}` | **public** leaderboard row: name, equity, pnlPct, trades (shape-validated by the rules) |
| `accounts/{uid}` | `cash`, `reserved` (short margin), `deposits`, `startingCash`, `trades` |
| `accounts/{uid}/positions/{symbol}` | signed `qty`, `avgPrice`, `realized`, `fees` — FX symbols are stored with `/` encoded as `_` |
| `accounts/{uid}/orders/{id}` | side, type, qty, limit/stop price, status, fill details |
| `accounts/{uid}/fills/{id}` | immutable executions (price, fee, realised P&L) |
| `accounts/{uid}/ledger/{id}` | append-only cash journal — never edited or deleted |
| `accounts/{uid}/watchlist/{symbol}` | starred markets |
| `tape/{id}` | public cross-user trade tape |
| `config/app` | read-only reachability probe; create it if you want, it isn't required |

### How the money stays consistent

`execute()` in `web/src/backend.js` runs **one Firestore transaction** that
reads the account, position and order, then writes all five documents (account,
position, order, fill, ledger) together. A fill can never update the balance
without journalling a matching ledger entry, and an order can never be filled
twice.

## What the rules do today

- Everything under `accounts/{uid}` is readable and writable **only by that
  user**. No cross-account access, ever.
- `fills` can't be edited after creation; `ledger` can't be edited *or* deleted.
- `profiles` and `tape` are world-readable but write-validated: field whitelist,
  type checks and length limits, so they can't be abused as free storage.
- Everything else is denied by default.

They do **not** stop a user from editing their own paper balance — that's
acceptable while the capital is simulated, and it's the first thing you change
if it ever isn't.

## Production lockdown checklist

1. **Cloud Functions** take over order matching, fills, balance mutations and
   resting-order triggers (the client monitor becomes display-only).
2. Change `accounts/{uid}` `allow create, update` to `if false` — only the
   Admin SDK writes balances.
3. Enable **App Check** (reCAPTCHA v3) and require it in the rules.
4. Add Firestore composite indexes if you extend the order/fill queries.
5. Sign a commercial market-data agreement (see
   [`MARKET-DATA.md`](MARKET-DATA.md) — the free endpoints aren't licensed for
   redistribution).
6. Only then: KYC/AML, a regulated broker or exchange partner, and the licences
   your market requires.
