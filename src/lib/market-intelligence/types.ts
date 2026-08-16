import type { MarketEstimate } from "../deal-economics/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import type { ProductCategory } from "../product-analysis/types.ts";

export type ProductIdentity = {
  category: ProductCategory;
  brand: string | null;
  model: string | null;
  reference: string | null;
  originalTitle: string;
  productConfidence?: number | null;
};

export type QueryStrategy =
  | "brand_model_reference"
  | "brand_model"
  | "implicit_brand_model"
  | "model"
  | "clean_title";

export type ComparableMatch = {
  listing: LeboncoinListing;
  matchScore: number;
  accepted: boolean;
  reasons: string[];
  rejectionReason: string | null;
};

export type MarketEstimateStatus =
  | "success"
  | "identity_too_vague"
  | "insufficient_comparables"
  | "prices_too_dispersed";

export type MarketEstimateResult = {
  status: MarketEstimateStatus;
  message: string;
  query: string | null;
  queryStrategy: QueryStrategy | null;
  estimate: MarketEstimate;
  rejectedCount: number;
};

export type MarketEstimateRequest = ProductIdentity & { limit?: number };

export type MarketSearchPlan = {
  query: string;
  strategy: QueryStrategy;
  identityPrecision: number;
};

export type MarketStatistics = {
  prices: number[];
  lowPrice: number;
  medianPrice: number;
  highPrice: number;
  iqr: number;
  relativeDispersion: number;
};

export type MarketIntelligenceOptions = {
  matchThreshold?: number;
  minimumComparables?: number;
  maximumRelativeDispersion?: number;
  retrievedAt?: string;
};
