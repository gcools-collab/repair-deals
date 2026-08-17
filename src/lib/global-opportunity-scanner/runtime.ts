import { analyzeFinancials, type RepairEstimate } from "../deal-economics/index.ts";
import { createDealDecisionContext } from "../deal-decision-context/index.ts";
import { analyzeDiagnosticV2, diagnosticAllowsSupplierSearch, type DiagnosticIntelligenceV2Result } from "../diagnostic-intelligence-v2/index.ts";
import { scanLeboncoin } from "../leboncoin-scanner.ts";
import { adaptMarketEstimateV2, estimateMarketV2, type MarketEstimateV2 } from "../market-intelligence-v2/index.ts";
import { leboncoinMarketProviderV2 } from "../market-intelligence-v2/provider.ts";
import { executePartsSearchV2, type PartsSearchV2Response } from "../parts-search-v2/index.ts";
import { configuredAutomaticPartProviders } from "../parts-intelligence/providers/configured.ts";
import type { PartSearchInput } from "../parts-intelligence/types.ts";
import { analyzeProductV2 } from "../product-intelligence/index.ts";
import type { FaultType } from "../product-analysis/types.ts";
import { estimateRepairCost, projectRepairFinancials } from "../repair/index.ts";
import { IPCAdapter, type PartOffer } from "../suppliers/index.ts";
import { calculateOpportunityScore, type GlobalListingAnalyzer, type GlobalListingProvider } from "./index.ts";
import type { OpportunityPipelineTrace, OpportunityReason } from "./types.ts";

export const globalLeboncoinProvider: GlobalListingProvider = {
  id: "leboncoin", transport: "leboncoin_bridge", route: "/search",
  async search(query, config) {
    return (await scanLeboncoin({ query, min_price: config.minPurchasePrice, max_price: config.maxPurchasePrice, limit: config.maxListingsPerQuery, broken_only: true, ...(config.radiusKm ? { radius_km: config.radiusKm } : {}), ...(config.location.postalCode ? { postal_code: config.location.postalCode } : {}), ...(config.location.latitude !== null && config.location.longitude !== null ? { latitude: config.location.latitude, longitude: config.location.longitude } : {}) })).results;
  },
};

function exclusionSummary(market: MarketEstimateV2) {
  const summary: Record<string, number> = {};
  for (const comparable of market.excludedComparables) for (const reason of comparable.exclusionReasons) summary[reason] = (summary[reason] || 0) + 1;
  return summary;
}

function safeFailureReason(messages: string[]) {
  const text = messages.join(" ").toLowerCase();
  if (text.includes("request_budget_reached")) return "request_budget_reached";
  if (text.includes("datadome")) return "provider_datadome";
  if (text.includes("rate") || text.includes("429")) return "provider_rate_limited";
  if (text.includes("timeout")) return "provider_timeout";
  if (text.includes("auth") || text.includes("401") || text.includes("403")) return "provider_auth_error";
  if (text.includes("unavailable") || text.includes("indisponible")) return "provider_unavailable";
  return messages.length ? "provider_error" : null;
}

