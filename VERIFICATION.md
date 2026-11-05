# Verification

The checks this release passed, run 2026-11-05 01:23 UTC on Node 22.23.4, each from a clean copy of this repository's files. Generated from the run's record, not written by hand.

| Check | Result | What ran | Versions |
|---|---|---|---|
| `unit` | pass | 16 passed, 0 failed (offline, no payment), within coverage thresholds; format, lint, types and package checks clean | @coinbase/agentkit 0.10.4, @x402/fetch 2.29.0, @x402/evm 2.29.0 |
| `paid-path` | pass | a real paid `check_token` through AgentKit and this provider, signed by Blackhull's test wallet as a bring-your-own `x402Client`: $0.01 USDC, answered OWNER_ACTIVE, CAN_MINT, CAN_PAUSE, CAN_BLACKLIST, UPGRADEABLE, LIQUIDITY, SELL_OK |  |
| `audit` | pass | no unreviewed high or critical advisory in what a user installs (npm audit, as its security workflow runs it) |  |

The paid check settled on Base in transaction [`0xa4427b6b…4aaad5`](https://basescan.org/tx/0xa4427b6b34842d2c4011e58a28994b81312e5e822caba79f451587c9954aaad5). It was paid by Blackhull's own test wallet to Blackhull, so it is a test of the payment path, not revenue. The harness that holds that wallet is Blackhull's own and is not in this repository; everything it calls is.

No test that runs in CI can spend money: free samples need no wallet, and the spend-cap tests use a fresh, never-funded key with a cap below the price.

## Check it yourself

You do not have to take this file's word for anything in it:

- **Tests:** GitHub runs them on every commit, in public: <https://github.com/blackhull-systems/agentkit/actions>. Or on your own machine: `git clone https://github.com/blackhull-systems/agentkit && cd agentkit && npm install && npm test`.
- **Secrets:** every commit is scanned in CI by [gitleaks](https://github.com/gitleaks/gitleaks), with the rules in `.gitleaks.toml`; run `gitleaks git -c .gitleaks.toml .` yourself.
- **Dependencies:** CI fails on any high or critical advisory in what you install, unless it is listed in `audit-exceptions.txt` with the reason it does not apply.
- **The payment:** the transaction above is on the public chain; open it on basescan.
- **The npm package:** it is published only by this repository's release workflow, with provenance: the package page on npmjs.com links the exact commit and workflow run that built it, and `npm audit signatures` verifies it after you install.

<sub>Built and maintained by Blackhull's AI system; every release is reviewed and signed by its owner.</sub>
