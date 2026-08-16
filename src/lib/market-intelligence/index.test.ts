import assert from "node:assert/strict";
import test from "node:test";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import {
  buildMarketSearchPlan,
  calculateMarketStatistics,
  cleanComparableSearchTitle,
  estimateMarketFromListings,
  isComparableListing,
  scoreComparableListing,
} from "./index.ts";
import type { ProductIdentity } from "./types.ts";

const ps5: ProductIdentity = {
  category: "console",
  brand: "Sony",
  model: "PS5",
  reference: null,
  originalTitle: "PS5 HDMI HS pour pièces",
  productConfidence: 76,
};

function listing(id: string, title: string, price: number | null, overrides: Partial<LeboncoinListing> = {}): LeboncoinListing {
  return {
    id,
    title,
    description: "Console en très bon état, fonctionne parfaitement",
    price,
    url: "https://www.leboncoin.fr/ad/consoles/" + id,
    images: [],
    brand: null,
    modelReference: null,
    location: null,
    publishedAt: "2026-08-01T10:00:00Z",
    attributes: {},
    detectedFaultKeywords: [],
    likelyBroken: false,
    repairRelevanceScore: 0,
    searchRelevanceScore: 0,
    exclusionReasons: [],
    positiveSignals: [],
    negativeSignals: [],
    listingKind: "device",
    ...overrides,
  };
}

test("builds precise queries and removes fault words", () => {
  assert.equal(buildMarketSearchPlan(ps5)?.query, "PS5");
  assert.equal(cleanComparableSearchTitle("MacBook Air M1 ne s’allume plus HS"), "macbook air m1");
  assert.equal(buildMarketSearchPlan({ ...ps5, brand: "Samsung", model: "Galaxy S23" })?.query, "Samsung Galaxy S23");
  assert.equal(buildMarketSearchPlan({ ...ps5, reference: "CFI-1216A" })?.query, "PS5 CFI-1216A");
});

test("accepts exact PS5 listings and rejects broken ads, accessories and other models", () => {
  const exact = listing("1", "Sony PlayStation 5 standard avec lecteur", 440);
  const broken = listing("2", "PS5 HDMI HS", 180, { likelyBroken: true, detectedFaultKeywords: ["HDMI HS"] });
  const accessory = listing("3", "Manette DualSense pour PS5", 50);
  const otherModel = listing("4", "Sony PlayStation 4 Pro", 190);

  assert.equal(isComparableListing(ps5, exact), true);
  assert.equal(scoreComparableListing(ps5, broken).rejectionReason, "Annonce en panne ou de réparation");
  assert.equal(scoreComparableListing(ps5, accessory).rejectionReason, "Accessoire seul");
  assert.equal(isComparableListing(ps5, otherModel), false);
});

test("uses IQR to remove an extreme price and returns quantiles", () => {
  const statistics = calculateMarketStatistics([400, 420, 450, 470, 2500]);
  assert.deepEqual(statistics?.prices, [400, 420, 450, 470]);
  assert.equal(statistics?.lowPrice, 415);
  assert.equal(statistics?.medianPrice, 435);
  assert.equal(statistics?.highPrice, 455);
});

test("produces a traceable estimate from valid comparables only", () => {
  const results = [
    listing("10", "PS5 Sony édition standard", 400),
    listing("11", "PlayStation 5 Sony avec lecteur", 420),
    listing("12", "Console PS5 Sony", 450),
    listing("13", "Sony PS5 très bon état", 470),
    listing("14", "PS5 Sony prix fantaisiste", 2500),
    listing("15", "PS5 cassée pour pièces", 100, { likelyBroken: true }),
    listing("16", "Manette PS5", 45),
  ];
  const result = estimateMarketFromListings(ps5, results, { retrievedAt: "2026-08-15T10:00:00.000Z" });

  assert.equal(result.status, "success");
  assert.equal(result.estimate.lowPrice, 415);
  assert.equal(result.estimate.medianPrice, 435);
  assert.equal(result.estimate.highPrice, 455);
  assert.equal(result.estimate.sampleSize, 4);
  assert.equal(result.estimate.source?.name, "Leboncoin");
  assert.equal(result.estimate.source?.retrievedAt, "2026-08-15T10:00:00.000Z");
  assert.ok(result.estimate.confidence !== null && result.estimate.confidence < 80);
  assert.ok(result.estimate.comparableItems.every((item) => typeof item.matchScore === "number"));
});

test("does not create prices with too few comparables", () => {
  const result = estimateMarketFromListings(ps5, [
    listing("20", "Sony PS5", 420),
    listing("21", "PS5 HDMI HS", 150, { likelyBroken: true }),
  ]);
  assert.equal(result.status, "insufficient_comparables");
  assert.equal(result.estimate.medianPrice, null);
  assert.equal(result.estimate.confidence, null);
});

test("does not estimate a vague identity or prices with extreme dispersion", () => {
  const vague = estimateMarketFromListings({
    category: "unknown",
    brand: null,
    model: null,
    reference: null,
    originalTitle: "HS",
  }, []);
  assert.equal(vague.status, "identity_too_vague");

  const dispersed = estimateMarketFromListings(ps5, [
    listing("30", "Sony PS5", 100),
    listing("31", "Sony PS5 console", 200),
    listing("32", "PlayStation 5 Sony", 700),
  ]);
  assert.equal(dispersed.status, "prices_too_dispersed");
  assert.equal(dispersed.estimate.medianPrice, null);
});
