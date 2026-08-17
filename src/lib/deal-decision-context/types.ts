import type { FinancialAnalysis, MarketEstimate, RepairEstimate } from "../deal-economics/index.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import type { PartCandidate, TieredPartsSearchResult } from "../parts-intelligence/index.ts";
import type {
  DiagnosticHypothesis,
  PrecisePartRequirementsResult,
  ResolvedProductIdentity,
} from "../product-intelligence/index.ts";

export type PurchaseBenefit = {
  provider: string;
  type: "cashback" | "coupon" | "gift_card" | "loyalty";
  estimatedValue: number | null;
  confidence: number | null;
  activationUrl: string | null;
};

export type DealDecisionStage =
  | "incomplete" | "identity_ready" | "diagnostic_ready" | "parts_ready"
  | "market_ready" | "financial_ready" | "decision_ready";

export type DealDecisionReadiness = {
  identityReady: boolean;
  diagnosticReady: boolean;
  partsReady: boolean;
  marketReady: boolean;
  financialReady: boolean;
  decisionReady: boolean;
  currentStage: DealDecisionStage;
  missing: string[];
};

export type DealDecisionContext = {
  listing: LeboncoinListing | null;
  resolvedIdentity: ResolvedProductIdentity | null;
  diagnostics: DiagnosticHypothesis[];
  selectedDiagnostic: DiagnosticHypothesis | null;
  partRequirements: PrecisePartRequirementsResult | null;
  partSearchResults: TieredPartsSearchResult | null;
  selectedParts: PartCandidate[];
  marketEstimate: MarketEstimate | null;
  repairEstimate: RepairEstimate | null;
  financialEstimate: FinancialAnalysis | null;
  purchaseBenefits: PurchaseBenefit[];
  readiness: DealDecisionReadiness;
  warnings: string[];
};

export type DealDecisionContextInput = Omit<DealDecisionContext, "readiness" | "warnings"> & {
  warnings?: string[];
};
