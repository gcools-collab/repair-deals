export type ScannerCriteria = {
  query: string;
  min_price?: number;
  max_price?: number;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  limit: number;
  broken_only: boolean;
};

export type LeboncoinAttribute = {
  key: string;
  keyLabel: string | null;
  value: string | number | boolean | null;
  valueLabel: string | null;
  values: string[];
  valuesLabel: string[];
};

export type LeboncoinListing = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  url: string;
  images: string[];
  brand: string | null;
  modelReference: string | null;
  location: {
    city: string | null;
    cityLabel: string | null;
    zipcode: string | null;
    departmentName: string | null;
    regionName: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  publishedAt: string | null;
  attributes: Record<string, LeboncoinAttribute>;
  detectedFaultKeywords: string[];
  likelyBroken: boolean;
  repairRelevanceScore: number;
  searchRelevanceScore: number;
  exclusionReasons: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  listingKind: "device" | "accessory" | "spare_part" | "service" | "lot" | "unknown";
};

export type LeboncoinSearchResponse = {
  rawCount: number;
  retainedCount: number;
  repairRelevanceThreshold: number;
  searchRelevanceThreshold: number;
  results: LeboncoinListing[];
  excluded: Array<{ id: string; title: string; repairRelevanceScore: number; searchRelevanceScore: number; exclusionReasons: string[]; listingKind: LeboncoinListing["listingKind"] }>;
};

export class ScannerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function optionalNumber(
  source: Record<string, unknown>,
  key: keyof ScannerCriteria,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ScannerRequestError(`${key} is invalid`, 422, "validation_error");
  }
  return value;
}

export function parseScannerCriteria(value: unknown): ScannerCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScannerRequestError("Request body must be an object", 400, "invalid_json");
  }
  const source = value as Record<string, unknown>;
  const query = typeof source.query === "string" ? source.query.trim() : "";
  if (!query || query.length > 200) {
    throw new ScannerRequestError("query must contain 1 to 200 characters", 422, "validation_error");
  }

  const minPrice = optionalNumber(source, "min_price", 0, Number.MAX_SAFE_INTEGER);
  const maxPrice = optionalNumber(source, "max_price", 0, Number.MAX_SAFE_INTEGER);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ScannerRequestError("min_price cannot exceed max_price", 422, "validation_error");
  }
  const latitude = optionalNumber(source, "latitude", -90, 90);
  const longitude = optionalNumber(source, "longitude", -180, 180);
  if ((latitude === undefined) !== (longitude === undefined)) {
    throw new ScannerRequestError(
      "latitude and longitude must be provided together",
      422,
      "validation_error",
    );
  }

  const limit = optionalNumber(source, "limit", 1, 35) ?? 20;
  if (!Number.isInteger(limit)) {
    throw new ScannerRequestError("limit must be an integer", 422, "validation_error");
  }
  const radiusKm = optionalNumber(source, "radius_km", 1, 500);
  if (radiusKm !== undefined && !Number.isInteger(radiusKm)) {
    throw new ScannerRequestError("radius_km must be an integer", 422, "validation_error");
  }
  if (source.broken_only !== undefined && typeof source.broken_only !== "boolean") {
    throw new ScannerRequestError("broken_only must be a boolean", 422, "validation_error");
  }
  if (
    source.postal_code !== undefined &&
    (typeof source.postal_code !== "string" || source.postal_code.trim().length < 2 || source.postal_code.trim().length > 12)
  ) {
    throw new ScannerRequestError("postal_code is invalid", 422, "validation_error");
  }

  return {
    query,
    ...(minPrice === undefined ? {} : { min_price: minPrice }),
    ...(maxPrice === undefined ? {} : { max_price: maxPrice }),
    ...(source.postal_code === undefined ? {} : { postal_code: source.postal_code.trim() }),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(radiusKm === undefined ? {} : { radius_km: radiusKm }),
    limit,
    broken_only: source.broken_only ?? false,
  };
}

export async function scanLeboncoin(criteria: ScannerCriteria): Promise<LeboncoinSearchResponse> {
  const bridgeUrl = process.env.LEBONCOIN_BRIDGE_URL ?? "http://127.0.0.1:8080";
  const apiKey = process.env.LEBONCOIN_BRIDGE_API_KEY;
  if (!apiKey) {
    throw new ScannerRequestError(
      "Leboncoin bridge is not configured",
      503,
      "bridge_not_configured",
    );
  }

  let response: Response;
  try {
    response = await fetch(new URL("/search", bridgeUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": apiKey,
      },
      body: JSON.stringify(criteria),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ScannerRequestError("Leboncoin bridge is unavailable", 502, "bridge_unavailable");
  }

  if (!response.ok) {
    throw new ScannerRequestError(
      "Leboncoin bridge rejected the scan",
      response.status >= 500 ? 502 : response.status,
      "bridge_error",
    );
  }
  return (await response.json()) as LeboncoinSearchResponse;
}
