import type { DiagnosticCause, DiagnosticHypothesis, ResolvedProductIdentity } from "./types.ts";
import type {
  CompatibilityKey,
  PartQueryTier,
  PartReference,
  PrecisePartRequirement,
  PrecisePartRequirementsInput,
  PrecisePartRequirementsResult,
  PrecisePartType,
} from "./part-requirements-types.ts";

type CausePartRule = {
  pattern: RegExp;
  partType: PrecisePartType;
  normalizedPartName: string;
  aliases: string[];
  requiredAttributes: string[];
  optionalAttributes: string[];
  negativeKeywords: string[];
  warnings?: string[];
};

const GENERIC_NEGATIVES = ["case", "protector", "cable only", "repair service"];

const CAUSE_PART_RULES: readonly CausePartRule[] = [
  { pattern: /^display assembly$/i, partType: "screen_assembly", normalizedPartName: "display assembly", aliases: ["display assembly", "screen"], requiredAttributes: ["model compatibility"], optionalAttributes: ["part number", "color", "condition", "quality"], negativeKeywords: GENERIC_NEGATIVES, warnings: ["Un écran complet et un LCD seul ne sont pas interchangeables."] },
  { pattern: /^LCD panel$/i, partType: "display", normalizedPartName: "LCD panel", aliases: ["LCD panel"], requiredAttributes: ["model compatibility", "panel size"], optionalAttributes: ["panel reference", "condition"], negativeKeywords: GENERIC_NEGATIVES, warnings: ["Un LCD seul peut nécessiter le transfert de composants et n’est pas équivalent à un écran complet."] },
  { pattern: /^display flex cable$/i, partType: "display_flex", normalizedPartName: "display flex cable", aliases: ["display flex cable"], requiredAttributes: ["model compatibility"], optionalAttributes: ["cable reference"], negativeKeywords: ["display cable external", "repair service"] },
  { pattern: /^display connector$/i, partType: "display_connector", normalizedPartName: "display connector", aliases: ["display connector"], requiredAttributes: ["board compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["cable", "adapter", "repair service"] },
  { pattern: /^digitizer$/i, partType: "digitizer", normalizedPartName: "digitizer", aliases: ["digitizer"], requiredAttributes: ["model compatibility"], optionalAttributes: ["color"], negativeKeywords: GENERIC_NEGATIVES },
  { pattern: /^HDMI port$/i, partType: "hdmi_port", normalizedPartName: "HDMI port", aliases: ["HDMI port"], requiredAttributes: ["console revision compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["HDMI cable", "HDMI adapter", "repair service"] },
  { pattern: /^HDMI connector solder joints$/i, partType: "hdmi_connector", normalizedPartName: "HDMI connector", aliases: ["HDMI connector"], requiredAttributes: ["console revision compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["HDMI cable", "HDMI adapter", "repair service"] },
  { pattern: /^HDMI encoder circuit$/i, partType: "hdmi_circuit", normalizedPartName: "HDMI encoder circuit", aliases: ["HDMI encoder IC"], requiredAttributes: ["motherboard revision compatibility"], optionalAttributes: ["IC marking"], negativeKeywords: ["HDMI cable", "HDMI adapter", "repair service"] },
  { pattern: /^USB-C connector$/i, partType: "usb_c_connector", normalizedPartName: "USB-C charging port", aliases: ["USB-C charging port", "USB-C connector"], requiredAttributes: ["device revision compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["USB-C cable", "charger", "battery", "repair service"] },
  { pattern: /^charging port$/i, partType: "charging_port", normalizedPartName: "charging connector", aliases: ["charging connector", "charging port"], requiredAttributes: ["device revision compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["charging cable", "charger", "battery", "repair service"] },
  { pattern: /^charging flex cable$/i, partType: "charging_flex", normalizedPartName: "charging flex cable", aliases: ["charging flex cable"], requiredAttributes: ["model compatibility"], optionalAttributes: ["flex reference"], negativeKeywords: ["charging cable external", "battery", "repair service"] },
  { pattern: /^charging controller$/i, partType: "charging_controller", normalizedPartName: "charging controller", aliases: ["charging controller IC"], requiredAttributes: ["motherboard revision compatibility"], optionalAttributes: ["IC marking"], negativeKeywords: ["charger", "battery", "repair service"] },
  { pattern: /^LED backlight strips$/i, partType: "led_strips", normalizedPartName: "LED backlight strips", aliases: ["LED backlight strips", "backlight LED strips"], requiredAttributes: ["TV model compatibility", "screen size"], optionalAttributes: ["strip reference", "strip count"], negativeKeywords: ["LED bulb", "ambient light", "repair service"] },
  { pattern: /^backlight power board$/i, partType: "backlight_board", normalizedPartName: "backlight power board", aliases: ["backlight power board"], requiredAttributes: ["TV model compatibility"], optionalAttributes: ["board reference"], negativeKeywords: ["remote", "LED strip", "repair service"] },
  { pattern: /^panel connection$/i, partType: "panel_connection", normalizedPartName: "display panel connector", aliases: ["display panel connector"], requiredAttributes: ["TV model compatibility"], optionalAttributes: ["connector reference"], negativeKeywords: ["external cable", "repair service"] },
];

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function ruleForCause(cause: string) {
  return CAUSE_PART_RULES.find((rule) => rule.pattern.test(cause)) || null;
}

function confirmedReferences(product: ResolvedProductIdentity): PartReference[] {
  const references = [product.confirmedReference, product.manufacturerReference, product.modelNumber].filter((value): value is string => Boolean(value));
  return unique(references).map((reference) => ({ reference, confidence: 100 }));
}

function probableReferences(product: ResolvedProductIdentity, confirmed: PartReference[]) {
  const confirmedSet = new Set(confirmed.map((item) => item.reference.toLowerCase()));
  return product.probableReferences
    .filter((item) => !confirmedSet.has(item.reference.toLowerCase()))
    .map(({ reference, confidence }) => ({ reference, confidence }))
    .sort((left, right) => right.confidence - left.confidence);
}

function compatibilityKeys(product: ResolvedProductIdentity, confirmed: PartReference[], probable: PartReference[]): CompatibilityKey[] {
  const keys: CompatibilityKey[] = [];
  const add = (key: CompatibilityKey["key"], value: string | number | null, confidence = product.confidence) => {
    if (value !== null) keys.push({ key, value: String(value), confidence, source: "resolved_identity" });
  };
  add("brand", product.brand);
  add("family", product.family);
  add("model", product.model);
  add("generation", product.generation);
  add("variant", product.variant);
  add("year", product.year);
  add("screenSize", product.screenSize);
  add("storage", product.storage);
  confirmed.forEach((item) => keys.push({ key: "reference", value: item.reference, confidence: item.confidence, source: item.reference === product.confirmedReference ? "confirmed" : "explicit" }));
  probable.forEach((item) => keys.push({ key: "reference", value: item.reference, confidence: item.confidence, source: "probable" }));
  return keys;
}

function modelIdentity(product: ResolvedProductIdentity) {
  const values = [product.model || product.family];
  if (product.screenSize !== null && !values.some((value) => value?.includes(String(product.screenSize)))) values.push(String(product.screenSize));
  if (product.year !== null) values.push(String(product.year));
  if (product.generation && !values.some((value) => value?.toLowerCase().includes(product.generation!.toLowerCase()))) values.push(product.generation);
  if (product.variant && !values.some((value) => value?.toLowerCase().includes(product.variant!.toLowerCase()))) values.push(product.variant);
  return unique(values.filter((value): value is string => Boolean(value))).join(" ");
}

function familyIdentity(product: ResolvedProductIdentity) {
  return unique([
    product.family || "", product.screenSize === null ? "" : String(product.screenSize),
  ]).join(" ");
}

function buildQueryTiers(product: ResolvedProductIdentity, partName: string, aliases: string[], confirmed: PartReference[], probable: PartReference[]) {
  const tiers: PartQueryTier[] = [];
  for (const item of confirmed) tiers.push({ tier: 1, label: "Référence confirmée ou explicite", query: `${item.reference} ${partName}`, confidence: item.confidence, rationale: "La référence est explicitement présente dans l’identité produit." });
  for (const item of probable) tiers.push({ tier: 2, label: "Référence probable", query: `${item.reference} ${partName}`, confidence: item.confidence, rationale: "La référence provient du catalogue déterministe et reste non confirmée." });
  const model = modelIdentity(product);
  if (model) tiers.push({ tier: 3, label: "Modèle et caractéristiques", query: `${model} ${partName}`, confidence: product.confidence, rationale: "Repli sur le modèle résolu, son année et sa variante disponibles." });
  const family = familyIdentity(product);
  if (family && family !== model) tiers.push({ tier: 4, label: "Famille et caractéristiques", query: `${family} ${partName}`, confidence: Math.max(0, product.confidence - 15), rationale: "Dernier recours fondé sur la famille et les caractéristiques connues." });
  const supplemental: PartQueryTier[] = [];
  for (const alias of aliases.filter((alias) => alias.toLowerCase() !== partName.toLowerCase())) {
    for (const tier of tiers) supplemental.push({ ...tier, query: tier.query.slice(0, -partName.length) + alias, rationale: `${tier.rationale} Terme de pièce alternatif contrôlé.` });
  }
  if (product.brand && model && !model.toLowerCase().includes(product.brand.toLowerCase())) {
    supplemental.push({ tier: 3, label: "Marque, modèle et caractéristiques", query: `${product.brand} ${model} ${partName}`, confidence: product.confidence, rationale: "Variante du tier modèle incluant la marque explicite." });
  }
  return [...tiers, ...supplemental].filter((tier, index, all) => all.findIndex((candidate) => candidate.query.toLowerCase() === tier.query.toLowerCase()) === index);
}

function iphoneNegatives(product: ResolvedProductIdentity) {
  if (product.family !== "iPhone" || !product.generation) return [];
  const base = `iPhone ${product.generation}`;
  const variants = ["Pro Max", "Pro", "mini", "Plus"];
  return variants.filter((variant) => variant.toLowerCase() !== product.variant?.toLowerCase()).map((variant) => `${base} ${variant}`);
}

function warningsFor(product: ResolvedProductIdentity, rule: CausePartRule, probable: PartReference[]) {
  return unique([
    ...probable.map((item) => `${item.reference} est une référence probable (${item.confidence}/100), non confirmée.`),
    ...(product.family?.startsWith("MacBook") ? ["Vérifier la compatibilité exacte de l’année et de l’EMC lorsqu’il est fourni par le vendeur ; aucun EMC n’est déduit."] : []),
    ...(rule.warnings || []),
  ]);
}

function requirement(product: ResolvedProductIdentity, diagnostic: DiagnosticHypothesis, cause: DiagnosticCause): PrecisePartRequirement | null {
  const rule = ruleForCause(cause.cause);
  if (!rule) return null;
  const confirmed = confirmedReferences(product);
  const probable = probableReferences(product, confirmed);
  const queryTiers = buildQueryTiers(product, rule.normalizedPartName, rule.aliases, confirmed, probable);
  return {
    partType: rule.partType,
    normalizedPartName: rule.normalizedPartName,
    diagnosticFault: diagnostic.fault,
    diagnosticCause: cause.cause,
    compatibilityKeys: compatibilityKeys(product, confirmed, probable),
    confirmedReferences: confirmed,
    probableReferences: probable,
    searchQueries: queryTiers.map((tier) => tier.query),
    queryTiers,
    requiredAttributes: [...rule.requiredAttributes],
    optionalAttributes: [...rule.optionalAttributes],
    positiveKeywords: unique([...confirmed.map((item) => item.reference), ...probable.map((item) => item.reference), ...rule.aliases.flatMap((alias) => alias.split(" "))]),
    negativeKeywords: unique([...rule.negativeKeywords, ...iphoneNegatives(product)]),
    confidence: Math.round(Math.min(product.confidence, diagnostic.confidence, cause.confidence)),
    evidences: unique([...diagnostic.evidences, ...cause.evidences, `La cause « ${cause.cause} » correspond au besoin « ${rule.normalizedPartName} ».`]),
    warnings: warningsFor(product, rule, probable),
  };
}

function mergeRequirements(requirements: PrecisePartRequirement[]) {
  const merged = new Map<string, PrecisePartRequirement>();
  for (const item of requirements) {
    const key = `${item.partType}:${item.normalizedPartName.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, item);
    else merged.set(key, { ...existing, confidence: Math.max(existing.confidence, item.confidence), evidences: unique([...existing.evidences, ...item.evidences]), warnings: unique([...existing.warnings, ...item.warnings]) });
  }
  return [...merged.values()];
}

export function resolvePrecisePartRequirements(input: PrecisePartRequirementsInput): PrecisePartRequirementsResult {
  const primary: PrecisePartRequirement[] = [];
  const alternatives: PrecisePartRequirement[] = [];
  for (const diagnostic of input.diagnostics) {
    const causes = [...diagnostic.confirmedCauses, ...diagnostic.probableCauses].sort((left, right) => right.confidence - left.confidence);
    const generated = causes.map((cause) => requirement(input.product, diagnostic, cause)).filter((item): item is PrecisePartRequirement => item !== null);
    if (generated[0]) primary.push(generated[0]);
    alternatives.push(...generated.slice(1));
  }
  const primaryRequirements = mergeRequirements(primary);
  const primaryKeys = new Set(primaryRequirements.map((item) => `${item.partType}:${item.normalizedPartName.toLowerCase()}`));
  const alternativeRequirements = mergeRequirements(alternatives).filter((item) => !primaryKeys.has(`${item.partType}:${item.normalizedPartName.toLowerCase()}`));
  return {
    primaryRequirements,
    alternativeRequirements,
    warnings: unique([...primaryRequirements, ...alternativeRequirements].flatMap((item) => item.warnings)),
    evidences: unique([...primaryRequirements, ...alternativeRequirements].flatMap((item) => item.evidences)),
  };
}
