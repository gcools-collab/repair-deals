import { aggregateSelectedParts, planParts, selectBestCandidates } from "@/lib/parts-intelligence";
import type { PartSearchInput } from "@/lib/parts-intelligence";
import type { EbayClientConfig } from "@/lib/parts-intelligence/providers/ebay-client";
import { EbayApiError, EbayBrowseClient, ebayConfigFromEnv } from "@/lib/parts-intelligence/providers/ebay-client";
import { EbayPartsProvider } from "@/lib/parts-intelligence/providers/ebay";
import {
  FAULT_TYPES,
  PRODUCT_CATEGORIES,
  type FaultType,
  type ProductCategory,
} from "@/lib/product-analysis";

export const runtime = "nodejs";
let ebayProviderCache: { config: EbayClientConfig; provider: EbayPartsProvider } | undefined;

function sameConfig(left: EbayClientConfig, right: EbayClientConfig) {
  return left.clientId === right.clientId && left.clientSecret === right.clientSecret &&
    left.environment === right.environment && left.marketplaceId === right.marketplaceId;
}

export function configuredEbayProvider() {
  const config = ebayConfigFromEnv();
  // Never cache missing credentials: Fast Refresh can keep this module alive.
  if (!config) return null;
  if (!ebayProviderCache || !sameConfig(ebayProviderCache.config, config)) {
    ebayProviderCache = { config, provider: new EbayPartsProvider(new EbayBrowseClient(config)) };
  }
  return ebayProviderCache.provider;
}

export function resetEbayProviderForTests() {
  ebayProviderCache = undefined;
}

function ebayDiagnostics(providerAvailable: boolean, ebayStatus: "credentials_missing" | "ready" | "results_found" | "no_results" | "oauth_refused" | "api_refused" | "network_error") {
  const selected = process.env.EBAY_ENVIRONMENT?.trim();
  return {
    ebayConfigured: Boolean(process.env.EBAY_CLIENT_ID?.trim() && process.env.EBAY_CLIENT_SECRET?.trim()),
    ebayEnvironment: selected === "production" ? "production" as const : "sandbox" as const,
    providerAvailable,
    ebayStatus,
  };
}

function logEbayDiagnostics(diagnostics: ReturnType<typeof ebayDiagnostics>) {
  console.info("[parts-intelligence] eBay provider", diagnostics);
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
    if (plan.searchQueries.length === 0) return Response.json(plan);
    if (!provider) {
      const diagnostics = ebayDiagnostics(false, "credentials_missing");
      logEbayDiagnostics(diagnostics);
      return Response.json({
        error: {
          code: "ebay_credentials_missing",
          message: "Les identifiants EBAY_CLIENT_ID et EBAY_CLIENT_SECRET sont absents du processus serveur.",
          provider: "ebay",
        },
        providerDiagnostics: diagnostics,
      }, { status: 503 });
    }

    const candidates = await provider.search(input, plan.searchQueries);
    const diagnostics = ebayDiagnostics(true, candidates.length > 0 ? "results_found" : "no_results");
    logEbayDiagnostics(diagnostics);
    const selected = selectBestCandidates(candidates, plan.probableParts.map((part) => part.partType));
    const result = aggregateSelectedParts(plan, candidates, selected.map((candidate) => candidate.id));
    result.providerDiagnostics = diagnostics;
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
      const apiRefused = ["unauthorized", "forbidden", "rate_limit", "invalid_response"].includes(error.code) ||
        (error.code === "request" && error.status !== null);
      const code = error.code === "oauth" ? "ebay_oauth_refused" : apiRefused ? "ebay_api_refused" : "ebay_network_error";
      const status = error.code === "rate_limit" ? 429 : error.code === "forbidden" ? 403 : 502;
      const diagnostics = ebayDiagnostics(Boolean(ebayProviderCache), code === "ebay_oauth_refused" ? "oauth_refused" : code === "ebay_api_refused" ? "api_refused" : "network_error");
      logEbayDiagnostics(diagnostics);
      return Response.json(
        { error: { code, reason: error.code, message: error.message, provider: "ebay" }, providerDiagnostics: diagnostics },
        { status },
      );
    }
    return Response.json(
      { error: { code: "internal_error", message: "La préparation des pièces a échoué" } },
      { status: 500 },
    );
  }
}
