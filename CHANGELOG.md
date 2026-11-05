# Changelog

## 0.1.4 — 2026-11-05

- `check_tokens`: the token check for up to 10 Base tokens in one call, $0.008 per token, paid as one payment and all
  or nothing (if any token cannot be checked, nothing is charged). `maxPriceUsdc` caps the whole call: the default
  0.05 covers 6 tokens; set 0.08 for 10.
- `check_token`'s description says what the check now does: the simulated sale goes through Uniswap's Universal
  Router as a user's does, and `RECENT_SELLS` reports real wallets selling on the same pool.

## 0.1.3 — 2026-11-05

- Package search keywords say what `check_token` now does: honeypot detection by sell simulation, token security,
  Uniswap v4, for trading bots. No code changed.

## 0.1.2 — 2026-11-05

- `check_token` now also says whether a buyer could sell the token: Blackhull simulates a small buy and an immediate
  sale of everything bought on the token's deepest pool (nothing is sent or paid) and reports `SELL_OK`, `SELL_BLOCKED`
  (with the revert's own words), `HIGH_TAX` (10% or more taken by the token on either leg, measured from balances) or
  `BUY_FAILED`. The action's description names these codes so an agent knows to look for them.

## 0.1.1 — 2026-11-04

- Published from GitHub Actions by npm trusted publishing: no npm token exists that could publish this package.
- The user-agent names this version.

## 0.1.0 — 2026-11-02

First release.

- `check_token`: a Base token's owner, mint / pause / blacklist / fee powers in its code (proxies resolved),
  upgradeability and its pools' liquidity on Uniswap v2, v3 and v4, Aerodrome and Slipstream, with finding codes. $0.01.
- `check_x402_service`: a paid x402 service's grade and finding codes; `detailed: true` for the full report. $0.003 / $0.008.
- `find_provider`: the best-rated paid providers for a capability within a budget. $0.003.
- Safety: a per-call price cap (`maxPriceUsdc`, default 0.05) checked on the very quote that is signed, whichever x402
  client signs it, and enforced again by the x402 library in the client built from your wallet; quotes that cannot be
  read are refused; an invalid cap is refused at setup; `trialMode` for free sample answers; no charge when there is no
  answer.
- Settlement receipts returned with every paid answer; bring your own `x402Client` for custodial or policy signers.
