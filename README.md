# HeroBet — Super Hero

HeroBet is a browser-only, play-money prototype of a superhero-themed crash game. In Classic mode, place up to two bets, watch the multiplier rise, and cash out before the hero flies away. Queue bets for the next flight at any time, including while the current flight is running. Classic also supports auto bet and auto cashout. In O/U mode, place up to two fixed-odds bets on whether the next flight ends at or above a selected coefficient (Over) or below it (Under). O/U bets settle at the end of the flight, with no cashout. Both modes share the demo balance and local activity log.

**This is not a real-money betting product.** No deposits, withdrawals, authentication or shared multiplayer rounds are implemented. Round outcomes are generated locally in the browser and are not provably fair. The demo balance is stored in localStorage; game activity is held in memory. A production betting service would require a secure server-authoritative game and ledger, independent fairness audits, payment integration, age verification, responsible gambling controls and appropriate licensing.

## Run locally

```bash
cd web
npm install
npm run dev
npm run build
```

Open the Vite URL in your browser. The legacy trading source remains in the repository for reference, but is no longer loaded by the game.

O/U odds are calculated from the demo crash distribution with a 3% house edge and rounded down to two decimal places. The displayed payout multiplier is fixed when the bet is placed.
