# @blackhull/agentkit

[![ci](https://github.com/blackhull-systems/agentkit/actions/workflows/ci.yml/badge.svg)](https://github.com/blackhull-systems/agentkit/actions/workflows/ci.yml) [![security](https://github.com/blackhull-systems/agentkit/actions/workflows/security.yml/badge.svg)](https://github.com/blackhull-systems/agentkit/actions/workflows/security.yml)

A [Coinbase AgentKit](https://github.com/coinbase/agentkit) action provider for **Blackhull**: checks your agent runs
*before* it pays or trades, sold per call over [x402](https://x402.org). Every answer is a measurement of public data
with its evidence. Facts, not financial advice.

| Action | What it answers | Price |
|---|---|---|
| `check_token` | A Base token's owner, mint / pause / blacklist / fee powers in its code (proxies resolved), upgradeability, its pools' liquidity on Uniswap v2, v3 and v4, Aerodrome and Slipstream, whether a buyer could sell it (a simulated buy and immediate sale through Uniswap's Universal Router, taxes measured) and whether real wallets are selling it, with finding codes such as `SELL_BLOCKED`, `HIGH_TAX`, `RECENT_SELLS`, `CAN_MINT`, `THIN_LIQUIDITY` | $0.01 |
| `check_tokens` | The same check for up to 10 tokens in one call, all or nothing (nothing is charged unless every token is answered) | $0.008 per token |
| `check_x402_service` | A paid x402 service's grade and finding codes (`detailed: true` for the full report with evidence) | $0.003 / $0.008 |
| `find_provider` | The best-rated paid providers for a job within a budget, ranked neutrally | $0.003 |

## Install

```bash
npm install @blackhull/agentkit
```

```ts
import { AgentKit } from "@coinbase/agentkit";
import { blackhullActionProvider } from "@blackhull/agentkit";

const agentkit = await AgentKit.from({
  walletProvider,                                   // any EVM wallet provider on base-mainnet
  actionProviders: [blackhullActionProvider()],     // add it next to your other providers
});
```

Your agent's own wallet pays, in USDC on Base. It needs a little USDC (a dollar covers 100 token checks).

## Safety

- **Price cap:** every price quote is read before anything is signed, and a quote above `maxPriceUsdc` (default
  `0.05`), or one whose price cannot be read, is refused. The cap applies to whichever client signs, including one you
  bring; the client the provider builds from your wallet also has the x402 library's own spend cap. An invalid cap
  (`NaN`, `Infinity`, zero or negative) is refused when the provider is created. To tighten it:
  `blackhullActionProvider({ maxPriceUsdc: 0.02 })`. The cap is per call, so it also caps a whole `check_tokens`
  batch: the default covers 6 tokens; `maxPriceUsdc: 0.08` covers 10.
- **No charge for no answer:** if Blackhull cannot answer (for example the chain cannot be read), it declines before the
  payment settles.
- **Try it free:** `blackhullActionProvider({ trialMode: true })` answers each action's fixed sample query at no charge.

## Payment receipts and custom signers

A paid answer includes the settlement `receipt` (transaction hash, network, payer), so your agent can keep proof of
every check it bought. To pay through a custodial or policy-controlled signer instead of the agent's wallet, pass your
own client: `blackhullActionProvider({ x402Client })`.

## Verification

`npm test` runs the provider's safety behaviour offline (trial mode, the price cap with the wallet's client and with
your own, unreadable quotes, invalid caps, no charge for no answer, receipts), with nothing paid or sent, and fails
below its coverage thresholds. CI also runs Prettier, ESLint, the TypeScript compiler and the package checks (publint,
are-the-types-wrong) on Node 22 and 24, from the committed lockfile. Every release is also verified with a **real paid
call** through this provider's code, paid by Blackhull's own test wallet to Blackhull. [VERIFICATION.md](VERIFICATION.md) records that run
and its on-chain transaction.

Built and maintained by Blackhull's AI system; every release is reviewed and signed by its owner.

## Docs

Products, prices, codes and errors: <https://blackhullsystems.com/docs> · Terms: <https://blackhull.systems/terms>

Made by [Black Hull Systems LLC](https://blackhull.systems), veteran-owned, Charleston, South Carolina. Support:
support@blackhull.systems
