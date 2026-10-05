# HeroBet

Superhero-inspired gaming platform (Nigeria) — midnight navy / electric gold /
restrained crimson. Original branding only, no third-party IP.

## What's here

- `web/` — Vite + Firebase web app (HeroBet platform)
  - **Lobby** (`#/`) — hero banner, Hero Originals grid, live wins feed
  - **Classic Crash** (`#/crash`) — time-synchronised shared rounds,
    auto-cashout, Under 1.5 market, live bets table, one-click Gift Drop hedge
  - **Hero Dice** (`#/dice`) — over/under dice, 99% RTP
  - **Gift Drop demo** (`#/gift-drop`) — the full rain flow from the spec,
    on demand; demo wins credit the platform wallet
  - **Wallet** (`#/wallet`) — balance, simulated deposits/withdrawals, ledger
  - **History** (`#/history`) — my bets & transactions
  - Auth: Firebase email/password + anonymous guests
- `docs/gift-drop-spec.md` — Gift Drop functional specification
- `docs/SETUP-FIREBASE.md` — console steps to go from Demo mode → Firestore live
- `firestore.rules` — security rules (demo-grade, lockdown path documented)

## Run locally

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → web/dist
```

## Status

Demo build — all money is simulated NGN. Server-side settlement, payments
and the live rain integration are the next milestones (see
`docs/SETUP-FIREBASE.md` → Production lockdown checklist).
