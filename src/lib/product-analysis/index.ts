import { BRANDS, CATEGORY_RULES, FAULT_RULES, GENERIC_FAULT_PATTERN, MODEL_RULES } from "./rules.ts";
import type { FaultType, ProductAnalysisInput, ProductAnalysisResult } from "./types.ts";
export * from "./types.ts";

const INVALID_STRUCTURED_VALUES = new Set(["", "leboncoin", "lbc", "unknown", "inconnu", "autre"]);

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsBrand(text: string, brand: string) {
  const candidate = normalize(brand).replace(/\s+/g, "\\s*");
  return new RegExp(`(?:^|\\b)${candidate}(?:\\b|$)`, "i").test(normalize(text));
}

function cleanStructured(value: string | null | undefined) {
  const cleaned = value?.trim() || "";
  return INVALID_STRUCTURED_VALUES.has(normalize(cleaned)) ? null : cleaned;
}

function attributeText(input: ProductAnalysisInput, names: string[]) {
  const wanted = new Set(names.map(normalize));
  for (const [name, attribute] of Object.entries(input.attributes || {})) {
    const keys = [name, attribute.key, attribute.keyLabel].filter((value): value is string => Boolean(value)).map(normalize);
    if (!keys.some((key) => wanted.has(key))) continue;
    const value = attribute.valueLabel ?? attribute.value;
    if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  }
  return null;
}

function sourceMatch(pattern: RegExp, sources: Array<{ label: string; text: string; points: number }>) {
  for (const source of sources) {
    const match = source.text.match(pattern);
    if (match) return { ...source, match };
  }
  return null;
}

function exactReference(text: string) {
  const match = text.match(/\b(?:CFI[-\s]?\d{4}[A-Z]?|CUH[-\s]?\d{4}[A-Z]?|SM[-\s]?[A-Z0-9]{4,}|A\d{4}|MT[A-Z0-9]{5,})\b/i);
  return match ? match[0].replace(/\s+/g, "-").toUpperCase() : null;
}

function genericModelForAmbiguity(text: string, selected: string) {
  if (/^PS5 (?:Pro|Slim)$/.test(selected) && /\b(?:slim.*pro|pro.*slim)\b/i.test(text)) return "PS5";
  if (/^Switch (?:Lite|OLED)$/.test(selected) && /\b(?:lite.*oled|oled.*lite)\b/i.test(text)) return "Switch";
  return selected;
}

export function analyzeProduct(input: ProductAnalysisInput): ProductAnalysisResult {
  const title = input.title.trim();
  const description = input.description?.trim() || "";
  const structuredBrand = cleanStructured(input.brand) || cleanStructured(attributeText(input, ["brand", "marque"]));
  const structuredModel = cleanStructured(input.model) || cleanStructured(attributeText(input, ["model", "modele", "modèle", "reference", "référence"]));
  const productSources = [
    { label: "la donnée modèle Leboncoin", text: structuredModel || "", points: 38 },
    { label: "le titre", text: title, points: 34 },
    { label: "la description", text: description, points: 18 },
  ];
  const evidence: string[] = [];

  let category: ProductAnalysisResult["category"] = "unknown";
  let subcategory: string | null = null;
  let productConfidence = 0;
  for (const source of [
    { label: "Titre", text: title, points: 28 },
    { label: "Description", text: description, points: 14 },
  ]) {
    const rule = CATEGORY_RULES.find((candidate) => candidate.pattern.test(normalize(source.text)));
    if (rule) {
      category = rule.category;
      subcategory = rule.subcategory;
      productConfidence += source.points;
      evidence.push(`${source.label} identifie la catégorie « ${rule.category} »`);
      break;
    }
  }

  let model: string | null = null;
  let inferredBrand: string | null = null;
  for (const rule of MODEL_RULES) {
    const found = sourceMatch(rule.pattern, productSources.map((source) => ({ ...source, text: normalize(source.text) })));
    if (!found) continue;
    const selectedModel = rule.format(found.match);
    model = genericModelForAmbiguity(normalize(`${structuredModel || ""} ${title} ${description}`), selectedModel);
    inferredBrand = rule.inferredBrand || null;
    subcategory = rule.subcategory || subcategory;
    productConfidence += model === selectedModel ? found.points : Math.max(14, found.points - 16);
    if (model !== selectedModel) evidence.push("Plusieurs variantes sont citées : le modèle générique est conservé");
    evidence.push(`${found.label[0].toUpperCase()}${found.label.slice(1)} contient le modèle « ${model} »`);
    break;
  }

  let brand: string | null = null;
  if (structuredBrand) {
    brand = structuredBrand;
    productConfidence += 30;
    evidence.push(`Marque « ${brand} » fournie par les attributs Leboncoin`);
  } else {
    for (const source of [{ label: "Titre", text: title, points: 22 }, { label: "Description", text: description, points: 10 }]) {
      const found = BRANDS.find((candidate) => containsBrand(source.text, candidate));
      if (!found) continue;
      brand = found;
      productConfidence += source.points;
      evidence.push(`${source.label} contient la marque « ${brand} »`);
      break;
    }
  }
  if (!brand && inferredBrand) {
    brand = inferredBrand;
    productConfidence += 14;
    evidence.push(`Marque ${brand} déduite du modèle « ${model} »`);
  }

  const reference = exactReference(`${structuredModel || ""} ${title} ${description}`);
  if (reference) {
    productConfidence += structuredModel?.toUpperCase().includes(reference) ? 18 : 12;
    evidence.push(`Référence exacte « ${reference} » détectée`);
  }
  if (category === "unknown" && (brand || model || reference)) {
    category = "other_electronics";
    productConfidence += 8;
    evidence.push("Produit électronique reconnu sans catégorie plus précise");
  }

  const detectedFaults: FaultType[] = [];
  let faultConfidence = 0;
  const faultSources = [
    ...(input.repairKeywords || []).map((keyword) => ({ label: "Mot-clé scanner", text: keyword, points: 36 })),
    { label: "Titre", text: title, points: 34 },
    { label: "Description", text: description, points: 20 },
  ];
  for (const rule of FAULT_RULES) {
    const found = sourceMatch(rule.pattern, faultSources.map((source) => ({ ...source, text: normalize(source.text) })));
    if (!found) continue;
    detectedFaults.push(rule.fault);
    faultConfidence = Math.max(faultConfidence, found.points);
    evidence.push(`${found.label} signale la panne « ${rule.fault} »`);
  }
  if (detectedFaults.length === 0) {
    const generic = sourceMatch(GENERIC_FAULT_PATTERN, faultSources.map((source) => ({ ...source, text: normalize(source.text) })));
    if (generic) {
      detectedFaults.push("unknown_fault");
      faultConfidence = Math.min(generic.points, 28);
      evidence.push(`${generic.label} indique une panne sans diagnostic précis`);
    }
  } else if (detectedFaults.length > 1) {
    faultConfidence += Math.min(16, (detectedFaults.length - 1) * 6);
  }
  if ((input.repairKeywords || []).length > 0 && detectedFaults.length > 0) faultConfidence += 12;

  return {
    category,
    subcategory,
    brand,
    model,
    reference,
    detectedFaults,
    productConfidence: Math.min(100, productConfidence),
    faultConfidence: Math.min(100, faultConfidence),
    evidence,
  };
}
