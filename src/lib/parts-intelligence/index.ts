import type { EstimateSource, ProbablePart, RepairEstimate } from "../deal-economics/types.ts";
import type { FaultType, ProductCategory } from "../product-analysis/types.ts";
import type {
  PartCandidate,
  PartEstimateResult,
  PartQuality,
  PartRequirement,
  PartSearchInput,
  PartType,
  RepairEstimateBase,
} from "./types.ts";

export * from "./types.ts";
export * from "./ranking-types.ts";
export * from "./ranking.ts";
export * from "./orchestrator-types.ts";
export * from "./orchestrator.ts";

type PartRule = {
  fault: FaultType;
  categories?: ProductCategory[];
  parts: Array<{ type: PartType; label: string; searchTerms: string[] }>;
};

const PART_RULES: readonly PartRule[] = [
  {
    fault: "broken_screen",
    categories: ["smartphone", "tablet", "wearable"],
    parts: [
      { type: "screen_assembly", label: "Bloc écran", searchTerms: ["screen", "screen assembly", "display assembly"] },
      { type: "display", label: "Écran / display", searchTerms: ["display"] },
      { type: "digitizer", label: "Vitre tactile / digitizer", searchTerms: ["digitizer"] },
    ],
  },
  {
    fault: "cracked_screen",
    categories: ["smartphone", "tablet", "wearable"],
    parts: [
      { type: "screen_assembly", label: "Bloc écran", searchTerms: ["screen", "screen assembly", "display assembly"] },
      { type: "display", label: "Écran / display", searchTerms: ["display"] },
      { type: "digitizer", label: "Vitre tactile / digitizer", searchTerms: ["digitizer"] },
    ],
  },
  {
    fault: "broken_screen",
    parts: [
      { type: "display", label: "Écran / dalle", searchTerms: ["display", "screen"] },
    ],
  },
  {
    fault: "cracked_screen",
    parts: [
      { type: "display", label: "Écran / dalle", searchTerms: ["display", "screen"] },
    ],
  },
  {
    fault: "charging_issue",
    parts: [
      { type: "charging_port", label: "Port de charge", searchTerms: ["charging port"] },
      { type: "charging_flex", label: "Nappe de charge", searchTerms: ["charging flex"] },
      { type: "usb_c_connector", label: "Connecteur USB-C", searchTerms: ["USB-C connector"] },
    ],
  },
  {
    fault: "battery_issue",
    parts: [{ type: "battery", label: "Batterie", searchTerms: ["battery"] }],
  },
  {
    fault: "hdmi_issue",
    parts: [
      { type: "hdmi_port", label: "Port HDMI", searchTerms: ["HDMI port"] },
      { type: "hdmi_connector", label: "Connecteur HDMI", searchTerms: ["HDMI connector"] },
    ],
  },
  {
    fault: "backlight_issue",
    categories: ["tv", "monitor"],
    parts: [
      { type: "led_strips", label: "Barres LED", searchTerms: ["LED strips", "backlight LED strips"] },
      { type: "backlight_board", label: "Carte de rétroéclairage", searchTerms: ["backlight board"] },
    ],
  },
  {
    fault: "storage_issue",
    categories: ["laptop", "desktop", "mac", "console"],
    parts: [
      { type: "ssd", label: "SSD", searchTerms: ["SSD"] },
      { type: "storage_module", label: "Module de stockage", searchTerms: ["storage module"] },
    ],
  },
  {
    fault: "controller_issue",
    parts: [
      { type: "joystick_module", label: "Module joystick", searchTerms: ["joystick module"] },
      { type: "controller_parts", label: "Pièces de manette", searchTerms: ["controller parts"] },
    ],
  },
];

