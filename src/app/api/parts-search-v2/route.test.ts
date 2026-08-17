import assert from "node:assert/strict";
import test from "node:test";
import { executePartsSearchV2, type PartsSearchV2Response } from "@/lib/parts-search-v2";
import type { PartCandidate, PartProvider, PartSearchInput, PartType } from "@/lib/parts-intelligence";
import { createPartsSearchV2Handler } from "./route.ts";

function candidate(id: string, title: string, partType: PartType = "screen_assembly"): PartCandidate {
  return {
    id, partType, partName: title, partReference: null, compatibleModels: null, quantity: 1,
    unitPrice: 100, currency: "EUR", shippingCost: 5, totalPrice: 105, quality: "compatible",
    availability: "in_stock", provider: { id: "mock", name: "Mock", kind: "official_api" },
    providerItemId: id, url: `https://mock.test/${id}`, imageUrl: null, seller: "trusted",
    sellerMetadata: { username: "trusted", feedbackPercentage: 99.8, feedbackCount: 10_000, topRated: true },
    condition: "New", itemLocation: { countryCode: "FR", postalCode: null }, buyingOptions: ["FIXED_PRICE"],
    itemCreationDate: null, itemEndDate: null,
    deliveryEstimate: { minDate: "2026-08-19T00:00:00Z", maxDate: "2026-08-20T00:00:00Z" },
    returnPolicy: { returnsAccepted: true, returnPeriodDays: 30, warranty: null }, retrievedAt: "2026-08-17T00:00:00Z",
    confidence: 90, compatibilityConfidence: 90, isCompatible: null, evidence: ["Fixture hors réseau."],
  };
}

class MockProvider implements PartProvider {
  readonly descriptor = { id: "mock", name: "Mock", kind: "official_api" as const };
  readonly calls: string[][] = [];
  constructor(private readonly responder: (queries: string[]) => PartCandidate[]) {}
  async search(_input: PartSearchInput, queries: string[]) {
    this.calls.push(queries);
    return this.responder(queries);
  }
}

