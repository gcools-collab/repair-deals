import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductV2 } from "../product-intelligence/index.ts";
import { rankPartCandidates } from "./ranking.ts";
import type { PartCandidate, PartQuality, PartType } from "./types.ts";

const NOW = new Date("2026-08-17T00:00:00.000Z");

function candidate(
  id: string,
  title: string,
  options: {
    type?: PartType; quality?: PartQuality; price?: number; shipping?: number | null;
    feedback?: number | null; feedbackCount?: number | null; deliveryDays?: number | null;
    returns?: boolean | null; providerCompatibility?: number;
  } = {},
): PartCandidate {
  const shipping = options.shipping === undefined ? 4 : options.shipping;
  const price = options.price ?? 100;
  const feedback = options.feedback === undefined ? 99.8 : options.feedback;
  const feedbackCount = options.feedbackCount === undefined ? 50_000 : options.feedbackCount;
  const deliveryDays = options.deliveryDays === undefined ? 3 : options.deliveryDays;
  const maxDate = deliveryDays === null ? null : new Date(NOW.getTime() + deliveryDays * 86_400_000).toISOString();
  return {
    id, partType: options.type ?? "screen_assembly", partName: title, partReference: null,
    compatibleModels: null, quantity: 1, unitPrice: price, currency: "EUR", shippingCost: shipping,
    totalPrice: shipping === null ? null : price + shipping, quality: options.quality ?? "compatible",
    availability: "in_stock", provider: { id: "test", name: "Test", kind: "official_api" },
    providerItemId: id, url: null, imageUrl: null, seller: "seller-" + id,
    sellerMetadata: { username: "seller-" + id, feedbackPercentage: feedback, feedbackCount, topRated: false },
    condition: "Used", itemLocation: { countryCode: "FR", postalCode: null }, buyingOptions: ["FIXED_PRICE"],
    itemCreationDate: null, itemEndDate: null, deliveryEstimate: { minDate: maxDate, maxDate },
    returnPolicy: { returnsAccepted: options.returns === undefined ? true : options.returns, returnPeriodDays: 30, warranty: null },
    retrievedAt: NOW.toISOString(), confidence: options.providerCompatibility ?? 80,
    compatibilityConfidence: options.providerCompatibility ?? 80, isCompatible: null,
    evidence: [options.quality === "original_oem" || options.quality === "original_pulled" ? "Qualité suggérée par les termes du titre vendeur." : "Qualité classée prudemment."],
  };
}

function primaryRequirement(title: string) {
  const analysis = analyzeProductV2({ title });
  const requirement = analysis.partRequirements.primaryRequirements[0];
  assert.ok(requirement);
  return requirement;
}

test("MacBook ranking favors exact A1706 compatibility and quality over a vague cheap result", () => {
  const requirement = primaryRequirement("MacBook Pro 13 2016 Touch Bar écran cassé");
  const result = rankPartCandidates(requirement, [
    candidate("a", "A1706 OEM pulled display assembly", { quality: "original_pulled", price: 145, shipping: 0, deliveryDays: 3 }),
    candidate("b", "MacBook Pro compatible display assembly", { quality: "compatible", price: 95, shipping: 0, feedback: null, feedbackCount: null, deliveryDays: null, providerCompatibility: 50 }),
    candidate("c", "A1706 compatible display assembly", { quality: "compatible", price: 115, shipping: 0, feedback: 99.2, feedbackCount: 2_000, deliveryDays: 5 }),
  ], { now: NOW });
  assert.ok(result.recommended);
  assert.ok(["a", "c"].includes(result.recommended.candidate.id));
  assert.notEqual(result.recommended.candidate.id, "b");
  assert.equal(result.cheapest?.candidate.id, "b");
  assert.equal(result.fastest?.candidate.id, "a");
  assert.ok(result.recommended.badges.includes("recommended"));
  assert.ok(result.allRanked.find((item) => item.candidate.id === "a")?.badges.includes("highest_compatibility"));
  assert.ok((result.allRanked.find((item) => item.candidate.id === "a")?.qualityScore ?? 100) < 90);
});

