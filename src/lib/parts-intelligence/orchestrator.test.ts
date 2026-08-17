import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductV2 } from "../product-intelligence/index.ts";
import { orchestrateTieredPartsSearch } from "./orchestrator.ts";
import type { TieredPartsSearchInput } from "./orchestrator-types.ts";
import type { PartCandidate, PartProvider, PartProviderDescriptor, PartSearchInput, PartType } from "./types.ts";

const NOW = new Date("2026-08-17T00:00:00.000Z");

function candidate(id: string, title: string, partType: PartType = "screen_assembly", price = 100): PartCandidate {
  return {
    id, partType, partName: title, partReference: null, compatibleModels: null, quantity: 1,
    unitPrice: price, currency: "EUR", shippingCost: 4, totalPrice: price + 4,
    quality: "compatible", availability: "in_stock", provider: { id: "fake", name: "Fake", kind: "official_api" },
    providerItemId: id, url: `https://parts.test/${id}`, imageUrl: null, seller: "trusted",
    sellerMetadata: { username: "trusted", feedbackPercentage: 99.8, feedbackCount: 50_000, topRated: true },
    condition: "New", itemLocation: { countryCode: "FR", postalCode: null }, buyingOptions: ["FIXED_PRICE"],
    itemCreationDate: null, itemEndDate: null,
    deliveryEstimate: { minDate: "2026-08-19T00:00:00.000Z", maxDate: "2026-08-20T00:00:00.000Z" },
    returnPolicy: { returnsAccepted: true, returnPeriodDays: 30, warranty: null }, retrievedAt: NOW.toISOString(),
    confidence: 90, compatibilityConfidence: 90, isCompatible: null, evidence: ["Candidat de test traçable."],
  };
}

class FakeProvider implements PartProvider {
  readonly descriptor: PartProviderDescriptor = { id: "fake", name: "Fake", kind: "official_api" };
  readonly calls: string[][] = [];
  constructor(private readonly responder: (queries: string[], call: number) => PartCandidate[]) {}
  async search(_input: PartSearchInput, queries: string[]) {
    this.calls.push(queries);
    return this.responder(queries, this.calls.length);
  }
}

function scenario(title: string, provider: PartProvider, searchAlternatives = false) {
  const product = analyzeProductV2({ title });
  const input: TieredPartsSearchInput = {
    resolvedIdentity: product.product,
    diagnostics: product.diagnostics,
    partRequirements: product.partRequirements,
    providerInput: {
      category: product.product.category, brand: product.product.brand, model: product.product.model,
      reference: product.product.confirmedReference, detectedFaults: product.v1Analysis.detectedFaults, currency: "EUR",
    },
    providers: [provider], config: { searchAlternatives }, now: NOW,
  };
  return {
    product,
    input,
  };
}

test("MacBook A1706 stops after tier 2 when quality thresholds are met", async () => {
  const provider = new FakeProvider(() => [
    candidate("a", "A1706 display assembly"), candidate("b", "A1706 screen display assembly", "screen_assembly", 110),
    candidate("c", "MacBookPro13,2 display assembly", "screen_assembly", 120),
  ]);
  const { input } = scenario("MacBook Pro 13 2016 Touch Bar écran cassé", provider);
  const result = await orchestrateTieredPartsSearch(input);
  const primary = result.primaryResults[0];
  assert.equal(primary.stopReason, "quality_thresholds_met");
  assert.equal(primary.tierUsed, 2);
  assert.deepEqual(primary.tiersAttempted.map((item) => item.tier), [2]);
  assert.equal(provider.calls.length, 1);
});

test("an insufficient probable-reference tier falls back to tier 3 and only then tier 4", async () => {
  const provider = new FakeProvider((queries) => {
    if (queries.some((query) => query.includes("A1706"))) return [candidate("weak", "Generic MacBook display", "screen_assembly", 80)];
    if (queries.some((query) => query.includes("2016"))) return [
      candidate("m1", "MacBook Pro 13 2016 Touch Bar display assembly"),
      candidate("m2", "MacBook Pro 13 2016 Touch Bar screen assembly", "screen_assembly", 105),
      candidate("m3", "Apple MacBook Pro 13 2016 Touch Bar display", "screen_assembly", 110),
    ];
    return [];
  });
  const { input } = scenario("MacBook Pro 13 2016 Touch Bar écran cassé", provider);
  const result = await orchestrateTieredPartsSearch(input);
  assert.deepEqual(result.primaryResults[0].tiersAttempted.map((item) => item.tier), [2, 3]);
  assert.equal(result.primaryResults[0].tierUsed, 3);

  const emptyProvider = new FakeProvider(() => []);
  const emptyScenario = scenario("MacBook Pro 13 2016 Touch Bar écran cassé", emptyProvider);
  const exhausted = await orchestrateTieredPartsSearch(emptyScenario.input);
  assert.deepEqual(exhausted.primaryResults[0].tiersAttempted.map((item) => item.tier), [2, 3, 4]);
  assert.equal(exhausted.primaryResults[0].stopReason, "tiers_exhausted");
});

