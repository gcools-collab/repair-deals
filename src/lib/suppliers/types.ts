import type { DiagnosticHypothesis, ResolvedProductIdentity } from "../product-intelligence/index.ts";

export type SupplierSourceType = "supplier" | "marketplace" | "reference_catalog";
export type SupplierAvailability = "in_stock" | "limited" | "preorder" | "out_of_stock" | "unknown";
export type SupplierQuality = "original_oem" | "original_pulled" | "premium_compatible" | "compatible" | "refurbished" | "unknown";

export type PartSearchQuery = {
  category: ResolvedProductIdentity["category"];
  brand: string | null;
  model: string | null;
  deviceReference?: string | null;
  partType: string;
  partReference?: string | null;
  diagnostic?: DiagnosticHypothesis | null;
};

export type PartOffer = {
  supplier: { id: string; name: string; sourceTypes: SupplierSourceType[]; isMock: boolean };
  title: string;
  partType: string;
  manufacturer?: string | null;
  partReference?: string | null;
  compatibleModels: string[];
  condition: string | null;
  quality: SupplierQuality;
  price: number;
  shippingPrice?: number | null;
  totalPrice: number;
  currency: string;
  availability: SupplierAvailability;
  estimatedDelivery?: { minDate: string | null; maxDate: string | null } | null;
  confidence: number;
  productUrl?: string | null;
  retrievedAt: string;
  expiresAt?: string | null;
};

export interface SupplierAdapter {
  readonly id: string;
  readonly name: string;
  readonly sourceTypes: readonly SupplierSourceType[];
  readonly isMock: boolean;
  searchParts(query: PartSearchQuery): Promise<PartOffer[]>;
}

export type SupplierSearchDiagnostic = { supplierId: string; status: "success" | "no_results" | "unavailable" | "error"; offerCount: number; message: string | null };
export type SupplierSearchResult = { status: "complete" | "partial" | "unavailable"; offers: PartOffer[]; diagnostics: SupplierSearchDiagnostic[] };

export type FuturePurchaseResultKind = "CHEAPEST" | "FASTEST" | "BEST_VALUE";
export type PurchaseScoreComponents = { priceScore: number; deliveryScore: number; reliabilityScore: number; compatibilityScore: number; qualityScore: number };