test("iPhone 13 excludes Pro variants and accessories while retaining exact compatible screens", () => {
  const requirement = primaryRequirement("iPhone 13 écran cassé");
  const result = rankPartCandidates(requirement, [
    candidate("exact", "iPhone 13 display assembly original", { quality: "original_oem", price: 110 }),
    candidate("pro", "iPhone 13 Pro display assembly", { price: 80 }),
    candidate("case", "Case coque iPhone 13", { price: 10 }),
    candidate("protector", "iPhone 13 screen protector tempered glass", { price: 5 }),
    candidate("compatible", "Compatible screen display assembly for iPhone 13", { quality: "compatible", price: 70 }),
  ], { now: NOW });
  assert.ok(result.recommended);
  assert.ok(["exact", "compatible"].includes(result.recommended.candidate.id));
  for (const id of ["pro", "case", "protector"]) {
    const ranked = result.allRanked.find((item) => item.candidate.id === id);
    assert.equal(ranked?.eligible, false);
    assert.equal(ranked?.overallScore, 0);
  }
});

test("PS5 ranking excludes cable and repair service but accepts port and connector", () => {
  const requirement = primaryRequirement("PS5 HDMI HS");
  const result = rankPartCandidates(requirement, [
    candidate("port", "Sony PS5 HDMI port connector", { type: "hdmi_port", price: 18 }),
    candidate("cable", "PS5 HDMI cable", { type: "hdmi_port", price: 5 }),
    candidate("service", "PS5 HDMI repair service", { type: "hdmi_port", price: 45 }),
    candidate("connector", "Sony PS5 HDMI connector socket", { type: "hdmi_connector", price: 15 }),
  ], { now: NOW });
  assert.ok(result.recommended);
  assert.ok(["port", "connector"].includes(result.recommended.candidate.id));
  assert.equal(result.allRanked.find((item) => item.candidate.id === "cable")?.eligible, false);
  assert.equal(result.allRanked.find((item) => item.candidate.id === "service")?.eligible, false);
});

test("unknown shipping never creates a landed cost or assumes free delivery", () => {
  const requirement = primaryRequirement("iPhone 13 écran cassé");
  const result = rankPartCandidates(requirement, [candidate("unknown-shipping", "iPhone 13 display assembly", { shipping: null })], { now: NOW });
  assert.equal(result.allRanked[0].landedCost, null);
  assert.equal(result.allRanked[0].landedCostScore, 35);
  assert.ok(result.allRanked[0].warnings.some((warning) => warning.includes("aucune gratuité supposée")));
});

test("a poorly documented seller is scored below a proven seller and receives a warning", () => {
  const requirement = primaryRequirement("iPhone 13 écran cassé");
  const result = rankPartCandidates(requirement, [
    candidate("proven", "iPhone 13 display assembly", { feedback: 99.8, feedbackCount: 50_000 }),
    candidate("new", "iPhone 13 display assembly", { feedback: 100, feedbackCount: 3 }),
  ], { now: NOW });
  const proven = result.allRanked.find((item) => item.candidate.id === "proven");
  const newcomer = result.allRanked.find((item) => item.candidate.id === "new");
  assert.ok((proven?.sellerScore ?? 0) > (newcomer?.sellerScore ?? 100));
  assert.ok(newcomer?.warnings.some((warning) => warning.includes("peu documenté")));
});

test("recommended remains null below centralized compatibility and score thresholds", () => {
  const requirement = primaryRequirement("MacBook Pro 13 2016 Touch Bar écran cassé");
  const result = rankPartCandidates(requirement, [
    candidate("vague", "Generic laptop screen", { quality: "unknown", feedback: null, feedbackCount: null, deliveryDays: null, shipping: null, providerCompatibility: 20 }),
  ], { now: NOW });
  assert.equal(result.recommended, null);
});