test("iPhone 13 excludes Pro variants and stops early on exact tier 3 results", async () => {
  const provider = new FakeProvider(() => [
    candidate("exact-1", "iPhone 13 display assembly"),
    candidate("pro", "iPhone 13 Pro display assembly"),
    candidate("exact-2", "Compatible screen display assembly iPhone 13", "screen_assembly", 90),
    candidate("exact-3", "Apple iPhone 13 screen assembly", "screen_assembly", 105),
  ]);
  const { input } = scenario("iPhone 13 écran cassé", provider);
  const result = await orchestrateTieredPartsSearch(input);
  const primary = result.primaryResults[0];
  assert.deepEqual(primary.tiersAttempted.map((item) => item.tier), [3]);
  assert.equal(primary.ranking.allRanked.find((item) => item.candidate.id === "pro")?.eligible, false);
  assert.equal(primary.stopReason, "quality_thresholds_met");
});

test("PS5 excludes cable and service and stops with exact HDMI ports", async () => {
  const provider = new FakeProvider(() => [
    candidate("port-1", "Sony PS5 HDMI port", "hdmi_port", 18),
    candidate("port-2", "PS5 HDMI port connector", "hdmi_port", 20),
    candidate("connector", "Sony PS5 HDMI connector socket", "hdmi_connector", 15),
    candidate("cable", "PS5 HDMI cable", "hdmi_port", 5),
    candidate("service", "PS5 HDMI repair service", "hdmi_port", 45),
  ]);
  const { input } = scenario("PS5 HDMI HS", provider);
  const result = await orchestrateTieredPartsSearch(input);
  const primary = result.primaryResults[0];
  assert.equal(primary.stopReason, "quality_thresholds_met");
  assert.equal(primary.ranking.allRanked.find((item) => item.candidate.id === "cable")?.eligible, false);
  assert.equal(primary.ranking.allRanked.find((item) => item.candidate.id === "service")?.eligible, false);
});

test("primary display assembly and flex-cable alternative stay in separate ranked groups", async () => {
  const provider = new FakeProvider((queries) => {
    const query = queries.join(" ").toLowerCase();
    if (query.includes("flex")) return [candidate("flex", "A1706 display flex cable", "display")];
    return [candidate("assembly", "A1706 display assembly")];
  });
  const { input } = scenario("MacBook Pro 13 2016 Touch Bar écran cassé", provider, true);
  const result = await orchestrateTieredPartsSearch(input);
  const primary = result.primaryResults.find((item) => item.requirement.normalizedPartName === "display assembly");
  const flex = result.alternativeResults.find((item) => item.requirement.normalizedPartName === "display flex cable");
  assert.deepEqual(primary?.candidates.map((item) => item.id), ["assembly"]);
  assert.deepEqual(flex?.candidates.map((item) => item.id), ["flex"]);
  assert.notEqual(primary?.ranking.requirement.normalizedPartName, flex?.ranking.requirement.normalizedPartName);
});

test("the same provider item returned by two tiers is counted once", async () => {
  const provider = new FakeProvider((_queries, call) => call === 1
    ? [candidate("same", "A1706 display assembly")]
    : [candidate("same", "A1706 display assembly"), candidate("other", "MacBook Pro 13 2016 Touch Bar display assembly")]);
  const { input } = scenario("MacBook Pro 13 2016 Touch Bar écran cassé", provider);
  input.config = { searchAlternatives: false, thresholds: { minimumAcceptableCandidates: 2 } };
  const result = await orchestrateTieredPartsSearch(input);
  assert.deepEqual(result.primaryResults[0].candidates.map((item) => item.id).sort(), ["other", "same"]);
  assert.equal(result.primaryResults[0].tiersAttempted[1].rawCandidateCount, 2);
  assert.equal(result.primaryResults[0].tiersAttempted[1].uniqueCandidateCount, 2);
});
