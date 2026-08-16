import type {
  FinancialAnalysis,
  FinancialAnalysisInput,
  MarketEstimate,
  RepairEstimate,
} from "./types.ts";

export * from "./types.ts";

function isKnown(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function validateNullableAmount(value: number | null | undefined, label: string, errors: string[]) {
  if (isKnown(value) && (!Number.isFinite(value) || value < 0)) errors.push(`${label} doit être un nombre positif`);
}

function validatePercentage(value: number | null, label: string, errors: string[]) {
  if (isKnown(value) && (!Number.isFinite(value) || value < 0 || value > 100)) errors.push(`${label} doit être compris entre 0 et 100`);
}

export function validateMarketEstimate(estimate: MarketEstimate) {
  const errors: string[] = [];
  validateNullableAmount(estimate.lowPrice, "Prix marché bas", errors);
  validateNullableAmount(estimate.medianPrice, "Prix marché médian", errors);
  validateNullableAmount(estimate.highPrice, "Prix marché haut", errors);
  validatePercentage(estimate.confidence, "Confiance marché", errors);
  if (isKnown(estimate.sampleSize) && (!Number.isInteger(estimate.sampleSize) || estimate.sampleSize < 0)) {
    errors.push("Le nombre de comparables doit être un entier positif");
  }
  if (isKnown(estimate.lowPrice) && isKnown(estimate.medianPrice) && estimate.lowPrice > estimate.medianPrice) {
    errors.push("Le prix marché bas ne peut pas dépasser la médiane");
  }
  if (isKnown(estimate.medianPrice) && isKnown(estimate.highPrice) && estimate.medianPrice > estimate.highPrice) {
    errors.push("Le prix marché médian ne peut pas dépasser le prix haut");
  }
  return errors;
}

export function validateRepairEstimate(estimate: RepairEstimate) {
  const errors: string[] = [];
  validateNullableAmount(estimate.partsCostLow, "Coût pièces bas", errors);
  validateNullableAmount(estimate.partsCostHigh, "Coût pièces haut", errors);
  validateNullableAmount(estimate.estimatedMinutesLow, "Durée basse", errors);
  validateNullableAmount(estimate.estimatedMinutesHigh, "Durée haute", errors);
  validatePercentage(estimate.hiddenFaultRisk, "Risque de panne cachée", errors);
  validatePercentage(estimate.confidence, "Confiance réparation", errors);
  if (isKnown(estimate.partsCostLow) && isKnown(estimate.partsCostHigh) && estimate.partsCostLow > estimate.partsCostHigh) {
    errors.push("Le coût pièces bas ne peut pas dépasser le coût haut");
  }
  if (isKnown(estimate.estimatedMinutesLow) && isKnown(estimate.estimatedMinutesHigh) && estimate.estimatedMinutesLow > estimate.estimatedMinutesHigh) {
    errors.push("La durée basse ne peut pas dépasser la durée haute");
  }
  estimate.probableParts.forEach((part, index) => {
    if (!part.name.trim()) errors.push(`La pièce ${index + 1} doit avoir un nom`);
    if (!Number.isInteger(part.quantity) || part.quantity < 1) errors.push(`La quantité de la pièce ${index + 1} est invalide`);
    validateNullableAmount(part.unitPriceLow, `Prix bas de la pièce ${index + 1}`, errors);
    validateNullableAmount(part.unitPriceHigh, `Prix haut de la pièce ${index + 1}`, errors);
    if (isKnown(part.unitPriceLow) && isKnown(part.unitPriceHigh) && part.unitPriceLow > part.unitPriceHigh) {
      errors.push(`Le prix bas de la pièce ${index + 1} dépasse son prix haut`);
    }
  });
  return errors;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyAnalysis(errors: string[]): FinancialAnalysis {
  return {
    estimatedTotalCostLow: null,
    estimatedTotalCostHigh: null,
    grossMarginLow: null,
    grossMarginHigh: null,
    roiLow: null,
    roiHigh: null,
    maxRecommendedPurchasePrice: null,
    financialConfidence: null,
    readiness: "incomplete",
    validationErrors: errors,
  };
}

export function analyzeFinancials(input: FinancialAnalysisInput): FinancialAnalysis {
  const errors = [
    ...validateMarketEstimate(input.marketEstimate),
    ...validateRepairEstimate(input.repairEstimate),
  ];
  validateNullableAmount(input.purchasePrice, "Prix d’achat", errors);
  validateNullableAmount(input.extraCosts, "Frais supplémentaires", errors);
  validateNullableAmount(input.safetyMargin, "Marge de sécurité", errors);
  if (errors.length > 0) return emptyAnalysis(errors);

  const { marketEstimate: market, repairEstimate: repair } = input;
  const hasRepairCost = isKnown(repair.partsCostLow) || isKnown(repair.partsCostHigh);
  if (!isKnown(input.purchasePrice) || !isKnown(market.medianPrice) || !hasRepairCost || !isKnown(input.extraCosts)) {
    return emptyAnalysis([]);
  }

  const extraCosts = input.extraCosts;
  const safetyMargin = input.safetyMargin ?? 0;
  const riskRate = isKnown(repair.hiddenFaultRisk) ? repair.hiddenFaultRisk / 100 : null;
  const fullRanges = isKnown(market.lowPrice) && isKnown(market.highPrice) &&
    isKnown(repair.partsCostLow) && isKnown(repair.partsCostHigh) && isKnown(riskRate);
  const readiness = fullRanges ? "ready" : "estimable";

  const riskReserveLow = isKnown(repair.partsCostLow) && isKnown(riskRate) ? repair.partsCostLow * riskRate : null;
  const riskReserveHigh = isKnown(repair.partsCostHigh) && isKnown(riskRate) ? repair.partsCostHigh * riskRate : null;
  const totalLow = isKnown(repair.partsCostLow) && isKnown(riskReserveLow)
    ? input.purchasePrice + repair.partsCostLow + extraCosts + safetyMargin + riskReserveLow
    : null;
  const totalHigh = isKnown(repair.partsCostHigh) && isKnown(riskReserveHigh)
    ? input.purchasePrice + repair.partsCostHigh + extraCosts + safetyMargin + riskReserveHigh
    : null;
  const marginLow = isKnown(market.lowPrice) && isKnown(totalHigh) ? market.lowPrice - totalHigh : null;
  const marginHigh = isKnown(market.highPrice) && isKnown(totalLow) ? market.highPrice - totalLow : null;
  const roiLow = isKnown(marginLow) && isKnown(totalHigh) && totalHigh > 0 ? (marginLow / totalHigh) * 100 : null;
  const roiHigh = isKnown(marginHigh) && isKnown(totalLow) && totalLow > 0 ? (marginHigh / totalLow) * 100 : null;
  const maxPurchase = isKnown(repair.partsCostHigh) && isKnown(riskReserveHigh)
    ? Math.max(0, market.medianPrice - repair.partsCostHigh - extraCosts - safetyMargin - riskReserveHigh)
    : null;
  const financialConfidence = isKnown(market.confidence) && isKnown(repair.confidence)
    ? Math.min(market.confidence, repair.confidence)
    : null;

  return {
    estimatedTotalCostLow: isKnown(totalLow) ? round(totalLow) : null,
    estimatedTotalCostHigh: isKnown(totalHigh) ? round(totalHigh) : null,
    grossMarginLow: isKnown(marginLow) ? round(marginLow) : null,
    grossMarginHigh: isKnown(marginHigh) ? round(marginHigh) : null,
    roiLow: isKnown(roiLow) ? round(roiLow) : null,
    roiHigh: isKnown(roiHigh) ? round(roiHigh) : null,
    maxRecommendedPurchasePrice: isKnown(maxPurchase) ? round(maxPurchase) : null,
    financialConfidence,
    readiness,
    validationErrors: [],
  };
}
