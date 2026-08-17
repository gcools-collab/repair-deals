import type { MarketEstimate } from "../deal-economics/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import type { ResolvedProductIdentity } from "../product-intelligence/types.ts";

export type MarketQueryTier = { tier: 1 | 2 | 3 | 4 | 5; query: string; requiredIdentityFields: string[]; confidence: number; rationale: string };
export type MarketComparableV2 = { listing: LeboncoinListing; similarityScore: number; identityMatches: string[]; identityConflicts: string[]; conditionSignals: string[]; excluded: boolean; exclusionReasons: string[] };
export type MarketTierAttempt = { tier: MarketQueryTier["tier"]; query: string; rawCount: number; validCount: number; averageSimilarity: number; strongCount: number; stopReason: string | null };
export type MarketEstimateV2Status = "success" | "insufficient_comparables" | "prices_too_dispersed" | "identity_too_vague" | "provider_error";
export type MarketEstimateV2 = {
  status: MarketEstimateV2Status; lowPrice: number | null; medianPrice: number | null; highPrice: number | null; weightedMedian: number | null;
  sampleSize: number; effectiveSampleSize: number; confidence: number; tierUsed: MarketQueryTier["tier"] | null; tiersAttempted: MarketTierAttempt[];
  comparables: MarketComparableV2[]; excludedComparables: MarketComparableV2[]; retrievedAt: string; source: string; warnings: string[];
};
export interface MarketComparableProvider { readonly id: string; readonly name: string; search(query: string, limit: number): Promise<LeboncoinListing[]> }
export type MarketV2Thresholds = { minimumComparables: number; minimumAverageSimilarity: number; minimumStrongComparables: number; strongSimilarity: number; acceptanceSimilarity: number; maximumRelativeDispersion: number; minimumReadyConfidence: number };
export type MarketEstimateV2Request = { identity: ResolvedProductIdentity; limit?: number; thresholds?: Partial<MarketV2Thresholds> };

export type MarketEstimateV2Adapter = { estimate: MarketEstimate; marketReady: boolean };
export type MarketEstimateV2Response = { identity: ResolvedProductIdentity; estimate: MarketEstimateV2 };
