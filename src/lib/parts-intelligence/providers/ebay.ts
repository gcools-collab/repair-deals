import type {
  PartAvailability,
  PartCandidate,
  PartProvider,
  PartProviderDescriptor,
  PartQuality,
  PartSearchInput,
  PartType,
} from "../types.ts";
import { inferProbableParts } from "../index.ts";
import { EbayBrowseClient, type EbayItemSummary } from "./ebay-client.ts";

export const EBAY_PARTS_PROVIDER: PartProviderDescriptor = {
  id: "ebay",
  name: "eBay",
  kind: "official_api",
};

const MAX_SEARCHES = 3;
const RESULTS_PER_SEARCH = 10;
const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = { expiresAt: number; candidates: PartCandidate[] };

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function classifyEbayQuality(title: string, condition: string | null): { quality: PartQuality; evidence: string } {
  const source = normalized(title + " " + (condition ?? ""));
  if (/\b(refurbished|reconditionne|reconditioned)\b/.test(source)) {
    return { quality: "refurbished", evidence: "Qualité reconditionnée indiquée par le titre ou la condition eBay." };
  }
  if (/\b(pulled|used original|original used|demonte)\b/.test(source)) {
    return { quality: "original_pulled", evidence: "Pièce originale démontée suggérée par le titre ou la condition eBay." };
  }
  if (/\b(oem|original|genuine|origine)\b/.test(source)) {
    return { quality: "original_oem", evidence: "Origine OEM suggérée par les termes de l’annonce, sans authentification indépendante." };
  }
  if (/\b(compatible|replacement|remplacement)\b/.test(source)) {
    return { quality: "compatible", evidence: "Pièce compatible indiquée par le titre de l’annonce." };
  }
  return { quality: "unknown", evidence: "Aucun indice suffisamment fiable pour classer la qualité." };
}

function partTypeFor(query: string, input: PartSearchInput): PartType | null {
  const queryText = normalized(query);
  const requirements = inferProbableParts(input);
  let best: { type: PartType; length: number } | null = null;
  for (const requirement of requirements) {
    for (const term of requirement.searchTerms) {
      const match = normalized(term);
      if (queryText.includes(match) && (!best || match.length > best.length)) {
        best = { type: requirement.partType, length: match.length };
      }
    }
  }
  return best?.type ?? requirements[0]?.partType ?? null;
}

function expectedTerms(partType: PartType | null) {
  switch (partType) {
    case "hdmi_port":
    case "hdmi_connector": return ["hdmi port", "hdmi socket", "hdmi connector", "connecteur hdmi", "port hdmi"];
    case "screen_assembly":
    case "display":
    case "digitizer": return ["screen", "display", "lcd", "oled", "digitizer", "ecran"];
    case "charging_port":
    case "charging_flex":
    case "usb_c_connector": return ["charging port", "charging flex", "usb c", "connecteur", "charge"];
    case "battery": return ["battery", "batterie"];
    case "led_strips":
    case "backlight_board": return ["led strip", "backlight", "retroclairage"];
    case "ssd":
    case "storage_module": return ["ssd", "storage", "stockage"];
    case "joystick_module":
    case "controller_parts": return ["joystick", "stick", "controller part", "manette"];
    default: return [];
  }
}

function falsePositiveReason(title: string, partType: PartType | null) {
  const text = normalized(title);
  if (/\b(repair service|repair mail|service de reparation|reparation uniquement)\b/.test(text)) return "annonce de service de réparation";
  if (partType === "hdmi_port" || partType === "hdmi_connector") {
    if (/\b(cable|adapter|adaptateur|switch|splitter|capture card)\b/.test(text)) return "accessoire HDMI sans connecteur de remplacement";
  }
  if (partType === "screen_assembly" || partType === "display" || partType === "digitizer") {
    if (/\b(case|cover|coque|screen protector|verre trempe|tempered glass)\b/.test(text)) return "accessoire de protection sans écran";
  }
  return null;
}

function modelContradiction(title: string, model: string | null) {
  if (!model) return null;
  const target = normalized(model);
  const text = normalized(title);
  if (target === "iphone 13" && /\biphone 13 (pro|max|mini|plus)\b/.test(text)) return "variante iPhone différente du modèle standard";
  if (target === "iphone 13 pro" && /\biphone 13\b/.test(text) && !/\biphone 13 pro\b/.test(text)) return "modèle iPhone 13 standard au lieu du Pro";
  if (target === "ps5" && /\bps4\b/.test(text)) return "modèle PlayStation contradictoire (PS4)";
  if (target === "ps4" && /\bps5\b/.test(text)) return "modèle PlayStation contradictoire (PS5)";
  return null;
}

