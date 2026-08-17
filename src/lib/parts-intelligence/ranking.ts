import type { PrecisePartRequirement } from "../product-intelligence/part-requirements-types.ts";
import type { PartCandidate, PartQuality } from "./types.ts";
import type {
  PartRankingBadge,
  PartRankingProfile,
  PartRankingResult,
  RankedPartCandidate,
} from "./ranking-types.ts";

export const DEFAULT_PART_RANKING_PROFILE: PartRankingProfile = {
  weights: { compatibility: 40, quality: 20, landedCost: 15, seller: 10, delivery: 10, warranty: 5 },
  thresholds: { minimumRecommendedScore: 60, minimumRecommendedCompatibility: 65, contradictionExclusionPenalty: 60 },
  neutralScores: { landedCost: 35, seller: 45, delivery: 50, warranty: 50 },
};

const QUALITY_SCORES: Record<PartQuality, number> = {
  original_oem: 100,
  original_pulled: 90,
  premium_compatible: 80,
  refurbished: 70,
  compatible: 60,
  unknown: 40,
};

function normalize(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function phrasePresent(text: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase.length > 0 && (` ${text} `).includes(` ${normalizedPhrase} `);
}

function requirementId(requirement: PrecisePartRequirement) {
  return `${requirement.diagnosticFault}:${requirement.partType}:${normalize(requirement.normalizedPartName)}`;
}

const COMPATIBLE_PART_TYPES: Record<string, string[]> = {
  screen_assembly: ["screen_assembly", "display", "digitizer"],
  display: ["display", "screen_assembly"],
  hdmi_port: ["hdmi_port", "hdmi_connector"],
  hdmi_connector: ["hdmi_connector", "hdmi_port"],
  usb_c_connector: ["usb_c_connector", "charging_port"],
  charging_port: ["charging_port", "usb_c_connector"],
  led_strips: ["led_strips"],
  backlight_board: ["backlight_board"],
};

function compatibility(candidate: PartCandidate, requirement: PrecisePartRequirement) {
  const title = normalize(candidate.partName);
  const evidence: string[] = [];
  const warnings: string[] = [];
  const exclusionReasons: string[] = [];
  const negative = requirement.negativeKeywords.find((keyword) => phrasePresent(title, keyword));
  if (negative) exclusionReasons.push(`Mot-clé contradictoire ou accessoire détecté : ${negative}.`);
  if (candidate.isCompatible === false) exclusionReasons.push("Le provider a identifié une incompatibilité explicite.");

  const acceptedTypes = COMPATIBLE_PART_TYPES[requirement.partType] || [requirement.partType];
  if (candidate.partType && !acceptedTypes.includes(candidate.partType)) {
    exclusionReasons.push(`Type de pièce contradictoire : ${candidate.partType}.`);
  }

  let score = 0;
  const confirmed = requirement.confirmedReferences.find((item) => phrasePresent(title, item.reference));
  const probable = requirement.probableReferences.find((item) => phrasePresent(title, item.reference));
  if (confirmed) {
    score += 55;
    evidence.push(`Référence confirmée exacte « ${confirmed.reference} » présente.`);
  } else if (probable) {
    const points = 50 * (probable.confidence / 100);
    score += points;
    evidence.push(`Référence probable exacte « ${probable.reference} » présente, pondérée à ${probable.confidence}/100.`);
  }

  const model = requirement.compatibilityKeys.find((item) => item.key === "model");
  const variant = requirement.compatibilityKeys.find((item) => item.key === "variant");
  const family = requirement.compatibilityKeys.find((item) => item.key === "family");
  const year = requirement.compatibilityKeys.find((item) => item.key === "year");
  if (model && phrasePresent(title, model.value)) {
    score += 48;
    evidence.push(`Modèle exact « ${model.value} » présent.`);
  } else if (family && phrasePresent(title, family.value)) {
    score += 14;
    evidence.push(`Famille générique « ${family.value} » présente.`);
  }
  if (variant && phrasePresent(title, variant.value)) {
    score += 12;
    evidence.push(`Variante exacte « ${variant.value} » présente.`);
  }
  if (year && phrasePresent(title, year.value)) {
    score += 6;
    evidence.push(`Année « ${year.value} » présente.`);
  }
  const positiveMatches = requirement.positiveKeywords.filter((keyword) => phrasePresent(title, keyword));
  score += Math.min(22, positiveMatches.length * 7);
  if (positiveMatches.length > 0) evidence.push(`Termes de pièce reconnus : ${positiveMatches.join(", ")}.`);
  if (candidate.partType && acceptedTypes.includes(candidate.partType)) score += 18;
  if (typeof candidate.compatibilityConfidence === "number") {
    score = Math.max(score, candidate.compatibilityConfidence * 0.75);
    evidence.push(`Confiance provider prise comme signal secondaire : ${candidate.compatibilityConfidence}/100.`);
  }
  if (!confirmed && !probable && (!model || !phrasePresent(title, model.value))) warnings.push("Aucune référence ni modèle exact n’est confirmé dans le titre.");
  return { score: exclusionReasons.length > 0 ? 0 : clamp(score), evidence, warnings, exclusionReasons };
}

function quality(candidate: PartCandidate) {
  const selected = candidate.quality || "unknown";
  let score = QUALITY_SCORES[selected];
  const textOnly = candidate.evidence.some((item) => /titre|termes|sugg/i.test(normalize(item)));
  const evidence = [`Qualité ${selected} : base ${score}/100.`];
  if (textOnly && (selected === "original_oem" || selected === "original_pulled")) {
    const reduction = selected === "original_oem" ? 20 : 10;
    score -= reduction;
    evidence.push(`Indice vendeur textuel uniquement : réduction de ${reduction} points, sans authentification OEM.`);
  }
  return { score, evidence };
}

function landedCost(candidate: PartCandidate) {
  if (candidate.unitPrice === null || candidate.quantity === null || candidate.shippingCost === null) return null;
  if (![candidate.unitPrice, candidate.quantity, candidate.shippingCost].every(Number.isFinite)) return null;
  return Math.round((candidate.unitPrice * candidate.quantity + candidate.shippingCost) * 100) / 100;
}

function priceScores(costs: Array<number | null>, neutral: number) {
  const known = costs.filter((value): value is number => value !== null);
  if (known.length === 0) return costs.map(() => neutral);
  const min = Math.min(...known);
  const max = Math.max(...known);
  return costs.map((cost) => {
    if (cost === null) return neutral;
    if (min === max) return 75;
    return clamp(40 + 60 * ((max - cost) / (max - min)));
  });
}

function seller(candidate: PartCandidate, neutral: number) {
  const metadata = candidate.sellerMetadata;
  if (!metadata || metadata.feedbackPercentage === null || metadata.feedbackCount === null) {
    return { score: candidate.seller ? neutral : Math.max(0, neutral - 5), warning: "Fiabilité vendeur insuffisamment documentée." };
  }
  const percentage = Math.max(0, Math.min(100, metadata.feedbackPercentage));
  const volume = Math.min(1, Math.log10(metadata.feedbackCount + 1) / 5);
  const score = clamp(percentage * 0.7 + volume * 30 + (metadata.topRated ? 5 : 0));
  return { score, warning: metadata.feedbackCount < 10 || percentage < 95 ? "Vendeur peu documenté ou taux d’évaluations prudent." : null };
}

function delivery(candidate: PartCandidate, now: Date, neutral: number) {
  const maxDate = candidate.deliveryEstimate?.maxDate;
  if (!maxDate) return { score: neutral, days: null, warning: "Délai de livraison inconnu." };
  const timestamp = Date.parse(maxDate);
  if (!Number.isFinite(timestamp)) return { score: neutral, days: null, warning: "Délai de livraison invalide ou inconnu." };
  const days = Math.max(0, Math.ceil((timestamp - now.getTime()) / 86_400_000));
  return { score: clamp(100 - Math.max(0, days - 2) * 7), days, warning: null };
}

function warranty(candidate: PartCandidate, neutral: number) {
  const policy = candidate.returnPolicy;
  if (!policy || policy.returnsAccepted === null) return { score: neutral, warning: "Garantie et politique de retour inconnues." };
  let score = policy.returnsAccepted ? 82 : 20;
  if (policy.returnPeriodDays !== null && policy.returnPeriodDays >= 30) score += 8;
  if (policy.warranty) score += 10;
  return { score: clamp(score), warning: policy.returnsAccepted ? null : "Retours non acceptés." };
}

function riskPenalty(candidate: PartCandidate, compatibilityScore: number, exclusionReasons: string[]) {
  if (exclusionReasons.length > 0) return 100;
  const title = normalize(candidate.partName);
  let penalty = 0;
  if (compatibilityScore < 75) penalty += 15;
  if (!candidate.quality || candidate.quality === "unknown") penalty += 10;
  if (candidate.shippingCost === null) penalty += 8;
  if (!candidate.sellerMetadata?.feedbackCount) penalty += 6;
  if (!candidate.deliveryEstimate?.maxDate) penalty += 5;
  if (/\b(for parts|parts only|pour pieces)\b/.test(title)) penalty += 25;
  if (/\b(lot|bundle|job lot)\b/.test(title)) penalty += 12;
  return Math.min(60, penalty);
}

function addBadge(candidate: RankedPartCandidate | null, badge: PartRankingBadge) {
  if (candidate && !candidate.badges.includes(badge)) candidate.badges.push(badge);
}

function firstEligible(items: RankedPartCandidate[]) {
  return items.find((item) => item.eligible) || null;
}

export function rankPartCandidates(
  requirement: PrecisePartRequirement,
  candidates: PartCandidate[],
  options: { profile?: PartRankingProfile; now?: Date } = {},
): PartRankingResult {
  const profile = options.profile || DEFAULT_PART_RANKING_PROFILE;
  const now = options.now || new Date();
  const costs = candidates.map(landedCost);
  const costScores = priceScores(costs, profile.neutralScores.landedCost);
  const weightTotal = Object.values(profile.weights).reduce((sum, value) => sum + value, 0);
  const ranked = candidates.map((candidate, index): RankedPartCandidate => {
    const compatible = compatibility(candidate, requirement);
    const qualityResult = quality(candidate);
    const sellerResult = seller(candidate, profile.neutralScores.seller);
    const deliveryResult = delivery(candidate, now, profile.neutralScores.delivery);
    const warrantyResult = warranty(candidate, profile.neutralScores.warranty);
    const penalty = riskPenalty(candidate, compatible.score, compatible.exclusionReasons);
    const weighted = (
      compatible.score * profile.weights.compatibility + qualityResult.score * profile.weights.quality +
      costScores[index] * profile.weights.landedCost + sellerResult.score * profile.weights.seller +
      deliveryResult.score * profile.weights.delivery + warrantyResult.score * profile.weights.warranty
    ) / weightTotal;
    const warnings = [sellerResult.warning, deliveryResult.warning, warrantyResult.warning, ...compatible.warnings]
      .filter((value): value is string => Boolean(value));
    if (costs[index] === null) warnings.push("Coût rendu inconnu : livraison ou prix incomplet, aucune gratuité supposée.");
    return {
      candidate, requirementId: requirementId(requirement), compatibilityScore: compatible.score,
      qualityScore: qualityResult.score, landedCost: costs[index], landedCostScore: costScores[index],
      sellerScore: sellerResult.score, deliveryScore: deliveryResult.score, warrantyScore: warrantyResult.score,
      riskPenalty: penalty, overallScore: compatible.exclusionReasons.length > 0 ? 0 : clamp(weighted - penalty),
      eligible: compatible.exclusionReasons.length === 0, exclusionReasons: compatible.exclusionReasons,
      badges: [], warnings, evidence: [...compatible.evidence, ...qualityResult.evidence],
    };
  }).sort((left, right) => right.overallScore - left.overallScore || right.compatibilityScore - left.compatibilityScore);

  const eligible = ranked.filter((item) => item.eligible);
  const recommendedCandidate = firstEligible(ranked);
  const recommended = recommendedCandidate && recommendedCandidate.overallScore >= profile.thresholds.minimumRecommendedScore && recommendedCandidate.compatibilityScore >= profile.thresholds.minimumRecommendedCompatibility ? recommendedCandidate : null;
  const cheapest = [...eligible].filter((item) => item.landedCost !== null).sort((left, right) => (left.landedCost as number) - (right.landedCost as number))[0] || null;
  const fastest = [...eligible].filter((item) => item.candidate.deliveryEstimate?.maxDate).sort((left, right) => Date.parse(left.candidate.deliveryEstimate!.maxDate!) - Date.parse(right.candidate.deliveryEstimate!.maxDate!))[0] || null;
  const safest = [...eligible].sort((left, right) => (right.compatibilityScore + right.sellerScore + right.warrantyScore - right.riskPenalty) - (left.compatibilityScore + left.sellerScore + left.warrantyScore - left.riskPenalty))[0] || null;
  const bestValue = [...eligible].sort((left, right) => (right.overallScore * 0.75 + right.landedCostScore * 0.25) - (left.overallScore * 0.75 + left.landedCostScore * 0.25))[0] || null;
  const highestCompatibility = [...eligible].sort((left, right) => right.compatibilityScore - left.compatibilityScore)[0] || null;
  addBadge(recommended, "recommended");
  addBadge(bestValue, "best_value");
  addBadge(cheapest, "cheapest");
  addBadge(fastest, "fastest");
  addBadge(safest, "safest");
  addBadge(highestCompatibility, "highest_compatibility");
  ranked.filter((item) => item.candidate.quality === "original_oem" || item.candidate.quality === "original_pulled").forEach((item) => addBadge(item, "oem"));
  return { requirement, recommended, bestValue, cheapest, fastest, safest, allRanked: ranked };
}
