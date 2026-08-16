import type { ComparableItem, MarketEstimate } from "../deal-economics/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import { analyzeProduct } from "../product-analysis/index.ts";
import type { ProductCategory } from "../product-analysis/types.ts";
import type {
  ComparableMatch,
  MarketEstimateResult,
  MarketIntelligenceOptions,
  MarketSearchPlan,
  MarketStatistics,
  ProductIdentity,
} from "./types.ts";

export * from "./types.ts";

export const MARKET_MATCH_THRESHOLD = 60;
export const MARKET_MINIMUM_COMPARABLES = 3;
export const MARKET_MAXIMUM_RELATIVE_DISPERSION = 0.75;

const FAULT_TERMS = [
  /\bhs\b/g,
  /\bhors service\b/g,
  /\bcass(?:e|ee|es|ees)\b/g,
  /\bbrise(?:e|es?)?\b/g,
  /\bfissure(?:e|es?)?\b/g,
  /\bpour pieces?\b/g,
  /\bpieces? detachees?\b/g,
  /\ba reparer\b/g,
  /\breparation a prevoir\b/g,
  /\ben panne\b/g,
  /\bne (?:fonctionne|charge|demarre) plus\b/g,
  /\bne s allume plus\b/g,
  /\bdefectueu(?:x|se|ses)\b/g,
  /\bvendu(?:e)? en l etat\b/g,
  /\bpour (?:un )?bricoleur\b/g,
  /\b(?:ecran|dalle|batterie|hdmi|carte mere) (?:hs|casse|cassee|morte)\b/g,
  /\bretro ?eclairage\b/g,
];

const FAULT_OR_REPAIR_PATTERN =
  /\b(?:hs|hors service|casse|cassee|brise|brisee|fissure|fissuree|pour pieces?|a reparer|en panne|defectueux|defectueuse|vendu en l etat|ne fonctionne plus|ne charge plus|ne s allume plus|reparation|diagnostic|retro ?eclairage)\b/;
const ACCESSORY_PATTERN =
  /\b(?:manette|controller|joy ?con|chargeur|cable|cordon|coque|housse|support|socle|station de charge|piece detachee|lecteur seul|boite vide|emballage)\b/;
const LOT_PATTERN = /\b(?:lot de|lot d|lot comprenant|pack de plusieurs)\b/;

const IMPLICIT_BRANDS: Record<string, string> = {
  iphone: "apple",
  ipad: "apple",
  macbook: "apple",
  imac: "apple",
  ps4: "sony",
  ps5: "sony",
  playstation: "sony",
  xbox: "microsoft",
  switch: "nintendo",
  rtx: "nvidia",
  geforce: "nvidia",
};

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string | null) {
  const words = normalize(phrase).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const haystack = " " + normalize(text) + " ";
  return haystack.includes(" " + words.join(" ") + " ");
}

function inferredBrandForModel(model: string | null) {
  const normalizedModel = normalize(model);
  const key = Object.keys(IMPLICIT_BRANDS).find((candidate) =>
    normalizedModel === candidate || normalizedModel.startsWith(candidate + " "),
  );
  return key ? IMPLICIT_BRANDS[key] : null;
}

function reliableReference(reference: string | null) {
  const normalized = reference?.trim() || "";
  return /^(?:CFI[-\s]?\d{4}[A-Z]?|CUH[-\s]?\d{4}[A-Z]?|SM[-\s]?[A-Z0-9]{4,}|A\d{4}|MT[A-Z0-9]{5,})$/i.test(normalized);
}

