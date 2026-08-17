import assert from "node:assert/strict";
import test from "node:test";
import { scanLeboncoin, ScannerRequestError } from "./leboncoin-scanner.ts";

const criteria = { query: "PS5 HDMI", limit: 3, broken_only: true };
async function withFetch(response: Response | Error, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch, originalKey = process.env.LEBONCOIN_BRIDGE_API_KEY;
  process.env.LEBONCOIN_BRIDGE_API_KEY = "test-only-key";
  globalThis.fetch = async () => { if (response instanceof Error) throw response; return response; };
  try { await run(); } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.LEBONCOIN_BRIDGE_API_KEY; else process.env.LEBONCOIN_BRIDGE_API_KEY = originalKey; }
}

for (const [name, response, code] of [
  ["DataDome", new Response(JSON.stringify({ error: { code: "provider_datadome", message: "Leboncoin search failed" } }), { status: 502 }), "provider_datadome"],
  ["rate limit", new Response(JSON.stringify({ error: { code: "provider_rate_limited", message: "Leboncoin search failed" } }), { status: 429 }), "provider_rate_limited"],
  ["bridge auth", new Response(JSON.stringify({ error: { code: "request_error", message: "Unauthorized" } }), { status: 401 }), "bridge_auth_error"],
  ["HTTP failure", new Response(JSON.stringify({ error: { code: "provider_http_error", message: "Leboncoin search failed" } }), { status: 502 }), "provider_http_error"],
] as const) test(`bridge response classifies ${name}`, { concurrency: false }, async () => withFetch(response, async () => { await assert.rejects(scanLeboncoin(criteria), (error: unknown) => error instanceof ScannerRequestError && error.code === code && error.upstreamStatus === response.status); }));

test("network failure is a bridge_unavailable error", { concurrency: false }, async () => withFetch(new Error("ECONNREFUSED"), async () => { await assert.rejects(scanLeboncoin(criteria), (error: unknown) => error instanceof ScannerRequestError && error.code === "bridge_unavailable"); }));