export function scoreEbayCompatibility(title: string, input: PartSearchInput, partType: PartType | null) {
  const text = normalized(title);
  const evidence: string[] = [];
  const falsePositive = falsePositiveReason(title, partType);
  const contradiction = modelContradiction(title, input.model);
  if (falsePositive || contradiction) {
    evidence.push("Exclu : " + (falsePositive ?? contradiction) + ".");
    return { confidence: 0, compatible: false as const, evidence };
  }

  let score = 0;
  const model = normalized(input.model);
  const reference = normalized(input.reference);
  const brand = normalized(input.brand);
  if (model && text.includes(model)) {
    score += 40;
    evidence.push("Modèle exact présent dans le titre.");
  }
  if (reference && text.includes(reference)) {
    score += 35;
    evidence.push("Référence constructeur exacte présente dans le titre.");
  }
  if (brand && text.includes(brand)) {
    score += 8;
    evidence.push("Marque présente dans le titre.");
  }
  const term = expectedTerms(partType).find((candidate) => text.includes(candidate));
  if (term) {
    score += 35;
    evidence.push("Type de pièce reconnu dans le titre : " + term + ".");
  } else {
    evidence.push("Type de pièce non confirmé dans le titre.");
  }
  score = Math.min(score, 100);
  return { confidence: score, compatible: score >= 75 ? true as const : null, evidence };
}

function availability(item: EbayItemSummary): PartAvailability {
  const status = normalized(stringValue(item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus));
  if (status.includes("out of stock")) return "out_of_stock";
  if (status.includes("limited")) return "limited";
  if (status.includes("preorder")) return "preorder";
  if (status.includes("in stock")) return "in_stock";
  return "unknown";
}

function normalizeItem(item: EbayItemSummary, input: PartSearchInput, query: string, retrievedAt: string): PartCandidate | null {
  const itemId = stringValue(item.itemId);
  const title = stringValue(item.title);
  if (!itemId || !title) return null;
  const partType = partTypeFor(query, input);
  const compatibility = scoreEbayCompatibility(title, input, partType);
  if (compatibility.compatible === false) return null;

  const unitPrice = numberValue(item.price?.value);
  const currency = stringValue(item.price?.currency);
  const shipping = item.shippingOptions?.map((option) => ({
    value: numberValue(option.shippingCost?.value),
    currency: stringValue(option.shippingCost?.currency),
  })).find((option) => option.value !== null && (!currency || option.currency === currency));
  const shippingCost = shipping?.value ?? null;
  const totalPrice = unitPrice !== null && shippingCost !== null
    ? Math.round((unitPrice + shippingCost) * 100) / 100
    : null;
  const condition = stringValue(item.condition);
  const quality = classifyEbayQuality(title, condition);

  return {
    id: "ebay-" + itemId,
    partType,
    partName: title,
    partReference: input.reference && normalized(title).includes(normalized(input.reference)) ? input.reference : null,
    compatibleModels: input.model && normalized(title).includes(normalized(input.model)) ? [input.model] : null,
    quantity: 1,
    unitPrice,
    currency,
    shippingCost,
    totalPrice,
    quality: quality.quality,
    availability: availability(item),
    provider: EBAY_PARTS_PROVIDER,
    providerItemId: itemId,
    url: stringValue(item.itemWebUrl),
    imageUrl: stringValue(item.image?.imageUrl),
    seller: stringValue(item.seller?.username),
    condition,
    itemLocation: item.itemLocation ? {
      countryCode: stringValue(item.itemLocation.country),
      postalCode: stringValue(item.itemLocation.postalCode),
    } : null,
    buyingOptions: Array.isArray(item.buyingOptions) ? item.buyingOptions.filter((value): value is string => typeof value === "string") : null,
    itemCreationDate: stringValue(item.itemCreationDate),
    itemEndDate: stringValue(item.itemEndDate),
    retrievedAt,
    confidence: compatibility.confidence,
    compatibilityConfidence: compatibility.confidence,
    isCompatible: compatibility.compatible,
    evidence: [...compatibility.evidence, quality.evidence, shippingCost === null
      ? "Frais de livraison inconnus : total non calculé."
      : "Total calculé avec le prix et la livraison fournis par eBay."],
  };
}

export class EbayPartsProvider implements PartProvider {
  readonly descriptor = EBAY_PARTS_PROVIDER;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly client: EbayBrowseClient,
    private readonly now: () => number = Date.now,
  ) {}

  async search(input: PartSearchInput, queries: string[]) {
    const selectedQueries: string[] = [];
    const seenTypes = new Set<PartType | null>();
    for (const query of [...new Set(queries.map((value) => value.trim()).filter(Boolean))]) {
      const type = partTypeFor(query, input);
      if (seenTypes.has(type)) continue;
      seenTypes.add(type);
      selectedQueries.push(query);
      if (selectedQueries.length >= MAX_SEARCHES) break;
    }

    const key = JSON.stringify({ input, selectedQueries });
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.candidates;

    const retrievedAt = new Date(this.now()).toISOString();
    const responses = await Promise.all(selectedQueries.map((query) => this.client.search(query, RESULTS_PER_SEARCH)));
    const candidates = responses.flatMap((items, index) =>
      items.map((item) => normalizeItem(item, input, selectedQueries[index], retrievedAt)).filter((item): item is PartCandidate => item !== null)
    );
    const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
      .sort((left, right) => (right.compatibilityConfidence ?? 0) - (left.compatibilityConfidence ?? 0));
    this.cache.set(key, { expiresAt: this.now() + CACHE_TTL_MS, candidates: unique });
    return unique;
  }
}
