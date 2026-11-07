# Firebase setup

The app initializes Firebase project `herobet-51d74` with the public web config
in `web/src/firebase.js`. The config identifies the project; it does not turn
on Authentication or deploy Firestore rules. Analytics initializes when supported
by the browser.

## Set up the project

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Add each deployed domain under **Authentication → Settings → Authorized domains**,
   including the production domain and any preview domain used for testing.
3. Create a **Firestore Database** and publish the repository's updated
   `firestore.rules` in the Firestore Rules console. **The new wallet, request,
   admin, and receiving-account rules must be deployed before using payments.**
   Editing the repository does not deploy rules.
4. Create or use the Firebase Auth account `beniwealth70@gmail.com`. When this
   account logs in, the app redirects it to `admin.html`. Other accounts cannot
   open the admin queue or perform admin writes, even if they call Firestore
   directly.
5. On the admin page, save the bank name, account name, and account number that
   users should transfer to. The values are stored at
   `config/depositAccount` and displayed in the user's Manual deposit dialog.
6. Open a normal user account. The app creates both `demoPlayers/{uid}` for the
   play-money game and `wallets/{uid}` with a zero-NGN balance. Reload the
   dashboard to confirm the wallet is read independently of the game account.

## Wallet schema

The dashboard's **Total Balance** reads this document:

```text
wallets/{uid}
  balance: 3000.11         # number, NGN
  currency: "NGN"
  updatedAt: 1762531200000 # number; set by the writer
```

A user can read only their own wallet and bootstrap it once with exactly zero
NGN. Subsequent client updates are denied unless the Firebase Auth token email
is exactly `beniwealth70@gmail.com`. The admin can read all wallets and approve
reviews directly from `admin.html`; no Cloud Functions or Admin SDK service is
required. Approved records are written to:

```text
wallets/{uid}/transactions/{requestId}
```

The owner and admin can read transactions. They are immutable to all browser
clients after creation.

## Manual deposit workflow

1. The admin saves the receiving account on `admin.html`.
2. The user transfers NGN using their own bank and submits the amount, optional
   sender name, and transfer reference. This creates a pending document at
   `depositRequests/{requestId}`; it does **not** change the wallet.
3. The admin verifies the amount and reference against the actual bank statement.
4. **Approve & credit** atomically marks the request approved, credits the
   wallet, and creates the wallet transaction. **Reject** only marks the request
   rejected. A reviewed request cannot be approved a second time.

## Manual withdrawal workflow

1. The user submits an amount and receiving bank details, creating a pending
   `withdrawalRequests/{requestId}`. Firestore rules require the requested amount
   to be no greater than the wallet balance at submission time.
2. The admin reviews the request and manually sends the bank transfer.
3. **Mark paid & debit** atomically marks the request completed, debits the
   wallet, and creates the transaction. The review fails if the wallet now has
   insufficient funds, so it cannot produce a negative balance. **Reject** does
   not change the wallet.

The app cannot independently verify a bank transfer. The admin is responsible
for checking deposits before approval and completing withdrawals before marking
them paid.

## Play-money game account

Signed-in users also get a private, client-writable `demoPlayers/{uid}` document
containing the game balance and up to 30 recent settled bets. This balance is
only for Super Hero and is never used as the dashboard wallet balance. Guests
can play with a game balance stored only in their browser. Demo rounds are
generated locally and are not shared or provably fair. Guest data is not
automatically merged into signed-in accounts.

**The game is not a real-money backend.** Demo balances and outcomes are
client-controlled, and simultaneous tabs or devices can overwrite one another.
A reload during an active or queued demo bet does not resume it; its stake has
already been deducted. Firestore rules limit access to the owner but do not make
bets trustworthy. Production betting requires server-authoritative shared rounds
and a transactional ledger, independent fairness audits, KYC/age verification,
responsible gambling controls, relevant licensing, and payment integration. The
legacy trading code and rules do not implement those requirements.
