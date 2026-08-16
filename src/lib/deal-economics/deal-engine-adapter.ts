import type { DealInput } from "../deal-engine.ts";
import type { FinancialAnalysisInput } from "./types.ts";
import type { FinancialAnalysis } from "./types.ts";

export function toDealEngineInput(
  identity: { title: string; category: string },
  economics: FinancialAnalysisInput,
  analysis: FinancialAnalysis,
): DealInput | null {
  const { marketEstimate: market, repairEstimate: repair } = economics;
  if (
    analysis.readiness !== "ready" ||
    economics.purchasePrice === null ||
    market.medianPrice === null ||
    market.confidence === null ||
    repair.partsCostLow === null ||
    repair.partsCostHigh === null ||
    repair.estimatedMinutesLow === null ||
    repair.estimatedMinutesHigh === null ||
    repair.hiddenFaultRisk === null ||
    repair.confidence === null
  ) return null;

  return {
    title: identity.title,
    category: identity.category,
    purchasePrice: economics.purchasePrice,
    partsCost: (repair.partsCostLow + repair.partsCostHigh) / 2,
    resalePrice: market.medianPrice,
    repairMinutes: (repair.estimatedMinutesLow + repair.estimatedMinutesHigh) / 2,
    repairConfidence: repair.confidence,
    marketConfidence: market.confidence,
    hiddenFaultRisk: repair.hiddenFaultRisk,
    extraCosts: economics.extraCosts ?? 0,
  };
}
