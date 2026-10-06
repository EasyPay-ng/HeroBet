// HeroBet — how the desk works.

import { FEE_BPS, SHORT_MARGIN_RATE } from "../engine/paper.js";
import { STARTING_CASH } from "../backend.js";
import { INSTRUMENTS, CRYPTO, STOCKS, FX } from "../market/instruments.js";
import { usd } from "../ui.js";

export const aboutPage = {
  mount(outlet) {
    outlet.innerHTML = `
      <section class="page narrow">
        <header class="page-head">
          <div><h1>How HeroBet works</h1><p class="muted">Real market data. Simulated capital. No house edge, no counterparty.</p></div>
        </header>

        <div class="card">
          <div class="card-head"><h3>The short version</h3></div>
          <div class="pad prose">
            <p>
              HeroBet is a <b>paper-trading terminal</b>. You get ${usd(STARTING_CASH, 0)} of simulated capital and
              trade ${INSTRUMENTS.length} real markets — ${CRYPTO.length} crypto pairs, ${STOCKS.length} US equities
              and ${FX.length} currency pairs — at the prices those markets are actually printing right now.
            </p>
            <p>
              Nothing you do here moves real money. HeroBet takes no deposits, holds no client funds and is not a
              broker. It is a place to practise, test a strategy and keep an honest record of the result.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Where the prices come from</h3></div>
          <div class="pad prose">
            <ul>
              <li><b>Crypto</b> — your browser streams live trades straight from Binance, Bybit, OKX or Coinbase
                (whichever answers fastest on your network) over a websocket. Order book and market tape are the
                venue's real depth and prints.</li>
              <li><b>Stocks</b> — US equities come from the data vendor you connect in Settings (Twelve Data,
                Finnhub or Alpha Vantage). Without a key, stock rows stay locked rather than showing invented numbers.</li>
              <li><b>Forex</b> — official daily reference rates from open.er-api.com / the ECB, upgraded to
                intraday quotes when a Twelve Data key is connected.</li>
            </ul>
            <p class="muted">If a venue is unreachable on your connection, HeroBet fails over to the next one automatically.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Execution rules</h3></div>
          <div class="pad prose">
            <ul>
              <li><b>Market orders</b> fill immediately at the live best bid/offer from the venue.</li>
              <li><b>Limit orders</b> rest until the real market trades through your price, then fill at your limit.</li>
              <li><b>Stop orders</b> become market orders when the trigger prints.</li>
              <li><b>Fees</b> — ${FEE_BPS.crypto / 100}% on crypto, ${FEE_BPS.fx / 100}% on FX, commission-free on stocks,
                charged on every fill just like a real taker fee.</li>
              <li><b>Shorting</b> is allowed with ${SHORT_MARGIN_RATE * 100}% initial margin: a $1,000 short ties up the
                same buying power as a $1,000 purchase. No leverage, so you can't be liquidated by a wick.</li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Your data</h3></div>
          <div class="pad prose">
            <p>
              Accounts, positions, orders, fills and the cash ledger live in Firebase (Auth + Firestore) under your
              own project. Cash and positions only ever change inside a single atomic transaction that also writes
              a ledger entry, so the books always balance.
            </p>
            <p>
              Any API keys you paste for stock data are kept in this browser's localStorage and never uploaded.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Before this ever touches real money</h3></div>
          <div class="pad prose">
            <ol>
              <li>Move order matching, fills and balance mutations to Cloud Functions; make client writes read-only.</li>
              <li>Add App Check, rate limiting and a licensed market-data agreement.</li>
              <li>Add KYC/AML, a regulated broker or exchange partner, and the licences your market requires.</li>
            </ol>
            <p class="muted">Until then: it's practice. Treat it that way.</p>
          </div>
        </div>
      </section>
    `;
    return {};
  },
};
