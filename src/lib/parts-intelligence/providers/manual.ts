import type {
  PartCandidate,
  PartProvider,
  PartProviderDescriptor,
  PartSearchInput,
} from "../types.ts";

export type ManualPartInput = Omit<
  PartCandidate,
  "id" | "provider" | "providerItemId" | "imageUrl" | "seller" | "condition" | "itemLocation" |
  "buyingOptions" | "itemCreationDate" | "itemEndDate" | "retrievedAt" | "totalPrice" | "confidence" | "compatibilityConfidence" | "isCompatible" | "evidence"
> & {
  id?: string;
  retrievedAt?: string | null;
};

export const MANUAL_PARTS_PROVIDER: PartProviderDescriptor = {
  id: "manual",
  name: "Saisie utilisateur",
  kind: "manual",
};

export function createManualPartCandidate(input: ManualPartInput): PartCandidate {
  const retrievedAt = input.retrievedAt || new Date().toISOString();
  const { quantity, unitPrice, shippingCost } = input;
  const hasCompletePrice =
    quantity !== null &&
    quantity > 0 &&
    unitPrice !== null &&
    unitPrice >= 0 &&
    shippingCost !== null &&
    shippingCost >= 0;
  return {
    ...input,
    id: input.id || "manual-" + retrievedAt + "-" + Math.random().toString(36).slice(2),
    provider: MANUAL_PARTS_PROVIDER,
    providerItemId: null,
    imageUrl: null,
    seller: null,
    condition: null,
    itemLocation: null,
    buyingOptions: null,
    itemCreationDate: null,
    itemEndDate: null,
    retrievedAt,
    totalPrice: hasCompletePrice
      ? Math.round((quantity * unitPrice + shippingCost) * 100) / 100
      : null,
    confidence: null,
    compatibilityConfidence: null,
    isCompatible: true,
    evidence: ["Pièce et compatibilité confirmées manuellement par l’utilisateur."],
  };
}

export class ManualPartsProvider implements PartProvider {
  readonly descriptor = MANUAL_PARTS_PROVIDER;

  constructor(private readonly candidates: PartCandidate[]) {}

  async search(input: PartSearchInput, queries: string[]) {
    void input;
    void queries;
    return this.candidates.filter((candidate) => candidate.provider?.id === this.descriptor.id);
  }
}
