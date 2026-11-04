// Offline tests of the provider's safety behaviour: a stubbed fetch stands in for the API, so nothing is paid or sent.
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const { x402Client } = require("@x402/fetch");
const { registerExactEvmScheme } = require("@x402/evm/exact/client");
const { BlackhullActionProvider, blackhullActionProvider } = require("../dist/index.js");
const { quotedAtomic, walletSigner } = require("../dist/blackhullActionProvider.js");
const { VERSION } = require("../dist/version.js");

const USDC = "0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913";
const TOKEN = "0x4200000000000000000000000000000000000006";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const option = (amount, over = {}) => ({
  scheme: "exact",
  network: "eip155:8453",
  amount: String(amount),
  asset: USDC,
  payTo: "0x1c0B8053c3Ba5b2FF6079c8437F0Aa72d2be0B9e",
  maxTimeoutSeconds: 60,
  extra: { name: "USD Coin", version: "2" },
  ...over,
});
const header = (accepts) =>
  Buffer.from(
    JSON.stringify({ x402Version: 2, resource: { url: "https://blackhullsystems.com/check/token" }, accepts }),
  ).toString("base64");
/** A 402 quote for `amount` atomic USDC (or for the given payment options). */
const quote = (amount, accepts = [option(amount)]) =>
  new Response("{}", { status: 402, headers: { "payment-required": header(accepts) } });
const ok = (body, headers = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers });

/** Replace fetch with a script of responses; record every request. */
function stub(...responses) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const req = new Request(input, init);
    calls.push({
      url: new URL(req.url),
      ua: req.headers.get("user-agent"),
      paid: req.headers.has("payment-signature") || req.headers.has("x-payment"),
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request " + req.url);
    return typeof next === "function" ? next() : next;
  };
  return calls;
}

const wallet = { toSigner: () => privateKeyToAccount(generatePrivateKey()), readContract: async () => 0n };
const check = async (provider) => JSON.parse(await provider.checkToken(wallet, { address: TOKEN }));

