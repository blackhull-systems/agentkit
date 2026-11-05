/**
 * Blackhull Action Provider for Coinbase AgentKit.
 *
 * Checks an agent should run BEFORE it pays or trades, sold per call over x402 by Blackhull (https://blackhull.systems):
 *   - check_token          a Base token's owner, admin powers, upgradeability, liquidity, and whether a buyer could sell ($0.01)
 *   - check_tokens         the same check for up to 10 tokens in one call ($0.008 per token)
 *   - check_x402_service   grade and finding codes (or the full findings report) for a paid x402 service ($0.003-$0.008)
 *   - find_provider        the best-rated paid providers for a job within a budget ($0.003)
 * Every answer is a measurement of public data with its evidence. Facts, not financial advice.
 *
 * The agent's own wallet pays (or a client you bring). Every price quote is read before anything is signed, and any
 * quote above maxPriceUsdc, or one that cannot be read, is refused.
 */
import { z } from "zod";
import { ActionProvider, CreateAction, EvmWalletProvider, Network } from "@coinbase/agentkit";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import type { ClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { VERSION } from "./version";

export interface BlackhullConfig {
  /** Most the provider will ever pay for one call, in USDC: a finite number of at least 0.000001 (default 0.05). */
  maxPriceUsdc?: number;
  /** Free trial: answer each action's fixed sample query (?sample=1) instead of paying. */
  trialMode?: boolean;
  /** Override the API origin (tests). */
  baseUrl?: string;
  /** Bring your own x402 payment client (e.g. a custodial or policy-controlled signer). Default: one built from the
   *  agent's wallet provider, as AgentKit's own x402 provider builds it. The price cap applies to either. */
  x402Client?: x402Client;
}

const UA = `blackhull-agentkit/${VERSION}`;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** The only asset and network Blackhull is paid in: USDC on Base. */
const USDC_BASE = { network: "eip155:8453", asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" };

export const CheckTokenSchema = z
  .object({ address: z.string().regex(ADDRESS).describe("The token contract address on Base (0x + 40 hex)") })
  .strip();
export const CheckTokensSchema = z
  .object({
    addresses: z
      .array(z.string().regex(ADDRESS))
      .min(1)
      .max(10)
      .describe("1 to 10 token contract addresses on Base (0x + 40 hex each)"),
  })
  .strip();
export const CheckServiceSchema = z
  .object({
    url: z.string().url().describe("The x402 resource URL of the paid service to check"),
    detailed: z
      .boolean()
      .optional()
      .describe("Full findings report with evidence ($0.008) instead of grade and codes ($0.003)"),
  })
  .strip();
export const FindProviderSchema = z
  .object({
    capability: z.string().min(1).describe("A category, e.g. search, ai-analysis, llm-inference, web-data, onchain"),
    maxPriceUsdc: z
      .number()
      .positive()
      .optional()
      .describe("The most your agent will pay that provider per call, USDC"),
  })
  .strip();

/** Atomic USDC (6 decimals) as a plain decimal string, e.g. 10000 -> "0.01". */
const usdc = (atomic: number): string => (atomic / 1e6).toString();

/** Thrown inside the payment path when a quote is refused, so nothing is signed; reported as a JSON error. */
class NotPaid extends Error {}

export class BlackhullActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly base: string;
  private readonly maxAtomic: number;
  private readonly trial: boolean;
  private readonly client?: x402Client;

  constructor(config: BlackhullConfig = {}) {
    super("blackhull", []);
    const max = config.maxPriceUsdc ?? 0.05;
    // floor, so the cap is never above what was asked; NaN, Infinity or a cap that rounds to 0 is a setup error
    const atomic = Math.floor(max * 1e6);
    if (typeof max !== "number" || !Number.isFinite(max) || atomic < 1) {
      throw new RangeError(`maxPriceUsdc must be a finite number of at least 0.000001 USDC, got ${String(max)}`);
    }
    this.base = new URL(config.baseUrl ?? "https://blackhullsystems.com").href.replace(/\/+$/, "");
    this.maxAtomic = atomic;
    this.trial = Boolean(config.trialMode);
    this.client = config.x402Client;
  }

  @CreateAction({
    name: "check_token",
    description: `Check a token on Base before trading it. Returns measured facts read live from the chain, each with its evidence:
who controls the contract (owner), whether its code can mint, pause, blacklist or change fees, whether it is an upgradeable
proxy, how much WETH, ETH or USDC its pools hold on Uniswap v2, v3 and v4, Aerodrome and Slipstream, and whether a
buyer could sell: a small buy and an immediate sale are simulated on the deepest pool, the sale sent through Uniswap's
Universal Router as a user's goes (nothing is sent or paid), with the buy and sell tax measured, and how many real
sales that pool has seen recently. Finding codes include SELL_BLOCKED (bought but could not sell), HIGH_TAX (10% or
more taken on a buy or sale), SELL_OK, RECENT_SELLS (real wallets sold in the last minutes or hours), OWNER_ACTIVE,
CAN_MINT, UPGRADEABLE, THIN_LIQUIDITY and NO_POOL_FOUND. Costs $0.01 USDC per call via x402 (paid from this wallet).
Facts, not financial advice.`,
    schema: CheckTokenSchema,
  })
  async checkToken(walletProvider: EvmWalletProvider, args: z.infer<typeof CheckTokenSchema>): Promise<string> {
    return this.call(walletProvider, "/check/token", { address: args.address });
  }

  @CreateAction({
    name: "check_tokens",
    description: `The check_token check for up to 10 Base tokens in one call, e.g. every candidate on a watchlist before
choosing which to trade. Returns one answer per token, in the order given, each with the same facts, evidence and finding
codes as check_token (SELL_BLOCKED, HIGH_TAX, SELL_OK, RECENT_SELLS, ...). Costs $0.008 USDC per token via x402, paid as
one payment; all or nothing: if any token cannot be checked, the call is not charged. The provider's maxPriceUsdc caps
the whole call (the default 0.05 covers 6 tokens; set 0.08 for 10).`,
    schema: CheckTokensSchema,
  })
  async checkTokens(walletProvider: EvmWalletProvider, args: z.infer<typeof CheckTokensSchema>): Promise<string> {
    return this.call(walletProvider, "/check/tokens", { addresses: args.addresses.join(",") });
  }

  @CreateAction({
    name: "check_x402_service",
    description: `Check a paid x402 service before your agent pays it: Blackhull's grade (CLEAN / CAUTION / WARNING /
INSUFFICIENT_DATA) and coded findings measured from on-chain payments — e.g. whether it is actually paid at its listed
price, by how many independent buyers, whether its demand is concentrated or self-funded. $0.003 for grade and codes,
$0.008 for the full report with evidence (detailed: true). Facts, not advice.`,
    schema: CheckServiceSchema,
  })
  async checkService(walletProvider: EvmWalletProvider, args: z.infer<typeof CheckServiceSchema>): Promise<string> {
    return this.call(walletProvider, args.detailed ? "/verdict/x402" : "/flags", { url: args.url });
  }

  @CreateAction({
    name: "find_provider",
    description: `Find the best-rated paid x402 providers for a job within a budget, ranked neutrally by grade, then
chain-verified buyers, then price (WARNING-graded providers excluded). $0.003 per call via x402.`,
    schema: FindProviderSchema,
  })
  async findProvider(walletProvider: EvmWalletProvider, args: z.infer<typeof FindProviderSchema>): Promise<string> {
    const q: Record<string, string> = { capability: args.capability };
    if (args.maxPriceUsdc !== undefined) q.max_price = String(args.maxPriceUsdc);
    return this.call(walletProvider, "/route", q);
  }

  supportsNetwork = (network: Network) => network.networkId === "base-mainnet";

  /** One check: quote, refuse above the cap, pay, return the answer (or a JSON error, never a throw). */
  async call(walletProvider: EvmWalletProvider, path: string, query: Record<string, string>): Promise<string> {
    const url = new URL(this.base + path);
    const headers = { "user-agent": UA };
    try {
      if (this.trial) {
        url.searchParams.set("sample", "1");
        return await this.answer(await fetch(url, { headers }), { trial: true });
      }
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      let paidAtomic: number | undefined;
      // The payment wrapper asks for the quote through this fetch and signs only what it returns, so the cap is
      // checked on the very quote that gets signed, whichever x402 client signs it.
      const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const res = await fetch(input, init);
        if (res.status === 402) {
          const amount = quotedAtomic(res);
          if (amount === null) throw new NotPaid("price unreadable or not in USDC on Base; not paid");
          if (amount > this.maxAtomic) {
            throw new NotPaid(`price ${usdc(amount)} USDC is above maxPriceUsdc ${usdc(this.maxAtomic)}; not paid`);
          }
          paidAtomic = amount;
        }
        return res;
      };
      const pay = wrapFetchWithPayment(guarded, this.client ?? this.walletClient(walletProvider));
      const res = await pay(url.toString(), { headers });
      // 404 and other non-402 answers are never charged
      return await this.answer(res, paidAtomic !== undefined && res.ok ? { price_usdc: paidAtomic / 1e6 } : {});
    } catch (e) {
      return JSON.stringify({ error: true, message: e instanceof Error ? e.message : String(e) });
    }
  }

  private walletClient(walletProvider: EvmWalletProvider): x402Client {
    // a second, independent cap: the x402 library refuses to sign above it too
    const client = new x402Client().setSpendControls({ maxAmountPerPayment: `$${usdc(this.maxAtomic)}` });
    registerExactEvmScheme(client, { signer: walletSigner(walletProvider) });
    return client;
  }

  private async answer(res: Response, extra: Record<string, unknown>): Promise<string> {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON: keep the text
    }
    if (!res.ok) return JSON.stringify({ error: true, status: res.status, ...extra, body });
    // the settlement receipt (transaction hash, network, payer), when a payment was made
    const r = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
    let receipt: unknown;
    try {
      receipt = r ? JSON.parse(Buffer.from(r, "base64").toString("utf8")) : undefined;
    } catch {
      receipt = undefined;
    }
    return JSON.stringify({ ...extra, ...(receipt ? { receipt } : {}), result: body });
  }
}

