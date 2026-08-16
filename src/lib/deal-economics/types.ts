export type EstimateConfidence = number | null;

export type EstimateSource = {
  kind: "manual" | "provider" | "derived";
  name: string;
  url?: string | null;
  collectedAt?: string | null;
  retrievedAt?: string | null;
};

export type ComparableItem = {
  id?: string | null;
  title: string;
  price: number | null;
  url?: string | null;
  observedAt?: string | null;
  matchScore?: number | null;
};

export type MarketEstimate = {
  lowPrice: number | null;
  medianPrice: number | null;
  highPrice: number | null;
  confidence: EstimateConfidence;
  sampleSize: number | null;
  source: EstimateSource | null;
  comparableItems: ComparableItem[];
};

export type ProbablePart = {
  name: string;
  reference: string | null;
  quantity: number;
  unitPriceLow: number | null;
  unitPriceHigh: number | null;
  source: EstimateSource | null;
};

export type RepairDifficulty = "easy" | "moderate" | "hard" | "expert" | null;

export type RepairEstimate = {
  probableParts: ProbablePart[];
  partsCostLow: number | null;
  partsCostHigh: number | null;
  estimatedMinutesLow: number | null;
  estimatedMinutesHigh: number | null;
  difficulty: RepairDifficulty;
  hiddenFaultRisk: number | null;
  confidence: EstimateConfidence;
  source: EstimateSource | null;
};

export type FinancialReadiness = "incomplete" | "estimable" | "ready";

export type FinancialAnalysisInput = {
  purchasePrice: number | null;
  marketEstimate: MarketEstimate;
  repairEstimate: RepairEstimate;
  extraCosts: number | null;
  /** Fixed reserve in euros. No reserve is added when omitted. */
  safetyMargin?: number | null;
};

export type FinancialAnalysis = {
  estimatedTotalCostLow: number | null;
  estimatedTotalCostHigh: number | null;
  grossMarginLow: number | null;
  grossMarginHigh: number | null;
  roiLow: number | null;
  roiHigh: number | null;
  maxRecommendedPurchasePrice: number | null;
  financialConfidence: EstimateConfidence;
  readiness: FinancialReadiness;
  validationErrors: string[];
};
