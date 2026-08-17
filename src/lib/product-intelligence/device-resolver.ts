import { analyzeProduct } from "../product-analysis/index.ts";
import type { ProductAnalysisAttribute } from "../product-analysis/types.ts";
import { DEVICE_FAMILY_RULES, REFERENCE_CATALOG } from "./catalog.ts";
import type {
  DeviceResolverInput,
  EvidenceSource,
  IdentityEvidence,
  ProductIdentityField,
  ResolvedProductIdentity,
} from "./types.ts";

function normalize(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9,.]+/g, " ").trim();
}

function attributeEntries(attributes: Record<string, ProductAnalysisAttribute> | null | undefined) {
  return Object.entries(attributes || {}).map(([name, attribute]) => ({
    name: normalize([name, attribute.key, attribute.keyLabel].filter(Boolean).join(" ")),
    value: String(attribute.valueLabel ?? attribute.value ?? "").trim(),
  })).filter((entry) => entry.value);
}

function structuredValue(input: DeviceResolverInput, keys: RegExp) {
  return attributeEntries(input.attributes).find((entry) => keys.test(entry.name))?.value || null;
}

function sourceTexts(input: DeviceResolverInput) {
  const structured = [input.model, ...attributeEntries(input.attributes).map((entry) => entry.value)].filter(Boolean).join(" ");
  return [
    { source: "structured_attribute" as const, text: structured, confidence: 98, label: "attribut structuré" },
    { source: "title" as const, text: input.title, confidence: 90, label: "titre" },
    { source: "description" as const, text: input.description || "", confidence: 68, label: "description" },
  ];
}

function findValue(input: DeviceResolverInput, pattern: RegExp) {
  for (const source of sourceTexts(input)) {
    const match = normalize(source.text).match(pattern);
    if (match) return { match, ...source };
  }
  return null;
}

function evidence(field: ProductIdentityField, value: string, source: EvidenceSource, confidence: number, detail: string): IdentityEvidence {
  return { field, value, source, confidence, detail };
}