export function cleanComparableSearchTitle(title: string) {
  let cleaned = " " + normalize(title) + " ";
  cleaned = cleaned.replace(/\b(?:ecran|dalle|batterie|hdmi|carte mere) (?:hs|casse|cassee|morte)\b/g, " ");
  for (const pattern of FAULT_TERMS) cleaned = cleaned.replace(pattern, " ");
  return cleaned
    .replace(/\b(?:urgent|faire offre|prix ferme|negociable|livraison possible)\b/g, " ")
    .replace(/\b\d+\s*(?:eur|euros?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMarketSearchPlan(identity: ProductIdentity): MarketSearchPlan | null {
  const brand = identity.brand?.trim() || null;
  const model = identity.model?.trim() || null;
  const reference = reliableReference(identity.reference) ? identity.reference?.trim() || null : null;
  const implicitBrand = inferredBrandForModel(model);

  if (brand && model && reference) {
    const omitBrand = implicitBrand === normalize(brand);
    return {
      query: [omitBrand ? null : brand, model, reference].filter(Boolean).join(" "),
      strategy: "brand_model_reference",
      identityPrecision: 100,
    };
  }
  if (brand && model) {
    const omitBrand = implicitBrand === normalize(brand);
    return {
      query: [omitBrand ? null : brand, model].filter(Boolean).join(" "),
      strategy: omitBrand ? "implicit_brand_model" : "brand_model",
      identityPrecision: 88,
    };
  }
  if (model) {
    return {
      query: model,
      strategy: implicitBrand ? "implicit_brand_model" : "model",
      identityPrecision: implicitBrand ? 78 : 68,
    };
  }

  const cleanedTitle = cleanComparableSearchTitle(identity.originalTitle);
  const meaningfulTokens = cleanedTitle.split(" ").filter((token) => token.length > 2);
  if (meaningfulTokens.length < 2) return null;
  return { query: meaningfulTokens.slice(0, 8).join(" "), strategy: "clean_title", identityPrecision: 38 };
}

function categoryCompatible(expected: ProductCategory, actual: ProductCategory) {
  if (expected === "unknown" || actual === "unknown") return true;
  if ((expected === "mac" && actual === "laptop") || (expected === "laptop" && actual === "mac")) return true;
  return expected === actual;
}

function modelFamily(model: string | null) {
  return normalize(model)
    .replace(/\b(?:pro max|pro|plus|mini|slim|oled|lite|ultra|fe|super|ti|xtx|xt)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function accessoryOnly(title: string, identity: ProductIdentity) {
  const normalizedTitle = normalize(title);
  if (!ACCESSORY_PATTERN.test(normalizedTitle)) return false;
  const modelPresent = containsPhrase(normalizedTitle, identity.model);
  const beginsWithAccessory = ACCESSORY_PATTERN.test(normalizedTitle.split(" ").slice(0, 3).join(" "));
  return !modelPresent || beginsWithAccessory ||
    /\b(?:pour|compatible)\s+(?:ps5|ps4|xbox|switch|iphone|ipad|macbook)\b/.test(normalizedTitle);
}

export function scoreComparableListing(identity: ProductIdentity, listing: LeboncoinListing): ComparableMatch {
  const text = normalize(listing.title + " " + (listing.description || ""));
  const reasons: string[] = [];
  if (listing.price === null || !Number.isFinite(listing.price) || listing.price <= 0) {
    return { listing, matchScore: 0, accepted: false, reasons, rejectionReason: "Prix absent ou invalide" };
  }
  if (listing.likelyBroken || listing.detectedFaultKeywords.length > 0 || FAULT_OR_REPAIR_PATTERN.test(text)) {
    return { listing, matchScore: 0, accepted: false, reasons, rejectionReason: "Annonce en panne ou de réparation" };
  }
  if (accessoryOnly(listing.title, identity)) {
    return { listing, matchScore: 0, accepted: false, reasons, rejectionReason: "Accessoire seul" };
  }
  if (LOT_PATTERN.test(text)) {
    return { listing, matchScore: 0, accepted: false, reasons, rejectionReason: "Lot non comparable à un appareil unique" };
  }

  const listingIdentity = analyzeProduct({
    title: listing.title,
    description: listing.description,
    brand: listing.brand,
    model: listing.modelReference,
    attributes: listing.attributes,
  });
  if (!categoryCompatible(identity.category, listingIdentity.category)) {
    return { listing, matchScore: 0, accepted: false, reasons, rejectionReason: "Catégorie contradictoire" };
  }

  let score = 0;
  if (identity.model && (containsPhrase(text, identity.model) || normalize(listingIdentity.model) === normalize(identity.model))) {
    score += 45;
    reasons.push("Modèle exact présent");
  } else if (identity.model && modelFamily(identity.model) && containsPhrase(text, modelFamily(identity.model))) {
    score += 28;
    reasons.push("Famille de modèle présente");
  } else if (identity.model && listingIdentity.model && normalize(listingIdentity.model) !== normalize(identity.model)) {
    score -= 45;
    reasons.push("Modèle contradictoire");
  }

  const expectedBrand = normalize(identity.brand) || inferredBrandForModel(identity.model);
  const actualBrand = normalize(listingIdentity.brand || listing.brand);
  if (expectedBrand && actualBrand === expectedBrand) {
    score += 20;
    reasons.push("Marque exacte");
  } else if (expectedBrand && actualBrand && actualBrand !== expectedBrand) {
    score -= 25;
    reasons.push("Marque contradictoire");
  }

  if (reliableReference(identity.reference)) {
    if (containsPhrase(text, identity.reference) || normalize(listingIdentity.reference) === normalize(identity.reference)) {
      score += 20;
      reasons.push("Référence exacte");
    } else if (listingIdentity.reference && normalize(listingIdentity.reference) !== normalize(identity.reference)) {
      score -= 25;
      reasons.push("Référence contradictoire");
    }
  }

  if (listingIdentity.category === identity.category) {
    score += 10;
    reasons.push("Catégorie exacte");
  } else if (categoryCompatible(identity.category, listingIdentity.category)) {
    score += 5;
    reasons.push("Catégorie compatible");
  }

  const expectedModel = normalize(identity.model);
  const actualModel = normalize(listingIdentity.model);
  if (expectedModel && actualModel && modelFamily(expectedModel) === modelFamily(actualModel) && expectedModel !== actualModel) {
    score -= 18;
    reasons.push("Variante différente");
  }

  const matchScore = Math.max(0, Math.min(100, score));
  return {
    listing,
    matchScore,
    accepted: matchScore >= MARKET_MATCH_THRESHOLD,
    reasons,
    rejectionReason: matchScore >= MARKET_MATCH_THRESHOLD ? null : "Score de correspondance insuffisant",
  };
}

export function isComparableListing(identity: ProductIdentity, listing: LeboncoinListing, threshold = MARKET_MATCH_THRESHOLD) {
  const match = scoreComparableListing(identity, listing);
  return match.rejectionReason === null && match.matchScore >= threshold;
}

function quantile(sorted: number[], position: number) {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateMarketStatistics(values: number[]): MarketStatistics | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  let retained = sorted;
  if (sorted.length >= 4) {
    const firstQuartile = quantile(sorted, 0.25);
    const thirdQuartile = quantile(sorted, 0.75);
    const iqr = thirdQuartile - firstQuartile;
    const lowerFence = firstQuartile - 1.5 * iqr;
    const upperFence = thirdQuartile + 1.5 * iqr;
    retained = sorted.filter((price) => price >= lowerFence && price <= upperFence);
  }
  const lowPrice = quantile(retained, 0.25);
  const medianPrice = quantile(retained, 0.5);
  const highPrice = quantile(retained, 0.75);
  const iqr = highPrice - lowPrice;
  return {
    prices: retained,
    lowPrice: round(lowPrice),
    medianPrice: round(medianPrice),
    highPrice: round(highPrice),
    iqr: round(iqr),
    relativeDispersion: medianPrice > 0 ? round(iqr / medianPrice) : 1,
  };
}

function emptyEstimate(retrievedAt: string, comparableItems: ComparableItem[] = []): MarketEstimate {
  return {
    lowPrice: null,
    medianPrice: null,
    highPrice: null,
    confidence: null,
    sampleSize: comparableItems.length,
    source: { kind: "provider", name: "Leboncoin", retrievedAt },
    comparableItems,
  };
}

/**
 * Confidence = sample (40) + average match quality (35)
 * + inverse relative IQR dispersion (15) + identity precision (10).
 */
function marketConfidence(sampleSize: number, averageMatch: number, dispersion: number, identityPrecision: number) {
  const sampleComponent = Math.min(40, (sampleSize / 15) * 40);
  const matchComponent = Math.max(0, Math.min(35, averageMatch * 0.35));
  const dispersionComponent = Math.max(0, 1 - Math.min(1, dispersion)) * 15;
  const identityComponent = Math.max(0, Math.min(10, identityPrecision * 0.1));
  return Math.round(sampleComponent + matchComponent + dispersionComponent + identityComponent);
}

export function estimateMarketFromListings(
  identity: ProductIdentity,
  listings: LeboncoinListing[],
  options: MarketIntelligenceOptions = {},
): MarketEstimateResult {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const plan = buildMarketSearchPlan(identity);
  if (!plan) {
    return {
      status: "identity_too_vague",
      message: "Identité produit trop vague pour rechercher des comparables fiables.",
      query: null,
      queryStrategy: null,
      estimate: emptyEstimate(retrievedAt),
      rejectedCount: listings.length,
    };
  }

  const threshold = options.matchThreshold ?? MARKET_MATCH_THRESHOLD;
  const matches = listings.map((listing) => scoreComparableListing(identity, listing));
  const accepted = matches.filter((match) => match.rejectionReason === null && match.matchScore >= threshold);
  const comparableItems = accepted.map<ComparableItem>(({ listing, matchScore }) => ({
    id: listing.id,
    title: listing.title,
    price: listing.price,
    url: listing.url,
    observedAt: listing.publishedAt,
    matchScore,
  }));
  const minimum = options.minimumComparables ?? MARKET_MINIMUM_COMPARABLES;
  if (accepted.length < minimum) {
    return {
      status: "insufficient_comparables",
      message: "Seulement " + accepted.length + " comparable(s) fiable(s), minimum requis : " + minimum + ".",
      query: plan.query,
      queryStrategy: plan.strategy,
      estimate: emptyEstimate(retrievedAt, comparableItems),
      rejectedCount: listings.length - accepted.length,
    };
  }

  const stats = calculateMarketStatistics(accepted.map(({ listing }) => listing.price as number));
  if (!stats) {
    return {
      status: "insufficient_comparables",
      message: "Aucun prix comparable exploitable.",
      query: plan.query,
      queryStrategy: plan.strategy,
      estimate: emptyEstimate(retrievedAt, comparableItems),
      rejectedCount: listings.length - accepted.length,
    };
  }

  const retainedPriceCounts = new Map<number, number>();
  stats.prices.forEach((price) => retainedPriceCounts.set(price, (retainedPriceCounts.get(price) || 0) + 1));
  const retained = accepted.filter(({ listing }) => {
    const price = listing.price as number;
    const count = retainedPriceCounts.get(price) || 0;
    if (count === 0) return false;
    retainedPriceCounts.set(price, count - 1);
    return true;
  });
  const retainedIds = new Set(retained.map(({ listing }) => listing.id));
  const retainedItems = comparableItems.filter((item) => item.id && retainedIds.has(item.id));
  const maximumDispersion = options.maximumRelativeDispersion ?? MARKET_MAXIMUM_RELATIVE_DISPERSION;
  if (stats.relativeDispersion > maximumDispersion) {
    return {
      status: "prices_too_dispersed",
      message: "Les prix comparables sont trop dispersés pour produire une estimation fiable.",
      query: plan.query,
      queryStrategy: plan.strategy,
      estimate: emptyEstimate(retrievedAt, retainedItems),
      rejectedCount: listings.length - retained.length,
    };
  }

  const averageMatch = retained.reduce((sum, match) => sum + match.matchScore, 0) / retained.length;
  return {
    status: "success",
    message: "Estimation calculée à partir de comparables Leboncoin filtrés.",
    query: plan.query,
    queryStrategy: plan.strategy,
    estimate: {
      lowPrice: stats.lowPrice,
      medianPrice: stats.medianPrice,
      highPrice: stats.highPrice,
      confidence: marketConfidence(retained.length, averageMatch, stats.relativeDispersion, plan.identityPrecision),
      sampleSize: retained.length,
      source: { kind: "provider", name: "Leboncoin", retrievedAt },
      comparableItems: retainedItems.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)),
    },
    rejectedCount: listings.length - retained.length,
  };
}