/**
 * The most an x402 v2 quote (its PAYMENT-REQUIRED header) can charge, in atomic USDC, taken over every payment option
 * it offers, since the signing client picks the option. null when there is no header, it does not parse, or any option
 * is not an integer amount of USDC on Base: a quote that cannot be read is never paid.
 */
export function quotedAtomic(quote: Response): number | null {
  const h = quote.headers.get("payment-required");
  if (!h) return null;
  let accepts: unknown;
  try {
    accepts = (JSON.parse(Buffer.from(h, "base64").toString("utf8")) as { accepts?: unknown }).accepts;
  } catch {
    return null;
  }
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  let most = 0;
  for (const a of accepts as { network?: unknown; asset?: unknown; amount?: unknown }[]) {
    const usdc = a.network === USDC_BASE.network && String(a.asset).toLowerCase() === USDC_BASE.asset;
    if (!usdc || typeof a.amount !== "string" || !/^\d{1,15}$/.test(a.amount)) return null;
    most = Math.max(most, Number(a.amount));
  }
  return most;
}

/** The x402 signer for an AgentKit wallet: the wallet's own account, reading the chain through the wallet provider. */
export function walletSigner(walletProvider: EvmWalletProvider): ClientEvmSigner {
  return {
    ...walletProvider.toSigner(),
    readContract: (a) =>
      walletProvider.readContract({
        address: a.address,
        abi: a.abi as never,
        functionName: a.functionName,
        args: a.args as never,
      }),
  };
}

export const blackhullActionProvider = (config?: BlackhullConfig) => new BlackhullActionProvider(config);
