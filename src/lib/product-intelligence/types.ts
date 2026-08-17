import type {
  FaultType,
  ProductAnalysisInput,
  ProductAnalysisResult,
  ProductCategory,
} from "../product-analysis/types.ts";

export type EvidenceSource = "structured_attribute" | "explicit_reference" | "title" | "description" | "v1" | "catalog";

export type ProductIdentityField =
  | "category" | "brand" | "family" | "model" | "generation" | "variant"
  | "screenSize" | "storage" | "year" | "modelNumber" | "manufacturerReference"
  | "objectKind" | "compatiblePlatform";

export type ProductObjectKind = "device" | "controller" | "accessory" | "spare_part";

export type IdentityEvidence = {
  field: ProductIdentityField | "probableReferences" | "confirmedReference";
  value: string;
  source: EvidenceSource;
  confidence: number;
  detail: string;
};

export type ProbableProductReference = {
  reference: string;
  kind: "model_number" | "manufacturer_reference";
  confidence: number;
  evidences: IdentityEvidence[];
};

export type ResolvedProductIdentity = {
  category: ProductCategory;
  objectKind: ProductObjectKind;
  compatiblePlatform: string | null;
  brand: string | null;
  family: string | null;
  model: string | null;
  generation: string | null;
  variant: string | null;
  screenSize: number | null;
  storage: string | null;
  year: number | null;
  modelNumber: string | null;
  manufacturerReference: string | null;
  probableReferences: ProbableProductReference[];
  confirmedReference: string | null;
  confidence: number;
  evidences: IdentityEvidence[];
  contradictions: string[];
};

export interface ProductIdentityEnricher {
  readonly id: string;
  enrich(
    identity: ResolvedProductIdentity,
    input: ProductAnalysisInput,
  ): ResolvedProductIdentity | Promise<ResolvedProductIdentity>;
}

export type DeviceResolverInput = ProductAnalysisInput & {
  v1Analysis?: ProductAnalysisResult;
};

export type DiagnosticSeverity = "low" | "moderate" | "high" | "critical" | "unknown";
export type DiagnosticRepairDifficulty = "easy" | "moderate" | "hard" | "expert" | "unknown";
export type CauseStatus = "probable" | "confirmed";

export type DiagnosticCause = {
  cause: string;
  status: CauseStatus;
  confidence: number;
  evidences: string[];
};

export type DiagnosticHypothesis = {
  fault: FaultType;
  probableCauses: DiagnosticCause[];
  confirmedCauses: DiagnosticCause[];
  confidence: number;
  severity: DiagnosticSeverity;
  requiredChecks: string[];
  repairDifficulty: DiagnosticRepairDifficulty;
  hiddenRisk: number;
  evidences: string[];
};

export type DiagnosticResolverInput = {
  product: ResolvedProductIdentity;
  analysis: ProductAnalysisResult;
  originalInput: ProductAnalysisInput;
  confirmedCauses?: Partial<Record<FaultType, string[]>>;
};
