# HeroBet — Super Hero

HeroBet is a browser-only, play-money prototype of a superhero-themed crash game. Place up to two bets before each round, watch the multiplier rise, and cash out before the hero flies away. The game includes optional auto bet and auto cashout, local bet history and a resettable demo balance.

**This is not a real-money betting product.** No deposits, withdrawals, authentication or shared multiplayer rounds are implemented. Round outcomes are generated locally in the browser and are not provably fair. The demo balance is stored in localStorage; game activity is held in memory. A production betting service would require a secure server-authoritative game and ledger, independent fairness audits, payment integration, age verification, responsible gambling controls and appropriate licensing.

## Run locally

```bash
cd web
npm install
npm run dev
npm run build
```

Open the Vite URL in your browser. The legacy trading source remains in the repository for reference, but is no longer loaded by the game.
