import type { FaultType, ProductAnalysisAttribute, ProductAnalysisResult } from "../product-analysis/index.ts";
import type {
  DiagnosticHypothesis,
  PrecisePartRequirementsResult,
  ResolvedProductIdentity,
} from "../product-intelligence/index.ts";
import type {
  PartProvider,
  PartRequirementSearchResult,
  TieredPartsSearchResult,
} from "../parts-intelligence/index.ts";

export type PartsSearchV2Input = {
  title: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  reference?: string | null;
  attributes?: Record<string, ProductAnalysisAttribute> | null;
  repairKeywords?: string[] | null;
  detectedFaults?: FaultType[] | null;
  confirmedFault?: FaultType | null;
  minimumDiagnosticConfidence?: number | null;
  currency?: string | null;
};

export type PartsSearchV2Provider = {
  id: string;
  name: string;
  provider: PartProvider | null;
};

export type PublicProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  status: "not_configured" | "success" | "no_results" | "partial_failure" | "failed";
  attemptedTiers: number;
  errorCount: number;
};

export type PartPreselectionDecision = {
  requirementId: string;
  candidateId: string | null;
  allowed: boolean;
  reasons: string[];
};

export type PartsSearchV2Response = {
  identity: ResolvedProductIdentity;
  diagnostics: DiagnosticHypothesis[];
  selectedDiagnostic: DiagnosticHypothesis | null;
  requirements: PrecisePartRequirementsResult;
  searchResults: TieredPartsSearchResult;
  primaryResults: PartRequirementSearchResult[];
  alternativeResults: PartRequirementSearchResult[];
  preselectionDecisions: PartPreselectionDecision[];
  providerStatus: PublicProviderStatus[];
  warnings: string[];
  v1Analysis: ProductAnalysisResult;
};