function request(body: unknown) {
  return new Request("http://localhost/api/parts-search-v2", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  assert.equal(response.status, 200);
  return await response.json() as PartsSearchV2Response;
}

test("route reconstructs A1706 identity, selects confirmed fault and stops at tier 2", async () => {
  const provider = new MockProvider(() => [
    candidate("a", "A1706 display assembly"), candidate("b", "A1706 screen display assembly"),
    candidate("c", "MacBookPro13,2 display assembly"),
  ]);
  const handler = createPartsSearchV2Handler(() => [{ id: "mock", name: "Mock", provider }]);
  const body = await responseBody(await handler(request({
    title: "MacBook Pro 13 2016 Touch Bar 256 Go écran cassé", detectedFaults: ["broken_screen"],
    confirmedFault: "broken_screen", currency: "EUR",
  })));
  assert.equal(body.identity.family, "MacBook Pro");
  assert.deepEqual(body.identity.probableReferences.map((item) => item.reference), ["A1706", "MacBookPro13,2"]);
  assert.equal(body.selectedDiagnostic?.fault, "broken_screen");
  assert.equal(body.primaryResults[0].tierUsed, 2);
  assert.equal(body.primaryResults[0].ranking.recommended !== null, true);
  assert.ok(provider.calls[0].some((query) => query.includes("A1706")));
  assert.ok(!provider.calls[0].some((query) => query.includes("2016")));
  assert.equal(body.preselectionDecisions[0].allowed, false);
});

test("route starts iPhone 13 at tier 3 and excludes Pro candidates", async () => {
  const provider = new MockProvider(() => [
    candidate("one", "iPhone 13 display assembly"), candidate("two", "Apple iPhone 13 screen assembly"),
    candidate("three", "Compatible display assembly iPhone 13"), candidate("pro", "iPhone 13 Pro display assembly"),
  ]);
  const handler = createPartsSearchV2Handler(() => [{ id: "mock", name: "Mock", provider }]);
  const body = await responseBody(await handler(request({ title: "iPhone 13 écran cassé", confirmedFault: "broken_screen" })));
  assert.equal(body.primaryResults[0].tiersAttempted[0].tier, 3);
  assert.equal(body.primaryResults[0].ranking.allRanked.find((item) => item.candidate.id === "pro")?.eligible, false);
});

test("route excludes PS5 cable and repair service", async () => {
  const provider = new MockProvider(() => [
    candidate("port-1", "Sony PS5 HDMI port", "hdmi_port"),
    candidate("port-2", "PS5 HDMI port connector", "hdmi_port"),
    candidate("port-3", "Sony PS5 HDMI connector", "hdmi_connector"),
    candidate("cable", "PS5 HDMI cable", "hdmi_port"), candidate("service", "PS5 HDMI repair service", "hdmi_port"),
  ]);
  const handler = createPartsSearchV2Handler(() => [{ id: "mock", name: "Mock", provider }]);
  const body = await responseBody(await handler(request({ title: "PS5 HDMI HS", confirmedFault: "hdmi_issue" })));
  assert.equal(body.primaryResults[0].ranking.allRanked.find((item) => item.candidate.id === "cable")?.eligible, false);
  assert.equal(body.primaryResults[0].ranking.allRanked.find((item) => item.candidate.id === "service")?.eligible, false);
});

test("provider absence returns an explicit pipeline state", async () => {
  const handler = createPartsSearchV2Handler(() => [{ id: "ebay", name: "eBay", provider: null }]);
  const body = await responseBody(await handler(request({ title: "iPhone 13 écran cassé" })));
  assert.equal(body.providerStatus[0].status, "not_configured");
  assert.equal(body.primaryResults[0].stopReason, "no_providers");
  assert.ok(body.warnings.some((warning) => warning.includes("n’est pas configuré")));
});

test("one provider failure is non-blocking when another provider succeeds", async () => {
  const failing: PartProvider = {
    descriptor: { id: "failing", name: "Failing", kind: "official_api" },
    async search() { throw new Error("provider unavailable"); },
  };
  const working = new MockProvider(() => [
    candidate("one", "iPhone 13 display assembly"), candidate("two", "iPhone 13 screen assembly"),
    candidate("three", "Apple iPhone 13 display assembly"),
  ]);
  const handler = createPartsSearchV2Handler(() => [
    { id: "failing", name: "Failing", provider: failing }, { id: "mock", name: "Mock", provider: working },
  ]);
  const body = await responseBody(await handler(request({ title: "iPhone 13 écran cassé" })));
  assert.equal(body.providerStatus.find((status) => status.id === "failing")?.status, "partial_failure");
  assert.equal(body.providerStatus.find((status) => status.id === "mock")?.status, "success");
  assert.ok(body.primaryResults[0].candidates.length >= 3);
});

test("diagnostic alternatives are returned in separate search results", async () => {
  const provider = new MockProvider((queries) => {
    const text = queries.join(" ").toLowerCase();
    if (text.includes("flex")) return [candidate("flex", "A1706 display flex cable", "display")];
    return [candidate("display", "A1706 display assembly")];
  });
  const handler = createPartsSearchV2Handler(() => [{ id: "mock", name: "Mock", provider }]);
  const body = await responseBody(await handler(request({ title: "MacBook Pro 13 2016 Touch Bar écran cassé" })));
  assert.ok(body.primaryResults.some((result) => result.requirement.normalizedPartName === "display assembly"));
  assert.ok(body.alternativeResults.some((result) => result.requirement.normalizedPartName === "display flex cable"));
  assert.notDeepEqual(body.primaryResults[0].candidates.map((item) => item.id),
    body.alternativeResults.find((result) => result.requirement.normalizedPartName === "display flex cable")?.candidates.map((item) => item.id));
});

test("route rejects invalid input without invoking a V1 fallback", async () => {
  const handler = createPartsSearchV2Handler(() => []);
  const response = await handler(request({ title: "", confirmedFault: "invented_fault" }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "validation_error");
});

test("global diagnostic guard does not search parts for DualSense without an identified fault", async () => {
  const provider = new MockProvider(() => [candidate("invented", "PS5 replacement part")]);
  const result = await executePartsSearchV2({ title: "Dualsense PS5", minimumDiagnosticConfidence: 60 }, [{ id: "mock", name: "Mock", provider }]);
  assert.equal(result.identity.family, "DualSense");
  assert.equal(result.identity.objectKind, "controller");
  assert.equal(result.identity.compatiblePlatform, "PlayStation 5");
  assert.ok(result.identity.confidence >= 60);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.primaryResults.length, 0);
  assert.equal(provider.calls.length, 0);
});

test("unknown PS5 for-parts fault is distinct from parts not found", async () => {
  const provider = new MockProvider(() => [candidate("invented", "PS5 replacement part")]);
  const result = await executePartsSearchV2({ title: "PS5 pour pièces", minimumDiagnosticConfidence: 60 }, [{ id: "mock", name: "Mock", provider }]);
  assert.equal(result.diagnostics[0]?.fault, "unknown_fault");
  assert.equal(result.diagnostics[0]?.confidence, 28);
  assert.equal(result.primaryResults.length, 0);
  assert.equal(provider.calls.length, 0);
});
