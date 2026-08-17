import type {
  DiagnosticHypothesis,
  PrecisePartRequirement,
  PrecisePartRequirementsResult,
  ResolvedProductIdentity,
} from "../product-intelligence/index.ts";
import type { PartRankingResult } from "./ranking-types.ts";
import type { PartCandidate, PartProvider, PartSearchInput } from "./types.ts";

export type PartSearchTier = 1 | 2 | 3 | 4;

export type TieredSearchThresholds = {
  minimumAcceptableCandidates: number;
  minimumAcceptableCompatibility: number;
  minimumHighCompatibility: number;
  minimumOverallScore: number;
};

export type TieredPartsSearchConfig = {
  thresholds: TieredSearchThresholds;
  searchAlternatives: boolean;
};

export type TierAttempt = {
  tier: PartSearchTier;
  queries: string[];
  providerIds: string[];
  rawCandidateCount: number;
  uniqueCandidateCount: number;
  acceptableCandidateCount: number;
  highCompatibilityCount: number;
  bestOverallScore: number | null;
  providerErrors: Array<{ providerId: string; message: string }>;
};

export type PartSearchStopReason =
  | "quality_thresholds_met"
  | "tiers_exhausted"
  | "no_queries"
  | "no_providers";

export type PartRequirementSearchResult = {
  role: "primary" | "alternative";
  requirement: PrecisePartRequirement;
  tierUsed: PartSearchTier | null;
  tiersAttempted: TierAttempt[];
  candidates: PartCandidate[];
  ranking: PartRankingResult;
  stopReason: PartSearchStopReason;
  warnings: string[];
};

export type TieredPartsSearchInput = {
  resolvedIdentity: ResolvedProductIdentity;
  diagnostics: DiagnosticHypothesis[];
  partRequirements: PrecisePartRequirementsResult;
  providerInput: PartSearchInput;
  providers: PartProvider[];
  config?: Omit<Partial<TieredPartsSearchConfig>, "thresholds"> & { thresholds?: Partial<TieredSearchThresholds> };
  now?: Date;
};

export type TieredPartsSearchResult = {
  primaryResults: PartRequirementSearchResult[];
  alternativeResults: PartRequirementSearchResult[];
  allResults: PartRequirementSearchResult[];
  warnings: string[];
};