test("trial mode asks for the free sample and sends no payment", async () => {
  const calls = stub(ok({ codes: ["CAN_MINT"] }));
  const out = await check(blackhullActionProvider({ trialMode: true }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("sample"), "1");
  assert.equal(calls[0].paid, false);
  assert.deepEqual(out, { trial: true, result: { codes: ["CAN_MINT"] } });
});

test("a paid answer carries its price and settlement receipt", async () => {
  const receipt = { success: true, transaction: "0xabc", network: "eip155:8453", payer: "0x1" };
  const settled = Buffer.from(JSON.stringify(receipt)).toString("base64");
  const calls = stub(quote(10000), ok({ codes: ["LIQUIDITY"] }, { "payment-response": settled }));
  const out = await check(blackhullActionProvider());
  assert.deepEqual(
    calls.map((c) => c.paid),
    [false, true],
  );
  assert.deepEqual(out, { price_usdc: 0.01, receipt, result: { codes: ["LIQUIDITY"] } });
});

test("a quote above maxPriceUsdc is refused without paying", async () => {
  const calls = stub(quote(30000));
  const out = await check(blackhullActionProvider({ maxPriceUsdc: 0.02 }));
  assert.equal(out.error, true);
  assert.match(out.message, /price 0\.03 USDC is above maxPriceUsdc 0\.02; not paid/);
  assert.deepEqual(
    calls.map((c) => c.paid),
    [false],
  );
});

test("the cap holds for a client you bring, even one with no spend limit of its own", async () => {
  const own = new x402Client(); // no spend controls: it would sign any amount
  registerExactEvmScheme(own, { signer: privateKeyToAccount(generatePrivateKey()) });
  const calls = stub(quote(60000));
  const out = await check(blackhullActionProvider({ x402Client: own }));
  assert.match(out.message, /price 0\.06 USDC is above maxPriceUsdc 0\.05; not paid/);
  assert.equal(
    calls.some((c) => c.paid),
    false,
  );
});

test("the cap is checked against the most expensive option a quote offers", async () => {
  const calls = stub(quote(0, [option(10000), option(90000)]));
  const out = await check(blackhullActionProvider());
  assert.match(out.message, /price 0\.09 USDC is above maxPriceUsdc 0\.05/);
  assert.equal(
    calls.some((c) => c.paid),
    false,
  );
});

test("a quote whose price cannot be read is never paid", async () => {
  for (const accepts of [
    [option("ten")],
    [option("1e4")],
    [option(10000, { asset: "0x0000000000000000000000000000000000000001" })],
    [option(10000, { network: "eip155:1" })],
    [],
  ]) {
    const calls = stub(quote(0, accepts));
    const out = await check(blackhullActionProvider());
    assert.match(out.message, /price unreadable or not in USDC on Base; not paid/, JSON.stringify(accepts));
    assert.equal(
      calls.some((c) => c.paid),
      false,
    );
  }
});

test("an invalid maxPriceUsdc is refused when the provider is created", () => {
  for (const bad of [NaN, Infinity, -1, 0, 1e-7, "0.02"]) {
    assert.throws(() => blackhullActionProvider({ maxPriceUsdc: bad }), RangeError, String(bad));
  }
  assert.doesNotThrow(() => blackhullActionProvider({ maxPriceUsdc: 0.000001 }));
  assert.doesNotThrow(() => blackhullActionProvider({ maxPriceUsdc: undefined })); // the default, 0.05
});

test("no answer for a query is passed back as an error, never paid", async () => {
  const calls = stub(new Response(JSON.stringify({ error: "not a contract" }), { status: 404 }));
  const out = await check(blackhullActionProvider());
  assert.deepEqual(out, { error: true, status: 404, body: { error: "not a contract" } });
  assert.deepEqual(
    calls.map((c) => c.paid),
    [false],
  );
});

test("a body that is not JSON is passed back as text", async () => {
  stub(new Response("upstream timeout", { status: 503 }));
  assert.deepEqual(await check(blackhullActionProvider()), { error: true, status: 503, body: "upstream timeout" });
});

test("a network failure is a JSON error, never a throw, in trial mode too", async () => {
  for (const config of [{}, { trialMode: true }]) {
    stub(() => {
      throw new TypeError("fetch failed");
    });
    assert.deepEqual(await check(blackhullActionProvider(config)), { error: true, message: "fetch failed" });
  }
});

test("a receipt header that does not parse is left out, not fatal", async () => {
  stub(quote(10000), ok({ codes: [] }, { "payment-response": "not base64 json" }));
  assert.deepEqual(await check(blackhullActionProvider()), { price_usdc: 0.01, result: { codes: [] } });
});

test("the wallet signer is the wallet's account and reads the chain through the wallet provider", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const reads = [];
  const signer = walletSigner({ toSigner: () => account, readContract: async (a) => (reads.push(a), 7n) });
  assert.equal(signer.address, account.address);
  const args = { address: USDC, abi: [], functionName: "nonces", args: [account.address] };
  assert.equal(await signer.readContract(args), 7n);
  assert.deepEqual(reads, [args]);
});

test("each action calls its own route with the caller's query", async () => {
  const p = new BlackhullActionProvider({ baseUrl: "https://api.test/" });
  const urls = [];
  for (const [action, args] of [
    ["checkService", { url: "https://x.test/a" }],
    ["checkService", { url: "https://x.test/a", detailed: true }],
    ["findProvider", { capability: "search", maxPriceUsdc: 0.01 }],
    ["findProvider", { capability: "search" }],
  ]) {
    const calls = stub(new Response("{}", { status: 404 }));
    await p[action](wallet, args);
    urls.push(calls[0].url.href);
  }
  assert.deepEqual(urls, [
    "https://api.test/flags?url=https%3A%2F%2Fx.test%2Fa",
    "https://api.test/verdict/x402?url=https%3A%2F%2Fx.test%2Fa",
    "https://api.test/route?capability=search&max_price=0.01",
    "https://api.test/route?capability=search",
  ]);
});

test("quotedAtomic reads the v2 header and returns null for anything else", () => {
  assert.equal(quotedAtomic(quote(10000)), 10000);
  assert.equal(
    quotedAtomic(new Response("{}", { status: 402, headers: { "payment-required": "not base64 json" } })),
    null,
  );
  assert.equal(quotedAtomic(new Response("{}", { status: 402 })), null);
});

test("the user-agent names this package's version", async () => {
  assert.equal(VERSION, require("../package.json").version);
  const calls = stub(new Response("{}", { status: 404 }));
  await check(blackhullActionProvider());
  assert.equal(calls[0].ua, `blackhull-agentkit/${VERSION}`);
});

test("only Base mainnet is supported", () => {
  const p = blackhullActionProvider();
  assert.equal(p.supportsNetwork({ networkId: "base-mainnet", protocolFamily: "evm" }), true);
  assert.equal(p.supportsNetwork({ networkId: "base-sepolia", protocolFamily: "evm" }), false);
});
