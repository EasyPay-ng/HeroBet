# HeroBet

HeroBet is a superhero-styled **peer-to-peer prediction pool** demo for Nigeria.
The important operator-risk rule is: **HeroBet does not promise fixed payouts out
of the operator's pocket.** Players stake into a market pool, HeroBet takes a
transparent platform fee, and winning tickets split the remaining pool.

All balances in this repository are simulated NGN until production payments,
licensing, KYC/AML, server-side escrow and settlement are added.

## Where the website files are

This is a Vite single-page app, so it does **not** have separate full pages such
as `dashboard.html`, `wallet.html`, etc. The source is inside `web/`:

- `web/index.html` — the app shell loaded by the browser
- `web/dashboard.html` — friendly redirect to `/#/dashboard`
- `web/predictions.html` — friendly redirect to `/#/predictions`
- `web/src/pages/*.js` — the actual screens/routes (`lobby`, `predictions`,
  `wallet`, `history`, etc.)
- `web/src/styles.css` — shared styling

Routes are hash routes, for example `/#/dashboard`, `/#/predictions`,
`/#/wallet`.

## What's here

- `web/` — Vite + Firebase web app
  - **Dashboard** (`#/dashboard`) — pool-funded platform overview
  - **Prediction Pools** (`#/predictions`) — peer-to-peer markets where winners
    are paid from the pool after the platform fee
  - **Pool Rules** (`#/promos`) — explanation of the no-house-liability model
  - **Wallet** (`#/wallet`) — simulated demo funds and ledger
  - **History** (`#/history`) — prediction tickets, demo bets and transactions
  - Demo games retained for testing: Classic Crash, Hero Dice and Gift Drop demo
  - Auth: Firebase email/password + anonymous guests, with localStorage fallback
- `.github/workflows/pages.yml` — builds `web/` and deploys `web/dist` to GitHub
  Pages when Pages is enabled for the repository
- `docs/SETUP-FIREBASE.md` — console steps to go from demo mode to Firestore
- `firestore.rules` — demo-grade rules; lock down before real money

## Run locally

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> web/dist
```

## GitHub Pages

The workflow builds the Vite app from `web/`. For GitHub Pages under this repo,
the production base path is `/HeroBet/`, so the deployed URL is expected to look
like:

```text
https://easypay-ng.github.io/HeroBet/
```

If GitHub Pages is not showing the site yet, enable Pages with **GitHub Actions**
as the source in the repository settings, then run the workflow.

## Production note

The current settlement is demo/client-settled for simulated money. Before real
money, move escrow, result resolution, fee accounting and payouts to trusted
server-side code (Cloud Functions or your backend), then make client wallet/bet
writes read-only in Firestore rules.
