import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateSelectedParts,
  buildPartSearchQueries,
  inferProbableParts,
  planParts,
  selectBestCandidates,
  toRepairEstimate,
} from "./index.ts";
import type { PartCandidate, PartSearchInput, PartType } from "./types.ts";

function input(overrides: Partial<PartSearchInput> = {}): PartSearchInput {
  return {
    category: "console",
    brand: "Sony",
    model: "PS5",
    reference: null,
    detectedFaults: ["hdmi_issue"],
    currency: "EUR",
    ...overrides,
  };
}

function candidate(
  id: string,
  partType: PartType,
  totalPrice: number,
  overrides: Partial<PartCandidate> = {},
): PartCandidate {
  return {
    id,
    partType,
    partName: "Pièce " + id,
    partReference: null,
    compatibleModels: ["PS5"],
    quantity: 1,
    unitPrice: totalPrice,
    currency: "EUR",
    shippingCost: 0,
    totalPrice,
    quality: "compatible",
    availability: "in_stock",
    provider: { id: "test", name: "Provider test", kind: "professional" },
    providerItemId: id,
    url: "https://example.test/" + id,
    imageUrl: null,
    seller: null,
    condition: null,
    itemLocation: null,
    buyingOptions: null,
    itemCreationDate: null,
    itemEndDate: null,
    retrievedAt: "2026-08-15T10:00:00Z",
    confidence: 80,
    compatibilityConfidence: 90,
    isCompatible: true,
    evidence: [],
    ...overrides,
  };
}

test("PS5 HDMI creates port and connector searches", () => {
  const queries = buildPartSearchQueries(input());
  assert.ok(queries.includes("PS5 HDMI port"));
  assert.ok(queries.includes("Sony PS5 HDMI connector"));
  assert.deepEqual(inferProbableParts(input()).map((part) => part.partType), ["hdmi_port", "hdmi_connector"]);
});

test("iPhone broken screen creates screen and display searches", () => {
  const result = input({
    category: "smartphone",
    brand: "Apple",
    model: "iPhone 13",
    detectedFaults: ["broken_screen"],
  });
  const queries = buildPartSearchQueries(result);
  assert.ok(queries.includes("iPhone 13 screen"));
  assert.ok(queries.includes("iPhone 13 display assembly"));
  assert.ok(inferProbableParts(result).some((part) => part.partType === "digitizer"));
});

test("Samsung TV backlight prioritizes an exact reference", () => {
  const result = input({
    category: "tv",
    brand: "Samsung",
    model: "QE55Q80",
    reference: "BN96-50351A",
    detectedFaults: ["backlight_issue"],
  });
  const queries = buildPartSearchQueries(result);
  assert.ok(queries.includes("Samsung QE55Q80 BN96-50351A LED strips"));
  assert.ok(inferProbableParts(result).some((part) => part.partType === "backlight_board"));
});

test("battery issue suggests a battery and unknown fault invents nothing", () => {
  assert.deepEqual(inferProbableParts(input({ detectedFaults: ["battery_issue"] })).map((part) => part.partType), ["battery"]);
  const unknown = planParts(input({ detectedFaults: ["unknown_fault"] }));
  assert.equal(unknown.status, "no_known_parts");
  assert.deepEqual(unknown.probableParts, []);
  assert.deepEqual(unknown.searchQueries, []);
});

test("best candidate excludes incompatible parts and prioritizes quality before price", () => {
  const incompatible = candidate("bad", "hdmi_port", 10, { isCompatible: false, quality: "original_oem" });
  const cheap = candidate("cheap", "hdmi_port", 20, { quality: "compatible" });
  const oem = candidate("oem", "hdmi_port", 50, { quality: "original_oem" });
  assert.deepEqual(selectBestCandidates([incompatible, cheap, oem], ["hdmi_port"]).map((item) => item.id), ["oem"]);
});

test("aggregation calculates costs only from selected compatible candidates", () => {
  const selected = candidate("selected", "hdmi_port", 35);
  const ignored = candidate("ignored", "hdmi_connector", 12);
  const incompatible = candidate("incompatible", "hdmi_connector", 5, { isCompatible: false });
  const plan = planParts(input());
  const result = aggregateSelectedParts(plan, [selected, ignored, incompatible], ["selected", "incompatible"]);

  assert.deepEqual(result.selectedCandidates.map((item) => item.id), ["selected"]);
  assert.equal(result.partsCostLow, 35);
  assert.equal(result.partsCostHigh, 35);
  assert.ok(result.evidence.some((item) => item.includes("incompatibles")));

  const repair = toRepairEstimate(result, {
    estimatedMinutesLow: null,
    estimatedMinutesHigh: null,
    difficulty: null,
    hiddenFaultRisk: null,
  });
  assert.equal(repair.partsCostLow, 35);
  assert.equal(repair.probableParts.length, 1);
});

test("aggregation preserves eBay provider state for the UI", () => {
  const plan = planParts(input());
  plan.providerDiagnostics = {
    ebayConfigured: true,
    ebayEnvironment: "sandbox",
    providerAvailable: true,
    ebayStatus: "no_results",
  };
  const result = aggregateSelectedParts(plan, [], []);

  assert.equal(result.providerDiagnostics?.ebayStatus, "no_results");
  assert.match(result.message, /eBay est configuré/);
  assert.doesNotMatch(result.message, /aucun fournisseur automatique/);
});
