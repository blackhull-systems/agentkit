# Changelog

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
