import { scanLeboncoin, ScannerRequestError } from "../leboncoin-scanner.ts";
import { buildMarketSearchPlan, estimateMarketFromListings } from "./index.ts";
import type { MarketEstimateRequest, MarketEstimateResult } from "./types.ts";

export { ScannerRequestError as MarketProviderError };

export async function estimateMarketWithLeboncoin(
  request: MarketEstimateRequest,
): Promise<MarketEstimateResult> {
  const plan = buildMarketSearchPlan(request);
  const retrievedAt = new Date().toISOString();
  if (!plan) return estimateMarketFromListings(request, [], { retrievedAt });

  const listings = await scanLeboncoin({
    query: plan.query,
    limit: request.limit ?? 35,
    broken_only: false,
  });
  return estimateMarketFromListings(request, listings, { retrievedAt });
}