const QUALITY_SCORE: Record<PartQuality, number> = {
  original_oem: 6,
  original_pulled: 5,
  premium_compatible: 4,
  refurbished: 3,
  compatible: 2,
  unknown: 0,
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function identityBases(input: PartSearchInput) {
  const brand = input.brand?.trim() || "";
  const model = input.model?.trim() || "";
  const reference = input.reference?.trim() || "";
  const bases: string[] = [];
  if (reference) bases.push([brand, model, reference].filter(Boolean).join(" "));
  if (model) {
    bases.push(model);
    if (brand && !model.toLowerCase().includes(brand.toLowerCase())) bases.push(brand + " " + model);
  }
  return [...new Set(bases.filter(Boolean))];
}

export function inferProbableParts(input: PartSearchInput): PartRequirement[] {
  const faults = input.confirmedFault ? [input.confirmedFault] : input.detectedFaults;
  const requirements: PartRequirement[] = [];
  for (const fault of faults) {
    const categoryRule = PART_RULES.find((rule) => rule.fault === fault && rule.categories?.includes(input.category));
    const fallbackRule = PART_RULES.find((rule) => rule.fault === fault && !rule.categories);
    const rule = categoryRule || fallbackRule;
    if (!rule) continue;
    for (const part of rule.parts) {
      if (requirements.some((candidate) => candidate.partType === part.type)) continue;
      requirements.push({
        partType: part.type,
        label: part.label,
        searchTerms: part.searchTerms,
        fault,
        evidence: "Type de pièce suggéré par la panne « " + fault + " » ; diagnostic à confirmer.",
      });
    }
  }
  return requirements;
}

export function buildPartSearchQueries(input: PartSearchInput) {
  const bases = identityBases(input);
  if (bases.length === 0) return [];
  const requirements = inferProbableParts(input);
  const queries: string[] = [];
  for (const requirement of requirements) {
    for (const term of requirement.searchTerms) {
      for (const base of bases) queries.push(base + " " + term);
    }
  }
  return [...new Set(queries)];
}

function qualityScore(quality: PartQuality | null) {
  return quality ? QUALITY_SCORE[quality] : 0;
}

function candidatePrice(candidate: PartCandidate) {
  return candidate.totalPrice ?? Number.POSITIVE_INFINITY;
}

export function selectBestCandidates(candidates: PartCandidate[], requiredTypes: PartType[]) {
  return requiredTypes.flatMap((partType) => {
    const compatible = candidates
      .filter((candidate) =>
        candidate.partType === partType &&
        candidate.isCompatible === true &&
        (candidate.compatibilityConfidence ?? 0) >= 85 &&
        candidate.currency === "EUR",
      )
      .sort((left, right) =>
        (right.compatibilityConfidence ?? 0) - (left.compatibilityConfidence ?? 0) ||
        qualityScore(right.quality) - qualityScore(left.quality) ||
        candidatePrice(left) - candidatePrice(right),
      );
    return compatible.length > 0 ? [compatible[0]] : [];
  });
}

function sourceFor(candidates: PartCandidate[]): EstimateSource | null {
  const names = [...new Set(candidates.map((candidate) => candidate.provider?.name).filter((name): name is string => Boolean(name)))];
  if (names.length === 0) return null;
  const manualOnly = candidates.every((candidate) => candidate.provider?.kind === "manual");
  return {
    kind: manualOnly ? "manual" : "provider",
    name: names.join(", "),
    retrievedAt: candidates.map((candidate) => candidate.retrievedAt).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
  };
}

export function aggregateSelectedParts(
  plan: Pick<PartEstimateResult, "probableParts" | "searchQueries" | "providerDiagnostics">,
  candidates: PartCandidate[],
  selectedIds: string[],
): PartEstimateResult {
  const selectedSet = new Set(selectedIds);
  const selectedCandidates = candidates.filter((candidate) =>
    selectedSet.has(candidate.id) && candidate.isCompatible !== false,
  );
  const invalidSelection = candidates.some((candidate) =>
    selectedSet.has(candidate.id) && candidate.isCompatible === false,
  );
  const completePrices = selectedCandidates.length > 0 && selectedCandidates.every((candidate) =>
    (candidate.partName?.trim().length ?? 0) > 0 &&
    candidate.currency === "EUR" &&
    candidate.totalPrice !== null &&
    Number.isFinite(candidate.totalPrice) && candidate.totalPrice >= 0,
  );
  const total = completePrices
    ? round(selectedCandidates.reduce((sum, candidate) => sum + (candidate.totalPrice as number), 0))
    : null;
  const confidences = selectedCandidates.map((candidate) => candidate.confidence);
  const confidence = selectedCandidates.length > 0 && confidences.every((value): value is number => value !== null)
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;
  const status = selectedCandidates.length === 0
    ? (plan.probableParts.length === 0 ? "no_known_parts" : "provider_required")
    : total === null ? "incomplete" : "estimated";

  return {
    status,
    message: status === "estimated"
      ? "Coût calculé uniquement à partir des pièces sélectionnées."
      : status === "incomplete"
        ? "Une pièce sélectionnée possède encore un prix ou des frais inconnus."
        : status === "no_known_parts"
          ? "Aucune pièce probable ne peut être suggérée pour cette panne."
          : plan.providerDiagnostics?.ebayStatus === "no_results"
            ? "eBay est configuré, mais aucun résultat n’a été trouvé."
            : plan.providerDiagnostics?.ebayStatus === "results_found"
              ? "Des candidats eBay ont été trouvés ; sélection manuelle requise faute de compatibilité suffisamment certaine."
              : "Des pièces probables sont suggérées, mais aucun fournisseur automatique n’est configuré.",
    probableParts: plan.probableParts,
    searchQueries: plan.searchQueries,
    candidates,
    selectedCandidates,
    partsCostLow: total,
    partsCostHigh: total,
    confidence,
    source: sourceFor(selectedCandidates),
    evidence: [
      ...plan.probableParts.map((part) => part.evidence),
      ...(invalidSelection ? ["Les candidats explicitement incompatibles ont été exclus du calcul."] : []),
      ...(selectedCandidates.some((candidate) => candidate.currency !== "EUR")
        ? ["Les candidats hors EUR restent informatifs et sont exclus de l’agrégation financière automatique."]
        : []),
    ],
    ...(plan.providerDiagnostics ? { providerDiagnostics: plan.providerDiagnostics } : {}),
  };
}

export function planParts(input: PartSearchInput): PartEstimateResult {
  const probableParts = inferProbableParts(input);
  return aggregateSelectedParts(
    { probableParts, searchQueries: buildPartSearchQueries(input) },
    [],
    [],
  );
}

export function toRepairEstimate(
  result: PartEstimateResult,
  base: RepairEstimateBase,
): RepairEstimate {
  const probableParts: ProbablePart[] = result.selectedCandidates.map((candidate) => ({
    name: candidate.partName ?? "",
    reference: candidate.partReference,
    quantity: candidate.quantity ?? 1,
    unitPriceLow: candidate.unitPrice,
    unitPriceHigh: candidate.unitPrice,
    source: candidate.provider ? {
      kind: candidate.provider.kind === "manual" ? "manual" : "provider",
      name: candidate.provider.name,
      url: candidate.url,
      retrievedAt: candidate.retrievedAt,
    } : null,
  }));
  return {
    probableParts,
    partsCostLow: result.partsCostLow,
    partsCostHigh: result.partsCostHigh,
    estimatedMinutesLow: base.estimatedMinutesLow,
    estimatedMinutesHigh: base.estimatedMinutesHigh,
    difficulty: base.difficulty,
    hiddenFaultRisk: base.hiddenFaultRisk,
    confidence: result.confidence,
    source: result.source,
  };
}