function pipelineTrace(parts: PartsSearchV2Response, diagnosticV2:DiagnosticIntelligenceV2Result, market: MarketEstimateV2, financialReadiness: "incomplete" | "estimable" | "ready", purchasePrice: number | null, repairCost: number | null, marketValue: number | null, minimumIdentity: number, minimumMarket: number, minimumParts: number): OpportunityPipelineTrace {
  const primary = parts.primaryResults[0] || null;
  const allAttempts = parts.primaryResults.flatMap(result => result.tiersAttempted);
  const provider = parts.providerStatus.map(status => status.name).join(", ") || "Aucun";
  const providerStatus = parts.providerStatus.some(status => status.status === "success") ? "available" : parts.providerStatus.some(status => status.status === "failed" || status.status === "not_configured") ? "unavailable" : "insufficient_data";
  const candidatesAccepted = parts.primaryResults.flatMap(result => result.ranking.allRanked).filter(candidate => candidate.eligible && candidate.compatibilityScore >= 65).length;
  const partsConfidence = parts.primaryResults.flatMap(result => result.ranking.allRanked).sort((left, right) => right.overallScore - left.overallScore)[0]?.overallScore ?? null;
  const marketStatus = market.status === "provider_error" ? "unavailable" : market.status === "success" && market.confidence >= minimumMarket ? "available" : "insufficient_data";
  const diagnosticStatus = diagnosticV2.status==="insufficient_data"?"unknown":diagnosticV2.status==="ambiguous"?"uncertain":"ready";
  const identityStatus = parts.identity.confidence >= minimumIdentity ? "ready" : parts.identity.family || parts.identity.model ? "uncertain" : "unknown";
  const economicsMissing = [purchasePrice === null ? "purchase_price" : null, marketValue === null ? "market_estimate" : null, repairCost === null ? "repair_cost" : null].filter((value): value is string => value !== null);
  const partProviderFailure = safeFailureReason(allAttempts.flatMap(attempt => attempt.providerErrors.map(error => error.message)));
  const partsFailure = diagnosticStatus === "unknown" ? "diagnostic_unknown" : parts.primaryResults.length === 0 ? "no_part_requirement" : providerStatus === "unavailable" ? partProviderFailure || "provider_unavailable" : candidatesAccepted === 0 ? "parts_not_found" : partsConfidence !== null && partsConfidence < minimumParts ? "insufficient_confidence" : null;
  const marketFailure = market.status === "provider_error" ? safeFailureReason(market.warnings) || "provider_error" : market.status === "success" && market.confidence < minimumMarket ? "insufficient_confidence" : market.status === "success" ? null : market.status;
  const firstBlockingStage = identityStatus !== "ready" ? "identity" : diagnosticStatus !== "ready" ? "diagnostic" : marketStatus !== "available" ? "market" : partsFailure ? "parts" : financialReadiness !== "ready" ? "economics" : null;
  return {
    firstBlockingStage,
    identity: { status: identityStatus, confidence: parts.identity.confidence, objectKind: parts.identity.objectKind, compatiblePlatform: parts.identity.compatiblePlatform, family: parts.identity.family, model: parts.identity.model, reference: parts.identity.confirmedReference || parts.identity.manufacturerReference || parts.identity.modelNumber },
    diagnostic: { status: diagnosticStatus, selectedFault: diagnosticV2.primaryDiagnostic?.fault || null, primaryFault:diagnosticV2.primaryDiagnostic?.fault||null, confidence: diagnosticV2.confidence, evidence:diagnosticV2.evidence,alternatives:diagnosticV2.alternativeDiagnostics.map(item=>({fault:item.fault,confidence:item.confidence})),scenarioCount:diagnosticV2.repairScenarios.length },
    market: { status: marketStatus, provider: market.source, tierUsed: market.tierUsed, queries: market.tiersAttempted.map(attempt => attempt.query), comparablesFound: market.tiersAttempted.reduce((sum, attempt) => sum + attempt.rawCount, 0), comparablesAccepted: market.sampleSize, exclusions: market.excludedComparables.length, exclusionReasons: exclusionSummary(market), comparables: [...market.comparables.map(item => ({ title: item.listing.title, price: item.listing.price, similarityScore: item.similarityScore, accepted: true, reasons: item.identityMatches, estimatedObjectKind: item.estimatedObjectKind, estimatedSubjectKind: item.estimatedSubjectKind })), ...market.excludedComparables.map(item => ({ title: item.listing.title, price: item.listing.price, similarityScore: item.similarityScore, accepted: false, reasons: item.exclusionReasons, estimatedObjectKind: item.estimatedObjectKind, estimatedSubjectKind: item.estimatedSubjectKind }))], confidence: market.confidence, failureReason: marketFailure },
    parts: { status: partsFailure ? providerStatus === "unavailable" ? "unavailable" : "insufficient_data" : "available", provider, providerStatus, requirement: primary?.requirement.normalizedPartName || null, tiersAttempted: [...new Set(allAttempts.map(attempt => attempt.tier))], queries: [...new Set(allAttempts.flatMap(attempt => attempt.queries))], candidatesFound: allAttempts.reduce((sum, attempt) => sum + attempt.rawCandidateCount, 0), candidatesAccepted, confidence: partsConfidence, failureReason: partsFailure },
    economics: { status: financialReadiness === "ready" ? "ready" : "incomplete", missingInputs: economicsMissing },
  };
}

