# Firebase setup

The app initializes Firebase project `herobet-51d74` with the public web config
in `web/src/firebase.js`. The config identifies the project; it does not turn
on Authentication or deploy Firestore rules. Analytics initializes when supported
by the browser.

## Set up the project

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Add each deployed domain under **Authentication → Settings → Authorized domains**,
   including the production domain and any preview domain used for testing.
3. Create a **Firestore Database** and publish the repository's `firestore.rules`
   in the Firestore Rules console (or deploy them using the Firebase CLI to the
   `herobet-51d74` project). No rules have been deployed by this repository change.
4. Open the site, sign up, and confirm a `demoPlayers/{uid}` document appears.
   Reload the dashboard and game to check that the demo balance and recent bets
   are restored. If setup fails, the game shows a retry message instead of
   silently switching a signed-in player to a different local account.

Signed-in users get a private, client-writable Firestore demo account containing
balance and up to 30 recent settled bets. Guest users can play with a balance
stored only in their browser. Demo rounds are generated locally and are not shared
or provably fair. Guest data is not automatically merged into signed-in accounts.

**This is not a real-money backend.** The demo balance and outcomes are
client-controlled, and simultaneous tabs or devices can overwrite one another.
A reload during an active or queued demo bet does not resume it; its stake has
already been deducted. Firestore rules limit access to the owner but do not make
bets trustworthy. Do not use these rules or this game engine to handle actual
money. Production betting requires server-authoritative shared rounds and a
transactional ledger, independent fairness audits, KYC/age verification,
responsible gambling controls, and relevant licensing and payment integration.
The legacy trading code and rules do not implement those requirements.
