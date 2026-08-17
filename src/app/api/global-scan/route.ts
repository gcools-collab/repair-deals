import {
  DEFAULT_GLOBAL_SCAN_CONFIG, DEFAULT_SEARCH_PROFILES, runGlobalOpportunityScan,
  type GlobalListingAnalyzer, type GlobalListingProvider, type GlobalScanConfig,
} from "@/lib/global-opportunity-scanner";
import { analyzeGlobalListing, globalLeboncoinProvider } from "@/lib/global-opportunity-scanner/runtime";

export const runtime = "nodejs";

function config(value: unknown): GlobalScanConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Le corps doit être un objet");
  const source = value as Record<string, unknown>;
  const n = (key: keyof GlobalScanConfig, fallback: number, min: number, max: number) => {
    const candidate = source[key];
    if (candidate === undefined) return fallback;
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < min || candidate > max) throw new TypeError(`${key} est invalide`);
    return candidate;
  };
  const categories = Array.isArray(source.categories) ? source.categories : DEFAULT_GLOBAL_SCAN_CONFIG.categories;
  if (!categories.every(item => typeof item === "string")) throw new TypeError("categories est invalide");
  return {
    ...DEFAULT_GLOBAL_SCAN_CONFIG,
    categories: categories as GlobalScanConfig["categories"],
    minPurchasePrice: n("minPurchasePrice", 0, 0, 100000), maxPurchasePrice: n("maxPurchasePrice", 500, 0, 100000),
    maxListingsPerQuery: n("maxListingsPerQuery", 10, 1, 35), maxTotalListings: n("maxTotalListings", 30, 1, 100),
    minimumRepairRelevance: n("minimumRepairRelevance", 40, 0, 100), minimumMarketConfidence: n("minimumMarketConfidence", 60, 0, 100),
    minimumPartsConfidence: n("minimumPartsConfidence", 65, 0, 100), minimumFinancialConfidence: n("minimumFinancialConfidence", 60, 0, 100),
    maxRisk: n("maxRisk", 70, 0, 100), minMargin: n("minMargin", 20, -10000, 100000), minRoi: n("minRoi", 10, -100, 10000),
    concurrency: Math.floor(n("concurrency", 2, 1, 4)), requestBudget: Math.floor(n("requestBudget", 18, 1, 100)),
    discoveryConcurrency: Math.floor(n("discoveryConcurrency", 1, 1, 1)), discoveryDelayMs: Math.floor(n("discoveryDelayMs", 400, 0, 5000)),
    discoveryCacheTtlMs: Math.floor(n("discoveryCacheTtlMs", 120000, 1000, 3600000)),
  };
}

export function createGlobalScanHandler(provider: GlobalListingProvider = globalLeboncoinProvider, analyzer: GlobalListingAnalyzer = analyzeGlobalListing) {
  return async (request: Request) => {
    try { return Response.json(await runGlobalOpportunityScan(config(await request.json()), DEFAULT_SEARCH_PROFILES, provider, analyzer)); }
    catch (error) {
      if (error instanceof SyntaxError) return Response.json({ error: { code: "invalid_json", message: "JSON invalide" } }, { status: 400 });
      if (error instanceof TypeError) return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 422 });
      return Response.json({ error: { code: "global_scan_failed", message: "Le scan global a échoué sans produire de données fictives." } }, { status: 502 });
    }
  };
}
export const POST = createGlobalScanHandler();
