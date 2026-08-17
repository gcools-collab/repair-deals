import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductV2 } from "../product-intelligence/index.ts";
import { createDealDecisionContext } from "./index.ts";
import type { DealDecisionContextInput } from "./types.ts";

function baseInput(): DealDecisionContextInput {
  const analysis = analyzeProductV2({ title: "MacBook Pro 13 2016 Touch Bar écran cassé" });
  return {
    listing: null,
    resolvedIdentity: analysis.product,
    diagnostics: analysis.diagnostics,
    selectedDiagnostic: analysis.diagnostics[0],
    partRequirements: analysis.partRequirements,
    partSearchResults: null,
    selectedParts: [],
    marketEstimate: null,
    repairEstimate: null,
    financialEstimate: null,
    purchaseBenefits: [],
  };
}

test("context exposes precise missing stages before a deal decision", () => {
  const context = createDealDecisionContext(baseInput());
  assert.equal(context.readiness.identityReady, true);
  assert.equal(context.readiness.diagnosticReady, true);
  assert.equal(context.readiness.partsReady, false);
  assert.equal(context.readiness.marketReady, false);
  assert.equal(context.readiness.currentStage, "diagnostic_ready");
  assert.ok(context.readiness.missing.includes("Au moins une pièce compatible sélectionnée"));
  assert.ok(context.warnings.some((warning) => warning.includes("Estimation marché")));
});

test("context reaches decision_ready only with parts, market and complete financial confidence", () => {
  const input = baseInput();
  input.selectedParts = [{
    id: "selected", partType: "screen_assembly", partName: "A1706 display assembly", partReference: null,
    compatibleModels: null, quantity: 1, unitPrice: 100, currency: "EUR", shippingCost: 5, totalPrice: 105,
    quality: "compatible", availability: "in_stock", provider: null, providerItemId: null, url: null, imageUrl: null,
    seller: null, condition: null, itemLocation: null, buyingOptions: null, itemCreationDate: null, itemEndDate: null,
    retrievedAt: null, confidence: 80, compatibilityConfidence: 90, isCompatible: true, evidence: [],
  }];
  input.marketEstimate = { lowPrice: 400, medianPrice: 450, highPrice: 500, confidence: 80, sampleSize: 8, source: null, comparableItems: [] };
  input.repairEstimate = { probableParts: [], partsCostLow: 105, partsCostHigh: 105, estimatedMinutesLow: 60, estimatedMinutesHigh: 90, difficulty: "hard", hiddenFaultRisk: 30, confidence: 75, source: null };
  input.financialEstimate = { estimatedTotalCostLow: 300, estimatedTotalCostHigh: 320, grossMarginLow: 80, grossMarginHigh: 200, roiLow: 25, roiHigh: 60, maxRecommendedPurchasePrice: 220, financialConfidence: 75, readiness: "ready", validationErrors: [] };
  const context = createDealDecisionContext(input);
  assert.equal(context.readiness.decisionReady, true);
  assert.equal(context.readiness.currentStage, "decision_ready");
  assert.deepEqual(context.readiness.missing, []);
});
