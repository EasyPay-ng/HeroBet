# HeroBet — Super Hero

HeroBet is a play-money Super Hero crash-game prototype, with a homepage,
email/password signup and login, account dashboard, and dedicated game page.
Classic lets players cash out before the flight ends; O/U lets them predict
whether the flight ends at or above a coefficient. Both support two slips and
next-round bets.

Signed-in demo balances and the last 30 settled bets are stored in Firestore.
Guests can play without signing in using a browser-local balance. Game rounds
are simulated separately in each browser, not shared between players. Demo
accounts are client-writable and can be manipulated; simultaneous sessions can
overwrite each other. **No real money, deposits, withdrawals or production
betting are supported.** A secure gambling product needs a server-authoritative
round engine and ledger, fairness audits, licensing, age verification and other
protections.

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
