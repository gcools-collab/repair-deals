import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFinancials, type FinancialAnalysisInput, type MarketEstimate, type RepairEstimate } from "./index.ts";

const manualSource = { kind: "manual", name: "Saisie utilisateur" } as const;

function market(overrides: Partial<MarketEstimate> = {}): MarketEstimate {
  return {
    lowPrice: 300,
    medianPrice: 320,
    highPrice: 340,
    confidence: null,
    sampleSize: null,
    source: manualSource,
    comparableItems: [],
    ...overrides,
  };
}

function repair(overrides: Partial<RepairEstimate> = {}): RepairEstimate {
  return {
    probableParts: [],
    partsCostLow: 15,
    partsCostHigh: 25,
    estimatedMinutesLow: 60,
    estimatedMinutesHigh: 60,
    difficulty: null,
    hiddenFaultRisk: 0,
    confidence: null,
    source: manualSource,
    ...overrides,
  };
}

function input(overrides: Partial<FinancialAnalysisInput> = {}): FinancialAnalysisInput {
  return {
    purchasePrice: 120,
    marketEstimate: market(),
    repairEstimate: repair(),
    extraCosts: 10,
    ...overrides,
  };
}

test("calculates coherent low and high scenarios for a complete deal", () => {
  const result = analyzeFinancials(input());
  assert.equal(result.readiness, "ready");
  assert.equal(result.estimatedTotalCostLow, 145);
  assert.equal(result.estimatedTotalCostHigh, 155);
  assert.equal(result.grossMarginLow, 145);
  assert.equal(result.grossMarginHigh, 195);
  assert.equal(result.roiLow, 93.55);
  assert.equal(result.roiHigh, 134.48);
  assert.equal(result.maxRecommendedPurchasePrice, 285);
});

test("returns incomplete when the market median is unknown", () => {
  const result = analyzeFinancials(input({ marketEstimate: market({ medianPrice: null }) }));
  assert.equal(result.readiness, "incomplete");
  assert.equal(result.grossMarginLow, null);
  assert.equal(result.maxRecommendedPurchasePrice, null);
});

test("does not create a margin when repair cost is unknown", () => {
  const result = analyzeFinancials(input({ repairEstimate: repair({ partsCostLow: null, partsCostHigh: null }) }));
  assert.equal(result.readiness, "incomplete");
  assert.equal(result.estimatedTotalCostLow, null);
  assert.equal(result.grossMarginHigh, null);
});

test("clamps the recommended purchase price to zero for a negative deal", () => {
  const result = analyzeFinancials(input({
    marketEstimate: market({ lowPrice: 50, medianPrice: 60, highPrice: 70 }),
    repairEstimate: repair({ partsCostLow: 80, partsCostHigh: 90 }),
  }));
  assert.ok((result.grossMarginHigh ?? 0) < 0);
  assert.equal(result.maxRecommendedPurchasePrice, 0);
});

test("reduces the recommended price when hidden-fault risk rises", () => {
  const lowRisk = analyzeFinancials(input({ repairEstimate: repair({ hiddenFaultRisk: 0 }) }));
  const highRisk = analyzeFinancials(input({ repairEstimate: repair({ hiddenFaultRisk: 80 }) }));
  assert.ok(highRisk.maxRecommendedPurchasePrice !== null);
  assert.ok(lowRisk.maxRecommendedPurchasePrice !== null);
  assert.ok(highRisk.maxRecommendedPurchasePrice < lowRisk.maxRecommendedPurchasePrice);
  assert.equal(highRisk.maxRecommendedPurchasePrice, 265);
});

test("keeps risk-affected outputs empty until risk is confirmed", () => {
  const result = analyzeFinancials(input({ repairEstimate: repair({ hiddenFaultRisk: null }) }));
  assert.equal(result.readiness, "estimable");
  assert.equal(result.grossMarginLow, null);
  assert.equal(result.maxRecommendedPurchasePrice, null);
});
