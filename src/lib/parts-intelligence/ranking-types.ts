import type { PrecisePartRequirement } from "../product-intelligence/part-requirements-types.ts";
import type { PartCandidate } from "./types.ts";

export const PART_RANKING_BADGES = [
  "recommended", "best_value", "cheapest", "fastest", "safest", "oem", "highest_compatibility",
] as const;
export type PartRankingBadge = (typeof PART_RANKING_BADGES)[number];

export type PartRankingWeights = {
  compatibility: number;
  quality: number;
  landedCost: number;
  seller: number;
  delivery: number;
  warranty: number;
};

export type PartRankingThresholds = {
  minimumRecommendedScore: number;
  minimumRecommendedCompatibility: number;
  contradictionExclusionPenalty: number;
};

export type PartRankingProfile = {
  weights: PartRankingWeights;
  thresholds: PartRankingThresholds;
  neutralScores: { landedCost: number; seller: number; delivery: number; warranty: number };
};

export type RankedPartCandidate = {
  candidate: PartCandidate;
  requirementId: string;
  compatibilityScore: number;
  qualityScore: number;
  landedCost: number | null;
  landedCostScore: number;
  sellerScore: number;
  deliveryScore: number;
  warrantyScore: number;
  riskPenalty: number;
  overallScore: number;
  eligible: boolean;
  exclusionReasons: string[];
  badges: PartRankingBadge[];
  warnings: string[];
  evidence: string[];
};

export type PartRankingResult = {
  requirement: PrecisePartRequirement;
  recommended: RankedPartCandidate | null;
  bestValue: RankedPartCandidate | null;
  cheapest: RankedPartCandidate | null;
  fastest: RankedPartCandidate | null;
  safest: RankedPartCandidate | null;
  allRanked: RankedPartCandidate[];
};
