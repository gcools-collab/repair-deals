import type { FaultType } from "../product-analysis/types.ts";
import type { DiagnosticHypothesis, ResolvedProductIdentity } from "./types.ts";

export type PrecisePartType =
  | "screen_assembly" | "display" | "display_flex" | "display_connector" | "digitizer"
  | "hdmi_port" | "hdmi_connector" | "hdmi_circuit"
  | "usb_c_connector" | "charging_port" | "charging_flex" | "charging_controller"
  | "led_strips" | "backlight_board" | "panel_connection" | "unknown";

export type CompatibilityKey = {
  key: "brand" | "family" | "model" | "generation" | "variant" | "year" | "screenSize" | "storage" | "reference";
  value: string;
  confidence: number;
  source: "confirmed" | "explicit" | "probable" | "resolved_identity";
};

export type PartQueryTier = {
  tier: 1 | 2 | 3 | 4;
  label: string;
  query: string;
  confidence: number;
  rationale: string;
};

export type PartReference = {
  reference: string;
  confidence: number;
};

export type PrecisePartRequirement = {
  partType: PrecisePartType;
  normalizedPartName: string;
  diagnosticFault: FaultType;
  diagnosticCause: string;
  compatibilityKeys: CompatibilityKey[];
  confirmedReferences: PartReference[];
  probableReferences: PartReference[];
  searchQueries: string[];
  queryTiers: PartQueryTier[];
  requiredAttributes: string[];
  optionalAttributes: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  confidence: number;
  evidences: string[];
  warnings: string[];
};

export type PrecisePartRequirementsResult = {
  primaryRequirements: PrecisePartRequirement[];
  alternativeRequirements: PrecisePartRequirement[];
  warnings: string[];
  evidences: string[];
};

export type PrecisePartRequirementsInput = {
  product: ResolvedProductIdentity;
  diagnostics: DiagnosticHypothesis[];
};
