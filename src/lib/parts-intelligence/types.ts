import type { EstimateSource, RepairEstimate } from "../deal-economics/types.ts";
import type { FaultType, ProductCategory } from "../product-analysis/types.ts";

export const PART_QUALITIES = [
  "original_oem",
  "original_pulled",
  "premium_compatible",
  "compatible",
  "refurbished",
  "unknown",
] as const;
export type PartQuality = (typeof PART_QUALITIES)[number];

export const PART_AVAILABILITIES = [
  "in_stock",
  "limited",
  "preorder",
  "out_of_stock",
  "unknown",
] as const;
export type PartAvailability = (typeof PART_AVAILABILITIES)[number];

export const PART_TYPES = [
  "screen_assembly",
  "display",
  "digitizer",
  "charging_port",
  "charging_flex",
  "usb_c_connector",
  "battery",
  "hdmi_port",
  "hdmi_connector",
  "led_strips",
  "backlight_board",
  "ssd",
  "storage_module",
  "joystick_module",
  "controller_parts",
] as const;
export type PartType = (typeof PART_TYPES)[number];

export type PartLocation = {
  countryCode: string | null;
  postalCode: string | null;
};

export type PartSearchInput = {
  category: ProductCategory;
  brand: string | null;
  model: string | null;
  reference: string | null;
  detectedFaults: FaultType[];
  confirmedFault?: FaultType | null;
  location?: PartLocation | null;
  currency?: string | null;
};

export type PartProviderDescriptor = {
  id: string;
  name: string;
  kind: "manual" | "professional" | "public_store" | "official_api" | "private_catalog" | "web_search";
};

export type PartCandidate = {
  id: string;
  partType: PartType | null;
  partName: string | null;
  partReference: string | null;
  compatibleModels: string[] | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  shippingCost: number | null;
  totalPrice: number | null;
  quality: PartQuality | null;
  availability: PartAvailability | null;
  provider: PartProviderDescriptor | null;
  providerItemId: string | null;
  url: string | null;
  imageUrl: string | null;
  seller: string | null;
  condition: string | null;
  itemLocation: PartLocation | null;
  buyingOptions: string[] | null;
  itemCreationDate: string | null;
  itemEndDate: string | null;
  retrievedAt: string | null;
  confidence: number | null;
  compatibilityConfidence: number | null;
  isCompatible: boolean | null;
  evidence: string[];
};

export type PartRequirement = {
  partType: PartType;
  label: string;
  searchTerms: string[];
  fault: FaultType;
  evidence: string;
};

export interface PartProvider {
  readonly descriptor: PartProviderDescriptor;
  search(input: PartSearchInput, queries: string[]): Promise<PartCandidate[]>;
}

export type PartEstimateStatus = "provider_required" | "no_known_parts" | "incomplete" | "estimated";

export type PartEstimateResult = {
  status: PartEstimateStatus;
  message: string;
  probableParts: PartRequirement[];
  searchQueries: string[];
  candidates: PartCandidate[];
  selectedCandidates: PartCandidate[];
  partsCostLow: number | null;
  partsCostHigh: number | null;
  confidence: number | null;
  source: EstimateSource | null;
  evidence: string[];
};

export type RepairEstimateBase = Pick<
  RepairEstimate,
  "estimatedMinutesLow" | "estimatedMinutesHigh" | "difficulty" | "hiddenFaultRisk"
>;
