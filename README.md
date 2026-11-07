# HeroBet — Super Hero

HeroBet is a play-money Super Hero crash-game prototype, with a homepage,
email/password signup and login, account dashboard, NGN wallet, and manual
bank-transfer administration. Classic lets players cash out before the flight
ends; O/U lets them predict whether the flight ends at or above a coefficient.
Both support two slips and next-round bets.

Signed-in **game** balances and the last 30 settled bets are stored in
`demoPlayers/{uid}`. The dashboard's **Total Balance** is separate: it comes
from `wallets/{uid}.balance` in Firestore. Super Hero never spends this wallet.

## Manual payments and admin

Users transfer NGN to the receiving bank account configured by the admin, then
submit a deposit request and transfer reference. The admin verifies the bank
transfer and approves or rejects it in `admin.html`. Approval credits the wallet
and writes an immutable transaction in one Firestore transaction. Withdrawal
requests include the user's bank details; after paying manually, the admin marks
the request paid and the wallet is debited in the same transaction.

The designated admin is `beniwealth70@gmail.com`. A successful login with that
email goes directly to `admin.html`. The admin page configures the receiving
account, displays live requests and wallets, and processes reviews directly from
the browser. **No Cloud Functions, Admin SDK service, or automatic payment
provider is used.** Firestore rules restrict wallet and request review writes to
that admin email. See [Firebase setup](docs/SETUP-FIREBASE.md).

Guests can play without signing in using a browser-local game balance. Game
rounds are simulated separately in each browser, not shared between players.
Demo game accounts are client-writable and can be manipulated; simultaneous
sessions can overwrite each other. **Super Hero remains play money.** Manual
bank transfers require real-world verification by the admin; the app cannot
confirm that money arrived. A production gambling product also needs a
server-authoritative round engine and ledger, fairness audits, licensing, age
verification and other protections.

## Setup and run

```bash
cd web
npm install
npm run dev
npm test
npm run build
```

The Firebase project must have Email/Password authentication and Firestore
enabled, its hosting domains authorized, and the provided Firestore rules
deployed. See [Firebase setup](docs/SETUP-FIREBASE.md). The legacy trading source
remains for reference and is no longer loaded by the site.

O/U odds use the demo crash distribution with a 3% house edge and are rounded
down to two decimal places. The displayed payout multiplier is fixed when a bet
is placed.
