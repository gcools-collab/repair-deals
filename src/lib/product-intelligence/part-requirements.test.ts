import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductV2, resolvePrecisePartRequirements } from "./index.ts";

test("MacBook uses probable references before model fallbacks and keeps diagnostic alternatives", () => {
  const result = analyzeProductV2({ title: "MacBook Pro 13 2016 Touch Bar 256 Go écran cassé" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.normalizedPartName === "display assembly");
  assert.ok(primary);
  assert.deepEqual(primary.confirmedReferences, []);
  assert.deepEqual(primary.probableReferences.map((item) => item.reference), ["A1706", "MacBookPro13,2"]);
  assert.deepEqual(primary.queryTiers.slice(0, 2).map((item) => item.tier), [2, 2]);
  assert.equal(primary.queryTiers[0].query, "A1706 display assembly");
  assert.ok(primary.queryTiers.some((item) => item.tier === 3 && item.query === "MacBook Pro 13 2016 Touch Bar display assembly"));
  assert.ok(result.partRequirements.alternativeRequirements.some((item) => item.normalizedPartName === "LCD panel"));
  assert.ok(result.partRequirements.alternativeRequirements.some((item) => item.normalizedPartName === "display flex cable"));
  assert.ok(primary.warnings.some((warning) => warning.includes("probable") && warning.includes("non confirmée")));
  assert.ok(primary.warnings.some((warning) => warning.includes("aucun EMC n’est déduit")));
  assert.ok(!primary.searchQueries.some((query) => /EMC\s*\d/i.test(query)));
  assert.equal(primary.queryTiers[0].confidence, 88);
});

test("a confirmed reference becomes tier 1 and never promotes other probable references", () => {
  const result = analyzeProductV2({ title: "MacBook Pro 13 2016 Touch Bar A1706 écran cassé" });
  const product = {
    ...result.product,
    probableReferences: [
      { reference: "A1706", kind: "model_number" as const, confidence: 88, evidences: [] },
      { reference: "MacBookPro13,2", kind: "manufacturer_reference" as const, confidence: 88, evidences: [] },
    ],
  };
  const requirements = resolvePrecisePartRequirements({ product, diagnostics: result.diagnostics });
  const primary = requirements.primaryRequirements.find((item) => item.normalizedPartName === "display assembly");
  assert.ok(primary);
  assert.deepEqual(primary.confirmedReferences.map((item) => item.reference), ["A1706"]);
  assert.deepEqual(primary.probableReferences.map((item) => item.reference), ["MacBookPro13,2"]);
  assert.equal(primary.queryTiers[0].tier, 1);
  assert.equal(primary.queryTiers[0].query, "A1706 display assembly");
  assert.equal(primary.queryTiers[1].tier, 2);
});

test("iPhone 13 screen requirements exclude sibling variants", () => {
  const result = analyzeProductV2({ title: "iPhone 13 écran cassé" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.partType === "screen_assembly");
  assert.ok(primary);
  assert.ok(primary.searchQueries.includes("iPhone 13 display assembly"));
  assert.ok(primary.searchQueries.includes("iPhone 13 screen"));
  assert.ok(primary.positiveKeywords.includes("screen"));
  assert.ok(primary.negativeKeywords.includes("iPhone 13 Pro"));
  assert.ok(primary.negativeKeywords.includes("iPhone 13 Pro Max"));
  assert.ok(primary.negativeKeywords.includes("iPhone 13 mini"));
  assert.ok(primary.compatibilityKeys.some((item) => item.key === "model" && item.value === "iPhone 13"));
});

test("iPhone 13 Pro Max keeps its exact variant separate from iPhone 13", () => {
  const result = analyzeProductV2({ title: "iPhone 13 Pro Max écran cassé" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.partType === "screen_assembly");
  assert.ok(primary);
  assert.ok(primary.searchQueries.includes("iPhone 13 Pro Max display assembly"));
  assert.ok(primary.compatibilityKeys.some((item) => item.key === "model" && item.value === "iPhone 13 Pro Max"));
  assert.ok(primary.compatibilityKeys.some((item) => item.key === "variant" && item.value === "Pro Max"));
  assert.ok(!primary.searchQueries.includes("iPhone 13 display assembly"));
  assert.ok(!primary.negativeKeywords.includes("iPhone 13 Pro Max"));
});

test("PS5 HDMI produces port and connector needs while excluding accessories and services", () => {
  const result = analyzeProductV2({ title: "PS5 HDMI HS" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.partType === "hdmi_port");
  assert.ok(primary);
  assert.ok(primary.searchQueries.includes("PS5 HDMI port"));
  assert.ok(primary.negativeKeywords.includes("HDMI cable"));
  assert.ok(primary.negativeKeywords.includes("HDMI adapter"));
  assert.ok(primary.negativeKeywords.includes("repair service"));
  assert.ok(result.partRequirements.alternativeRequirements.some((item) => item.partType === "hdmi_connector" && item.searchQueries.includes("PS5 HDMI connector") && item.searchQueries.includes("Sony PS5 HDMI connector")));
});

test("Nintendo Switch USB-C distinguishes the primary port from connector alternatives without assuming a battery", () => {
  const result = analyzeProductV2({ title: "Nintendo Switch USB-C" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.partType === "usb_c_connector");
  assert.ok(primary);
  assert.equal(primary.normalizedPartName, "USB-C charging port");
  assert.ok(primary.searchQueries.includes("Switch USB-C charging port"));
  assert.ok(result.partRequirements.alternativeRequirements.some((item) => item.normalizedPartName === "charging connector"));
  assert.ok(![...result.partRequirements.primaryRequirements, ...result.partRequirements.alternativeRequirements].some((item) => item.normalizedPartName.toLowerCase().includes("battery")));
});

test("Samsung TV backlight requirements retain TV and screen-size compatibility", () => {
  const result = analyzeProductV2({ title: "Samsung TV 55 rétroéclairage HS" });
  const primary = result.partRequirements.primaryRequirements.find((item) => item.partType === "led_strips");
  assert.ok(primary);
  assert.ok(primary.searchQueries.includes("Samsung TV 55 LED backlight strips"));
  assert.ok(primary.compatibilityKeys.some((item) => item.key === "brand" && item.value === "Samsung"));
  assert.ok(primary.compatibilityKeys.some((item) => item.key === "screenSize" && item.value === "55"));
  assert.ok(primary.requiredAttributes.includes("TV model compatibility"));
});