export const analyzeGlobalListing: GlobalListingAnalyzer = async (listing, config, budget) => {
  const productPreview=analyzeProductV2({title:listing.title,description:listing.description,brand:listing.brand,model:listing.modelReference,attributes:listing.attributes,repairKeywords:listing.detectedFaultKeywords});
  const diagnosticV2=analyzeDiagnosticV2({title:listing.title,description:listing.description,attributes:listing.attributes,productIdentity:productPreview.product,detectedFaults:productPreview.v1Analysis.detectedFaults});
  const configured=configuredAutomaticPartProviders();
  const suppliersAllowed=diagnosticAllowsSupplierSearch(diagnosticV2);
  const providers = configured.map(entry => !suppliersAllowed?{...entry,provider:null}:entry.provider ? { ...entry, provider: { descriptor: entry.provider.descriptor, async search(input: PartSearchInput, queries: string[]) { if (!budget.consume()) throw new Error("request_budget_reached"); return entry.provider!.search(input, queries); } } } : entry);
  const legacyFaultMap:Partial<Record<string,FaultType>>={no_display:"display_issue",sound_only:"backlight_issue",no_backlight:"backlight_issue",panel_damage:"broken_screen",stick_drift:"controller_issue",button_issue:"controller_issue",usb_port_issue:"charging_issue",power_instability:"no_power",boot_loop:"no_boot",mainboard_issue:"motherboard_issue",power_board_issue:"motherboard_issue",tcon_issue:"display_issue"};
  const primaryFault=diagnosticV2.primaryDiagnostic?.fault||null;const legacyFault=primaryFault?(legacyFaultMap[primaryFault]||primaryFault) as FaultType:null;
  const parts = await executePartsSearchV2({ title: listing.title, description: listing.description, brand: listing.brand, model: listing.modelReference, attributes: listing.attributes, repairKeywords: listing.detectedFaultKeywords, detectedFaults: legacyFault?[legacyFault]:[],confirmedFault:diagnosticV2.status==="confirmed"?legacyFault:null, minimumDiagnosticConfidence: 60, currency: "EUR" }, providers);
  const selectedDiagnostic = parts.diagnostics.find(diagnostic => diagnostic.fault !== "unknown_fault" && diagnostic.confidence >= 60) || null;
  const marketProvider = { ...leboncoinMarketProviderV2, async search(query: string, limit: number) { if (!budget.consume()) throw new Error("request_budget_reached"); return leboncoinMarketProviderV2.search(query, limit); } };
  const marketV2 = await estimateMarketV2({ identity: parts.identity }, marketProvider);
  const marketAdapted = adaptMarketEstimateV2(marketV2, config.minimumMarketConfidence);
  const ranked = parts.primaryResults.flatMap(result => result.ranking.allRanked);
  const recommended = selectedDiagnostic ? ranked.filter(result => result.candidate.totalPrice !== null && result.compatibilityScore >= 80).sort((left, right) => right.overallScore - left.overallScore)[0] || null : null;
  const selectedParts = recommended ? [recommended.candidate] : [];
  const supplierOffers:PartOffer[]=ranked.filter(item=>item.eligible&&item.candidate.totalPrice!==null&&item.candidate.unitPrice!==null).map(item=>({supplier:{id:item.candidate.provider?.id||"unknown",name:item.candidate.provider?.name||"Unknown marketplace",sourceTypes:["marketplace"],isMock:false},title:item.candidate.partName||item.candidate.id,partType:item.candidate.partType||"unknown",manufacturer:null,partReference:item.candidate.partReference,compatibleModels:item.candidate.compatibleModels||[],condition:item.candidate.condition,quality:item.candidate.quality||"unknown",price:item.candidate.unitPrice!,shippingPrice:item.candidate.shippingCost,totalPrice:item.candidate.totalPrice!,currency:item.candidate.currency||"EUR",availability:item.candidate.availability||"unknown",estimatedDelivery:item.candidate.deliveryEstimate||null,confidence:item.overallScore,productUrl:item.candidate.url,retrievedAt:item.candidate.retrievedAt||new Date().toISOString()}));
  const probabilisticRepair=await estimateRepairCost({device:parts.identity,diagnostic:selectedDiagnostic,detectedFaults:parts.diagnostics.map(item=>item.fault),diagnosticScenarios:diagnosticV2.repairScenarios,suppliers:suppliersAllowed?[new IPCAdapter()]:[],seedOffers:supplierOffers});
  const repairCost = probabilisticRepair.repairCostExpected;
  const partsConfidence = recommended?.overallScore ?? null;
  const risk = selectedDiagnostic?.hiddenRisk ?? null;
  const repairEstimate: RepairEstimate = { probableParts: selectedParts.map(part => ({ name: part.partName || "Pièce", reference: part.partReference, quantity: part.quantity || 1, unitPriceLow: part.totalPrice, unitPriceHigh: part.totalPrice, source: part.provider ? { kind: "provider", name: part.provider.name, url: part.url, retrievedAt: part.retrievedAt } : null })), partsCostLow: repairCost, partsCostHigh: repairCost, estimatedMinutesLow: null, estimatedMinutesHigh: null, difficulty: selectedDiagnostic?.repairDifficulty === "unknown" ? null : selectedDiagnostic?.repairDifficulty || null, hiddenFaultRisk: risk, confidence: partsConfidence, source: recommended?.candidate.provider ? { kind: "provider", name: recommended.candidate.provider.name } : null };
  const financial = analyzeFinancials({ purchasePrice: listing.price, marketEstimate: marketAdapted.estimate, repairEstimate, extraCosts: 0 });
  const repairFinancials=projectRepairFinancials({purchasePrice:listing.price,repair:probabilisticRepair,marketValueLow:marketAdapted.estimate.lowPrice,marketValueExpected:marketAdapted.estimate.medianPrice,marketValueHigh:marketAdapted.estimate.highPrice,riskReserve:null});
  const context = createDealDecisionContext({ listing, resolvedIdentity: parts.identity, diagnostics: parts.diagnostics, selectedDiagnostic, partRequirements: parts.requirements, partSearchResults: parts.searchResults, selectedParts, marketEstimate: marketAdapted.estimate, repairEstimate, financialEstimate: financial, purchaseBenefits: [], warnings: [...parts.warnings, ...marketV2.warnings] });
  const market = marketV2.weightedMedian ?? marketV2.medianPrice;
  const invested = listing.price !== null && repairCost !== null ? listing.price + repairCost : null;
  const margin = market !== null && invested !== null ? market - invested : null;
  const roi = margin !== null && invested! > 0 ? margin / invested! * 100 : null;
  const confidence = [parts.identity.confidence, marketV2.confidence, partsConfidence, financial.financialConfidence].filter((value): value is number => value !== null).reduce((sum, value, _, all) => sum + value / all.length, 0) || null;
  const repairability = selectedDiagnostic ? ({ easy: 90, moderate: 70, hard: 45, expert: 25, unknown: null }[selectedDiagnostic.repairDifficulty]) : null;
  const availability = recommended ? ({ in_stock: 90, limited: 60, preorder: 35, out_of_stock: 0, unknown: null }[recommended.candidate.availability || "unknown"]) : null;
  const breakdown = calculateOpportunityScore({ purchaseCost: listing.price, repairCost, marketValue: market, risk, globalConfidence: confidence, repairability, partsAvailability: availability, repairMinutes: null, liquidityScore: null, financial });
  const trace = pipelineTrace(parts, diagnosticV2, marketV2, financial.readiness, listing.price, repairCost, market, 60, config.minimumMarketConfidence, config.minimumPartsConfidence);
  trace.economics.missingInputs=[...new Set([...trace.economics.missingInputs,...repairFinancials.missingInputs])];
  const causal: OpportunityReason[] = [];
  if (trace.identity.status !== "ready") causal.push("low_identity_confidence");
  if (trace.diagnostic.status !== "ready") causal.push("diagnostic_unknown");
  if (market === null) causal.push("missing_market"); else if (marketV2.confidence < config.minimumMarketConfidence) causal.push("low_market_confidence");
  if (trace.diagnostic.status === "ready") { if (!recommended) causal.push("missing_parts"); else if (partsConfidence! < config.minimumPartsConfidence) causal.push("low_parts_confidence"); }
  if (risk !== null && risk > config.maxRisk) causal.push("high_risk");
  if (margin !== null && margin < 0) causal.push("negative_margin"); else if (margin !== null && margin < config.minMargin) causal.push("below_margin");
  if (roi !== null && roi < config.minRoi) causal.push("below_roi");
  if (financial.readiness === "incomplete") causal.push("incomplete_financials"); else if (financial.financialConfidence !== null && financial.financialConfidence < config.minimumFinancialConfidence) causal.push("low_financial_confidence");
  const primaryReason = causal[0] || null;
  const consequences = causal.slice(1);
  const reasons = primaryReason ? [primaryReason] : [];
  const rejected = causal.some(reason => ["high_risk", "negative_margin", "below_margin", "below_roi"].includes(reason));
  const ready = !rejected && causal.length === 0;
  return { listing, decisionContext: context, opportunityScore: ready ? breakdown.overallOpportunityScore : null, opportunityBreakdown: breakdown, estimatedPurchaseCost: listing.price, estimatedRepairCost: repairCost, estimatedMarketValue: market, estimatedNetMargin: margin, roi, maxRecommendedPurchasePrice: financial.maxRecommendedPurchasePrice, risk, confidence, readiness: rejected ? "rejected" : ready ? "ready" : "partial", primaryReason, reasons, consequences, pipelineTrace: trace, warnings: [...context.warnings,...probabilisticRepair.supplierDiagnostics.filter(item=>item.status==="unavailable").map(item=>`supplier_${item.supplierId}_unavailable`)], rankingBadges: [], liquidity: null };
};
