import assert from "node:assert/strict";
import test from "node:test";
import { EbayApiError, EbayBrowseClient } from "./providers/ebay-client.ts";
import { classifyEbayQuality, EbayPartsProvider } from "./providers/ebay.ts";
import type { PartSearchInput } from "./types.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function token(value = "token", expiresIn = 7200) {
  return json({ access_token: value, expires_in: expiresIn, token_type: "Application Access Token" });
}

const ps5Input: PartSearchInput = {
  category: "console",
  brand: "Sony",
  model: "PS5",
  reference: null,
  detectedFaults: ["hdmi_issue"],
  currency: "EUR",
};

const iphoneInput: PartSearchInput = {
  category: "smartphone",
  brand: "Apple",
  model: "iPhone 13",
  reference: null,
  detectedFaults: ["broken_screen"],
  currency: "EUR",
};

function item(itemId: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    itemId,
    title,
    price: { value: "20", currency: "EUR" },
    itemWebUrl: "https://www.ebay.fr/itm/" + itemId,
    shippingOptions: [{ shippingCost: { value: "4.50", currency: "EUR" } }],
    condition: "New",
    seller: { username: "parts-shop" },
    buyingOptions: ["FIXED_PRICE"],
    itemLocation: { country: "FR", postalCode: "75001" },
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }],
    ...overrides,
  };
}

function clientWith(fetcher: typeof fetch, now?: () => number) {
  return new EbayBrowseClient({
    clientId: "test-client",
    clientSecret: "test-secret",
    environment: "sandbox",
    timeoutMs: 20,
  }, { fetch: fetcher, now });
}

test("OAuth retrieves and caches an application token", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return token();
  });
  assert.equal(await client.getApplicationToken(), "token");
  assert.equal(await client.getApplicationToken(), "token");
  assert.equal(calls, 1);
});

test("OAuth renews a token near expiration", async () => {
  let now = 0;
  let calls = 0;
  const client = clientWith(async () => token("token-" + ++calls, 120), () => now);
  assert.equal(await client.getApplicationToken(), "token-1");
  now = 61_000;
  assert.equal(await client.getApplicationToken(), "token-2");
  assert.equal(calls, 2);
});

test("PS5 HDMI keeps the socket and excludes cable and repair service", async () => {
  let searchCalls = 0;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).includes("/oauth2/token")) return token();
    searchCalls += 1;
    return json({ itemSummaries: [
      item("socket", "HDMI Port Socket Connector for Sony PS5"),
      item("cable", "Sony PS5 HDMI Cable 2m"),
      item("service", "PS5 HDMI Repair Service"),
    ] });
  };
  const provider = new EbayPartsProvider(clientWith(fetcher));
  const results = await provider.search(ps5Input, ["PS5 HDMI port", "PS5 HDMI port"]);
  assert.deepEqual(results.map((candidate) => candidate.providerItemId), ["socket"]);
  assert.equal(results[0].partType, "hdmi_port");
  assert.equal(searchCalls, 1);
});

test("iPhone 13 screen keeps a screen and excludes a case and iPhone 13 Pro", async () => {
  const fetcher: typeof fetch = async (url) => String(url).includes("/oauth2/token") ? token() : json({
    itemSummaries: [
      item("screen", "Replacement OLED Screen Display for Apple iPhone 13"),
      item("case", "Protective Case Cover for Apple iPhone 13"),
      item("pro", "OLED Screen for Apple iPhone 13 Pro"),
    ],
  });
  const results = await new EbayPartsProvider(clientWith(fetcher)).search(iphoneInput, ["iPhone 13 screen"]);
  assert.deepEqual(results.map((candidate) => candidate.providerItemId), ["screen"]);
  assert.equal(results[0].isCompatible, true);
});

test("quality classification is prudent and explained", () => {
  assert.equal(classifyEbayQuality("Genuine OEM display", "New").quality, "original_oem");
  assert.equal(classifyEbayQuality("Compatible replacement display", "New").quality, "compatible");
  assert.equal(classifyEbayQuality("Refurbished display", "Used").quality, "refurbished");
  assert.equal(classifyEbayQuality("Display part", "New").quality, "unknown");
  assert.match(classifyEbayQuality("OEM display", null).evidence, /sans authentification/);
});

test("known shipping produces a total and unknown shipping keeps total unknown", async () => {
  const fetcher: typeof fetch = async (url) => String(url).includes("/oauth2/token") ? token() : json({
    itemSummaries: [
      item("known", "HDMI Port Socket Connector for Sony PS5"),
      item("unknown", "HDMI Port Connector for Sony PS5", { shippingOptions: undefined }),
    ],
  });
  const results = await new EbayPartsProvider(clientWith(fetcher)).search(ps5Input, ["PS5 HDMI port"]);
  assert.equal(results.find((candidate) => candidate.providerItemId === "known")?.totalPrice, 24.5);
  assert.equal(results.find((candidate) => candidate.providerItemId === "unknown")?.shippingCost, null);
  assert.equal(results.find((candidate) => candidate.providerItemId === "unknown")?.totalPrice, null);
});

test("USD remains in its original currency without conversion", async () => {
  const fetcher: typeof fetch = async (url) => String(url).includes("/oauth2/token") ? token() : json({
    itemSummaries: [item("usd", "HDMI Port Socket Connector for Sony PS5", {
      price: { value: "18", currency: "USD" },
      shippingOptions: [{ shippingCost: { value: "3", currency: "USD" } }],
    })],
  });
  const [candidate] = await new EbayPartsProvider(clientWith(fetcher)).search(ps5Input, ["PS5 HDMI port"]);
  assert.equal(candidate.currency, "USD");
  assert.equal(candidate.unitPrice, 18);
  assert.equal(candidate.totalPrice, 21);
});

test("provider response cache avoids immediate duplicate Browse searches", async () => {
  let searchCalls = 0;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).includes("/oauth2/token")) return token();
    searchCalls += 1;
    return json({ itemSummaries: [item("cached", "HDMI Port Socket Connector for Sony PS5")] });
  };
  const provider = new EbayPartsProvider(clientWith(fetcher));
  await provider.search(ps5Input, ["PS5 HDMI port"]);
  await provider.search(ps5Input, ["PS5 HDMI port"]);
  assert.equal(searchCalls, 1);
});

test("401 refreshes the token once", async () => {
  let tokenCalls = 0;
  let searchCalls = 0;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).includes("/oauth2/token")) return token("token-" + ++tokenCalls);
    searchCalls += 1;
    return searchCalls === 1 ? json({}, 401) : json({ itemSummaries: [] });
  };
  await clientWith(fetcher).search("PS5 HDMI port");
  assert.equal(tokenCalls, 2);
  assert.equal(searchCalls, 2);
});

test("429 and timeout expose safe provider errors", async () => {
  const limited: typeof fetch = async (url) => String(url).includes("/oauth2/token") ? token() : json({}, 429);
  await assert.rejects(() => clientWith(limited).search("part"), (error: unknown) =>
    error instanceof EbayApiError && error.code === "rate_limit" && error.status === 429
  );

  const timeout: typeof fetch = async (url) => {
    if (String(url).includes("/oauth2/token")) return token();
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };
  await assert.rejects(() => clientWith(timeout).search("part"), (error: unknown) =>
    error instanceof EbayApiError && error.code === "timeout"
  );
});
