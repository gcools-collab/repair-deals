import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProduct } from "./index.ts";

test("identifies a PS5 with an HDMI fault", () => {
  const result = analyzeProduct({ title: "PS5 HDMI HS" });
  assert.equal(result.category, "console");
  assert.equal(result.brand, "Sony");
  assert.equal(result.model, "PS5");
  assert.ok(result.detectedFaults.includes("hdmi_issue"));
});

test("identifies an iPhone 13 with a broken screen", () => {
  const result = analyzeProduct({ title: "iPhone 13 écran cassé" });
  assert.equal(result.category, "smartphone");
  assert.equal(result.brand, "Apple");
  assert.equal(result.model, "iPhone 13");
  assert.ok(result.detectedFaults.includes("broken_screen"));
  assert.ok(result.detectedFaults.includes("cracked_screen"));
});

test("identifies a MacBook Air M1 that does not power on", () => {
  const result = analyzeProduct({ title: "MacBook Air M1 ne s'allume plus" });
  assert.equal(result.category, "mac");
  assert.equal(result.brand, "Apple");
  assert.equal(result.model, "MacBook Air M1");
  assert.ok(result.detectedFaults.includes("no_power"));
});

test("identifies a Samsung TV backlight fault", () => {
  const result = analyzeProduct({ title: "TV Samsung 55 rétroéclairage HS" });
  assert.equal(result.category, "tv");
  assert.equal(result.brand, "Samsung");
  assert.ok(result.detectedFaults.includes("backlight_issue"));
});

test("identifies a Nintendo Switch charging fault", () => {
  const result = analyzeProduct({ title: "Nintendo Switch pour pièces ne charge plus" });
  assert.equal(result.category, "console");
  assert.equal(result.brand, "Nintendo");
  assert.equal(result.model, "Switch");
  assert.ok(result.detectedFaults.includes("charging_issue"));
});

test("keeps unknown identity null and confidence low for a generic laptop", () => {
  const result = analyzeProduct({ title: "ordinateur portable en panne" });
  assert.equal(result.category, "laptop");
  assert.equal(result.brand, null);
  assert.equal(result.model, null);
  assert.deepEqual(result.detectedFaults, ["unknown_fault"]);
  assert.ok(result.productConfidence < 50);
  assert.ok(result.faultConfidence < 50);
});

test("prioritizes structured Leboncoin brand and extracts an exact reference", () => {
  const result = analyzeProduct({
    title: "Console PS5 à réparer",
    brand: "Sony",
    model: "PlayStation 5 CFI-1216A",
  });
  assert.equal(result.brand, "Sony");
  assert.equal(result.model, "PS5");
  assert.equal(result.reference, "CFI-1216A");
  assert.ok(result.evidence.some((item) => item.includes("attributs Leboncoin")));
});

test("keeps a generic model when several variants are mentioned", () => {
  const result = analyzeProduct({ title: "PS5 Slim ou PS5 Pro en panne" });
  assert.equal(result.model, "PS5");
  assert.ok(result.evidence.some((item) => item.includes("Plusieurs variantes")));
});
