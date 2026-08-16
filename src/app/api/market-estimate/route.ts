import { estimateMarketWithLeboncoin, MarketProviderError } from "@/lib/market-intelligence/provider";
import type { MarketEstimateRequest } from "@/lib/market-intelligence";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/product-analysis";

export const runtime = "nodejs";

function nullableString(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 200) {
    throw new TypeError(field + " doit être une chaîne valide");
  }
  return value.trim();
}

function parseRequest(value: unknown): MarketEstimateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Le corps de la requête doit être un objet");
  }
  const source = value as Record<string, unknown>;
  const category = source.category;
  if (typeof category !== "string" || !PRODUCT_CATEGORIES.includes(category as ProductCategory)) {
    throw new TypeError("Catégorie produit invalide");
  }
  const originalTitle = typeof source.originalTitle === "string" ? source.originalTitle.trim() : "";
  if (!originalTitle || originalTitle.length > 300) {
    throw new TypeError("Le titre original doit contenir entre 1 et 300 caractères");
  }
  const productConfidence = source.productConfidence;
  if (
    productConfidence !== undefined &&
    productConfidence !== null &&
    (typeof productConfidence !== "number" || !Number.isFinite(productConfidence) || productConfidence < 0 || productConfidence > 100)
  ) {
    throw new TypeError("Confiance produit invalide");
  }
  return {
    category: category as ProductCategory,
    brand: nullableString(source.brand, "Marque"),
    model: nullableString(source.model, "Modèle"),
    reference: nullableString(source.reference, "Référence"),
    originalTitle,
    ...(productConfidence === undefined ? {} : { productConfidence: productConfidence as number | null }),
  };
}

export async function POST(request: Request) {
  try {
    return Response.json(await estimateMarketWithLeboncoin(parseRequest(await request.json())));
  } catch (error) {
    if (error instanceof MarketProviderError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: { code: "invalid_json", message: "Le corps JSON est invalide" } }, { status: 400 });
    }
    if (error instanceof TypeError) {
      return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 422 });
    }
    return Response.json(
      { error: { code: "internal_error", message: "L’estimation marché a échoué" } },
      { status: 500 },
    );
  }
}
