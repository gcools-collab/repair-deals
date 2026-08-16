import { aggregateSelectedParts, planParts, selectBestCandidates } from "@/lib/parts-intelligence";
import type { PartSearchInput } from "@/lib/parts-intelligence";
import { EbayApiError, EbayBrowseClient, ebayConfigFromEnv } from "@/lib/parts-intelligence/providers/ebay-client";
import { EbayPartsProvider } from "@/lib/parts-intelligence/providers/ebay";
import {
  FAULT_TYPES,
  PRODUCT_CATEGORIES,
  type FaultType,
  type ProductCategory,
} from "@/lib/product-analysis";

export const runtime = "nodejs";

let ebayProvider: EbayPartsProvider | null | undefined;

function configuredEbayProvider() {
  if (ebayProvider !== undefined) return ebayProvider;
  const config = ebayConfigFromEnv();
  ebayProvider = config ? new EbayPartsProvider(new EbayBrowseClient(config)) : null;
  return ebayProvider;
}

export function resetEbayProviderForTests() {
  ebayProvider = undefined;
}

function nullableString(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 200) throw new TypeError(label + " invalide");
  return value.trim();
}

function parseInput(value: unknown): PartSearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Le corps doit être un objet");
  }
  const source = value as Record<string, unknown>;
  if (typeof source.category !== "string" || !PRODUCT_CATEGORIES.includes(source.category as ProductCategory)) {
    throw new TypeError("Catégorie invalide");
  }
  if (!Array.isArray(source.detectedFaults) || !source.detectedFaults.every((fault) =>
    typeof fault === "string" && FAULT_TYPES.includes(fault as FaultType)
  )) {
    throw new TypeError("Pannes détectées invalides");
  }
  if (
    source.confirmedFault !== undefined &&
    source.confirmedFault !== null &&
    (typeof source.confirmedFault !== "string" || !FAULT_TYPES.includes(source.confirmedFault as FaultType))
  ) {
    throw new TypeError("Panne confirmée invalide");
  }
  return {
    category: source.category as ProductCategory,
    brand: nullableString(source.brand, "Marque"),
    model: nullableString(source.model, "Modèle"),
    reference: nullableString(source.reference, "Référence"),
    detectedFaults: source.detectedFaults as FaultType[],
    confirmedFault: source.confirmedFault as FaultType | null | undefined,
    currency: nullableString(source.currency, "Devise"),
  };
}

export async function POST(request: Request) {
  try {
    const input = parseInput(await request.json());
    const plan = planParts(input);
    const provider = configuredEbayProvider();
    if (!provider || plan.searchQueries.length === 0) return Response.json(plan);

    const candidates = await provider.search(input, plan.searchQueries);
    const selected = selectBestCandidates(candidates, plan.probableParts.map((part) => part.partType));
    const result = aggregateSelectedParts(plan, candidates, selected.map((candidate) => candidate.id));
    if (selected.length === 0) {
      result.message = candidates.length > 0
        ? "Candidats eBay trouvés ; sélection manuelle requise faute de compatibilité suffisamment certaine."
        : "eBay est configuré, mais aucun candidat fiable n’a été trouvé.";
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: { code: "invalid_json", message: "Le corps JSON est invalide" } }, { status: 400 });
    }
    if (error instanceof TypeError) {
      return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 422 });
    }
    if (error instanceof EbayApiError) {
      const status = error.code === "rate_limit" ? 429 : error.code === "forbidden" ? 403 : 502;
      return Response.json(
        { error: { code: "ebay_" + error.code, message: error.message, provider: "ebay" } },
        { status },
      );
    }
    return Response.json(
      { error: { code: "internal_error", message: "La préparation des pièces a échoué" } },
      { status: 500 },
    );
  }
}
