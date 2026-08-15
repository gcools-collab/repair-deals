export type DealInput = {
  title: string;
  category: string;
  purchasePrice: number;
  partsCost: number;
  resalePrice: number;
  repairMinutes: number;
  repairConfidence: number;
  marketConfidence: number;
  hiddenFaultRisk: number;
  extraCosts?: number;
};

export type DealResult = {
  grossMargin: number;
  netMargin: number;
  roi: number;
  hourlyMargin: number;
  repairScore: number;
  marketScore: number;
  riskScore: number;
  dealScore: number;
  maxRecommendedPrice: number;
  recommendation: "GO" | "NEGOCIER" | "PASSER";
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function analyzeDeal(input: DealInput): DealResult {
  const extraCosts = input.extraCosts ?? 0;

  const totalCost =
    input.purchasePrice +
    input.partsCost +
    extraCosts;

  const grossMargin = input.resalePrice - totalCost;

  const safetyReserve =
    input.resalePrice *
    (input.hiddenFaultRisk / 100) *
    0.25;

  const netMargin = grossMargin - safetyReserve;

  const roi =
    totalCost > 0
      ? (netMargin / totalCost) * 100
      : 0;

  const hourlyMargin =
    input.repairMinutes > 0
      ? netMargin / (input.repairMinutes / 60)
      : netMargin;

  const repairScore = clamp(
    input.repairConfidence -
      input.hiddenFaultRisk * 0.45
  );

  const marketScore = clamp(
    input.marketConfidence
  );

  const riskScore = clamp(
    100 -
      input.hiddenFaultRisk -
      (100 - input.repairConfidence) * 0.4
  );

  const marginScore = clamp(
    netMargin <= 0 ? 0 : netMargin / 2
  );

  const roiScore = clamp(
    roi <= 0 ? 0 : roi
  );

  const timeScore = clamp(
    hourlyMargin <= 0 ? 0 : hourlyMargin / 2
  );

  const dealScore = Math.round(
    marginScore * 0.28 +
      roiScore * 0.22 +
      repairScore * 0.2 +
      marketScore * 0.15 +
      riskScore * 0.1 +
      timeScore * 0.05
  );

  const targetMargin = Math.max(
    40,
    input.resalePrice * 0.25
  );

  const maxRecommendedPrice = Math.max(
    0,
    Math.round(
      input.resalePrice -
        input.partsCost -
        extraCosts -
        safetyReserve -
        targetMargin
    )
  );

  let recommendation: DealResult["recommendation"] =
    "PASSER";

  if (
    dealScore >= 72 &&
    netMargin >= 50 &&
    roi >= 25
  ) {
    recommendation = "GO";
  } else if (
    dealScore >= 52 &&
    netMargin >= 25
  ) {
    recommendation = "NEGOCIER";
  }

  return {
    grossMargin: Math.round(grossMargin),
    netMargin: Math.round(netMargin),
    roi: Math.round(roi),
    hourlyMargin: Math.round(hourlyMargin),
    repairScore: Math.round(repairScore),
    marketScore: Math.round(marketScore),
    riskScore: Math.round(riskScore),
    dealScore,
    maxRecommendedPrice,
    recommendation,
  };
}