function explicitReferences(input: DeviceResolverInput) {
  const text = sourceTexts(input).map((source) => source.text).join(" ");
  return [...text.matchAll(/\b(?:A\d{4}|MacBookPro\d{1,2},\d|CFI[-\s]?\d{4}[A-Z]?|CUH[-\s]?\d{4}[A-Z]?|SM[-\s]?[A-Z0-9]{4,})\b/gi)]
    .map((match) => match[0].replace(/\s+/g, "-")).filter((value, index, all) => all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
}

export function resolveDeviceIdentity(input: DeviceResolverInput): ResolvedProductIdentity {
  const v1 = input.v1Analysis || analyzeProduct(input);
  const texts = sourceTexts(input);
  const allText = texts.map((source) => source.text).join(" ");
  const evidences: IdentityEvidence[] = [];
  const contradictions: string[] = [];
  const familyMatches = DEVICE_FAMILY_RULES.filter((rule) => rule.pattern.test(normalize(allText)));
  const familyRule = familyMatches[0] || null;
  if (new Set(familyMatches.map((rule) => rule.family)).size > 1) {
    contradictions.push(`Plusieurs familles sont mentionnées : ${[...new Set(familyMatches.map((rule) => rule.family))].join(", ")}.`);
  }

  const brand = input.brand?.trim() || structuredValue(input, /\b(?:brand|marque)\b/) || v1.brand || familyRule?.brand || null;
  const family = familyRule?.family || null;
  const category = familyRule?.category || v1.category;
  const familySource = texts.find((source) => familyRule?.pattern.test(normalize(source.text)));
  if (brand) evidences.push(evidence("brand", brand, input.brand || structuredValue(input, /\b(?:brand|marque)\b/) ? "structured_attribute" : "v1", input.brand ? 98 : 82, "Marque issue des données prioritaires ou de Product Analysis V1."));
  if (family && familySource) evidences.push(evidence("family", family, familySource.source, familySource.confidence, `Famille reconnue dans le ${familySource.label}.`));
  if (category !== "unknown") evidences.push(evidence("category", category, familyRule ? "catalog" : "v1", familyRule ? 92 : v1.productConfidence, "Catégorie cohérente avec la famille reconnue."));

  const model = v1.model;
  if (model) evidences.push(evidence("model", model, "v1", v1.productConfidence, "Modèle fourni par Product Analysis V1."));

  const yearFound = findValue(input, /\b(19[89]\d|20[0-3]\d)\b/);
  const year = yearFound ? Number(yearFound.match[1]) : null;
  if (yearFound) evidences.push(evidence("year", String(year), yearFound.source, yearFound.confidence, `Année explicite détectée dans le ${yearFound.label}.`));
  const mentionedYears = [...new Set(sourceTexts(input).flatMap((source) =>
    [...normalize(source.text).matchAll(/\b(19[89]\d|20[0-3]\d)\b/g)].map((match) => Number(match[1])),
  ))];
  if (mentionedYears.length > 1) contradictions.push(`Plusieurs années sont mentionnées : ${mentionedYears.join(", ")}. La source la plus prioritaire est conservée.`);

  const screenStructured = structuredValue(input, /\b(?:screen size|taille.*ecran|diagonale)\b/);
  const screenFound = screenStructured
    ? { match: normalize(screenStructured).match(/\b(\d{1,2}(?:[.,]\d)?)\b/), source: "structured_attribute" as const, confidence: 98, label: "attribut structuré" }
    : findValue(input, /\b(1[0-9]|[2-9][0-9])(?:[.,](\d))?\s*(?:pouces?|inch(?:es)?|\")\b/) ||
      (family === "MacBook Pro" || family === "MacBook Air" || category === "tv"
        ? findValue(input, /\b(1[0-9]|[2-9][0-9])(?:[.,](\d))?\b/)
        : null);
  const screenSize = screenFound?.match ? Number(`${screenFound.match[1]}${screenFound.match[2] ? `.${screenFound.match[2]}` : ""}`) : null;
  if (screenSize && screenFound) evidences.push(evidence("screenSize", String(screenSize), screenFound.source, screenFound.confidence, `Taille d’écran explicite détectée dans le ${screenFound.label}.`));

  const storageStructured = structuredValue(input, /\b(?:storage|stockage|capacite)\b/);
  const storageFound = storageStructured
    ? { match: normalize(storageStructured).match(/\b(\d+(?:[.,]\d+)?)\s*(go|gb|to|tb)\b/), source: "structured_attribute" as const, confidence: 98, label: "attribut structuré" }
    : findValue(input, /\b(\d+(?:[.,]\d+)?)\s*(go|gb|to|tb)\b/);
  const storage = storageFound?.match ? `${storageFound.match[1].replace(",", ".")} ${/^(?:to|tb)$/i.test(storageFound.match[2]) ? "TB" : "GB"}` : null;
  if (storage && storageFound) evidences.push(evidence("storage", storage, storageFound.source, storageFound.confidence, `Capacité explicite détectée dans le ${storageFound.label}.`));

  const variants = [
    { value: "Touch Bar", pattern: /\btouch\s*bar\b/i }, { value: "Pro Max", pattern: /\bpro\s+max\b/i },
    { value: "OLED", pattern: /\boled\b/i }, { value: "Lite", pattern: /\blite\b/i }, { value: "Slim", pattern: /\bslim\b/i },
  ];
  const foundVariants = variants.filter((candidate) => candidate.pattern.test(normalize(allText)));
  const variant = foundVariants.length === 1 ? foundVariants[0].value : foundVariants.length > 1 ? null : v1.model?.match(/\b(Pro Max|Pro|Plus|Mini|OLED|Lite|Slim)\b/i)?.[1] || null;
  if (foundVariants.length > 1) contradictions.push(`Plusieurs variantes incompatibles sont mentionnées : ${foundVariants.map((item) => item.value).join(", ")}.`);
  if (variant) {
    const variantSource = texts.find((source) => normalize(source.text).includes(normalize(variant)));
    evidences.push(evidence("variant", variant, variantSource?.source || "v1", variantSource?.confidence || v1.productConfidence, "Variante explicitement reconnue."));
  }

  const generation = model?.match(/\b(?:iPhone\s+)?(\d{1,2}|M[1-4])\b/i)?.[1] || null;
  if (generation) evidences.push(evidence("generation", generation.toUpperCase(), "v1", v1.productConfidence, "Génération extraite du modèle V1."));

  const explicit = explicitReferences(input);
  const modelNumber = explicit.find((reference) => /^A\d{4}$/i.test(reference)) || null;
  const manufacturerReference = explicit.find((reference) => /^MacBookPro\d{1,2},\d$/i.test(reference)) || explicit.find((reference) => /^(?:CFI|CUH|SM)-/i.test(reference)) || null;
  const confirmedReference = explicit[0] || null;
  if (modelNumber) evidences.push(evidence("modelNumber", modelNumber, "explicit_reference", 100, "Numéro de modèle explicitement présent dans l’annonce."));
  if (manufacturerReference) evidences.push(evidence("manufacturerReference", manufacturerReference, "explicit_reference", 100, "Référence constructeur explicitement présente dans l’annonce."));
  if (confirmedReference) evidences.push({ ...evidence("modelNumber", confirmedReference, "explicit_reference", 100, "Référence confirmée par sa présence littérale."), field: "confirmedReference" });

  const base: ResolvedProductIdentity = {
    category, brand, family, model, generation: generation?.toUpperCase() || null, variant,
    screenSize, storage, year, modelNumber, manufacturerReference,
    probableReferences: [], confirmedReference, confidence: 0, evidences, contradictions,
  };
  const catalogRule = REFERENCE_CATALOG.find((rule) =>
    base.brand === rule.matches.brand && base.family === rule.matches.family &&
    (rule.matches.year === undefined || base.year === rule.matches.year) &&
    (rule.matches.screenSize === undefined || base.screenSize === rule.matches.screenSize) &&
    (rule.matches.variant === undefined || base.variant === rule.matches.variant));
  if (catalogRule) {
    base.probableReferences = catalogRule.references.map((item) => {
      const proof: IdentityEvidence = { field: "probableReferences", value: item.reference, source: "catalog", confidence: catalogRule.confidence, detail: catalogRule.rationale };
      base.evidences.push(proof);
      return { ...item, confidence: catalogRule.confidence, evidences: [proof] };
    });
  }
  const identityFields = [base.brand, base.family, base.model, base.year, base.screenSize, base.variant, base.storage].filter((value) => value !== null).length;
  base.confidence = Math.max(0, Math.min(100, Math.round((v1.productConfidence + identityFields * 9 + (catalogRule ? 12 : 0) - contradictions.length * 18) / 2)));
  return base;
}
