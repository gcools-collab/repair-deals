import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductV2, resolveDiagnostics } from "./index.ts";

test("resolves the 2016 MacBook Pro Touch Bar identity and keeps catalog references probable", () => {
  const result = analyzeProductV2({ title: "MacBook Pro 13 2016 Touch Bar 256 Go écran cassé" });
  assert.equal(result.product.brand, "Apple");
  assert.equal(result.product.family, "MacBook Pro");
  assert.equal(result.product.screenSize, 13);
  assert.equal(result.product.year, 2016);
  assert.equal(result.product.variant, "Touch Bar");
  assert.equal(result.product.storage, "256 GB");
  assert.deepEqual(result.product.probableReferences.map((item) => item.reference), ["A1706", "MacBookPro13,2"]);
  assert.equal(result.product.confirmedReference, null);
  assert.ok(result.product.confidence >= 70);
  assert.ok(result.product.evidences.some((item) => item.field === "year" && item.source === "title"));
  const display = result.diagnostics.find((item) => item.fault === "broken_screen");
  assert.ok(display);
  assert.ok(display.requiredChecks.some((check) => check.includes("écran externe")));
  assert.ok(display.probableCauses.every((cause) => cause.status === "probable"));
  assert.deepEqual(display.confirmedCauses, []);
});

test("resolves PS5 HDMI and produces checks without confirming a cause", () => {
  const result = analyzeProductV2({ title: "PS5 HDMI HS" });
  assert.equal(result.product.brand, "Sony");
  assert.equal(result.product.family, "PlayStation 5");
  assert.equal(result.product.model, "PS5");
  const diagnostic = result.diagnostics.find((item) => item.fault === "hdmi_issue");
  assert.ok(diagnostic);
  assert.ok(diagnostic.confidence > 0);
  assert.ok(diagnostic.requiredChecks.some((check) => check.includes("Inspecter le port HDMI")));
  assert.deepEqual(diagnostic.confirmedCauses, []);
});

test("distinguishes iPhone 13 from iPhone 13 Pro Max", () => {
  const regular = analyzeProductV2({ title: "iPhone 13 écran cassé" });
  const proMax = analyzeProductV2({ title: "iPhone 13 Pro Max écran cassé" });
  assert.equal(regular.product.model, "iPhone 13");
  assert.equal(regular.product.generation, "13");
  assert.equal(regular.product.variant, null);
  assert.equal(regular.product.screenSize, null);
  assert.equal(proMax.product.model, "iPhone 13 Pro Max");
  assert.equal(proMax.product.generation, "13");
  assert.equal(proMax.product.variant, "Pro Max");
  assert.notEqual(regular.product.model, proMax.product.model);
  assert.ok(proMax.product.evidences.some((item) => item.field === "variant"));
  assert.ok(proMax.diagnostics.every((item) => item.confirmedCauses.length === 0));
});

test("maps an explicit Nintendo Switch USB-C symptom to a charging diagnostic", () => {
  const result = analyzeProductV2({ title: "Nintendo Switch USB-C" });
  assert.equal(result.product.brand, "Nintendo");
  assert.equal(result.product.family, "Switch");
  const diagnostic = result.diagnostics.find((item) => item.fault === "charging_issue");
  assert.ok(diagnostic);
  assert.ok(diagnostic.evidences.some((item) => item.includes("USB-C")));
  assert.ok(diagnostic.probableCauses.some((cause) => cause.cause === "USB-C connector"));
  assert.deepEqual(diagnostic.confirmedCauses, []);
});

test("resolves a Samsung 55 inch TV backlight fault", () => {
  const result = analyzeProductV2({ title: "Samsung TV 55 rétroéclairage HS" });
  assert.equal(result.product.brand, "Samsung");
  assert.equal(result.product.family, "Samsung TV");
  assert.equal(result.product.screenSize, 55);
  const diagnostic = result.diagnostics.find((item) => item.fault === "backlight_issue");
  assert.ok(diagnostic);
  assert.ok(diagnostic.probableCauses.some((cause) => cause.cause === "LED backlight strips"));
  assert.deepEqual(diagnostic.confirmedCauses, []);
});

test("prioritizes structured attributes, records ambiguity, and confirms only explicit references", () => {
  const ambiguous = analyzeProductV2({
    title: "MacBook Pro 15 2018 écran HS",
    attributes: {
      year: { keyLabel: "Année", valueLabel: "2016" },
      size: { keyLabel: "Taille écran", valueLabel: "13 pouces" },
    },
    description: "Touch Bar, peut-être modèle 2017",
  });
  assert.equal(ambiguous.product.year, 2016);
  assert.equal(ambiguous.product.screenSize, 13);
  assert.ok(ambiguous.product.evidences.some((item) => item.field === "year" && item.source === "structured_attribute"));
  assert.ok(ambiguous.product.contradictions.some((item) => item.includes("Plusieurs années")));

  const explicit = analyzeProductV2({ title: "MacBook Pro A1706 écran cassé" });
  assert.equal(explicit.product.modelNumber, "A1706");
  assert.equal(explicit.product.confirmedReference, "A1706");
  assert.ok(explicit.product.evidences.some((item) => item.field === "confirmedReference" && item.source === "explicit_reference"));
});

test("a probable cause becomes confirmed only through explicit diagnostic input", () => {
  const result = analyzeProductV2({ title: "PS5 HDMI HS" });
  const diagnostics = resolveDiagnostics({
    product: result.product,
    analysis: result.v1Analysis,
    originalInput: { title: "PS5 HDMI HS" },
    confirmedCauses: { hdmi_issue: ["HDMI port"] },
  });
  const hdmi = diagnostics.find((item) => item.fault === "hdmi_issue");
  assert.ok(hdmi);
  assert.equal(hdmi.confirmedCauses[0]?.status, "confirmed");
  assert.ok(!hdmi.probableCauses.some((cause) => cause.cause === "HDMI port"));
});
