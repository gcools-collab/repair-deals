import type { DealDecisionContext } from "../deal-decision-context/types.ts";
import type { DiscoveryErrorCode, LeboncoinListing } from "../leboncoin-scanner.ts";
import type { ProductCategory } from "../product-analysis/types.ts";

export type GlobalScanConfig={categories:ProductCategory[];maxPurchasePrice:number;minPurchasePrice:number;radiusKm:number|null;location:{postalCode:string|null;latitude:number|null;longitude:number|null};maxListingsPerQuery:number;maxTotalListings:number;minimumRepairRelevance:number;minimumMarketConfidence:number;minimumPartsConfidence:number;minimumFinancialConfidence:number;maxRisk:number;minMargin:number;minRoi:number;concurrency:number;requestBudget:number;discoveryConcurrency:number;discoveryDelayMs:number;discoveryCacheTtlMs:number};
export type GlobalSearchProfile={id:string;category:ProductCategory;queries:string[];enabled:boolean;priority:number};
export type LiquidityEstimate={confidence:number|null;estimatedDaysToSell:number|null;demandScore:number|null;supplyScore:number|null;source:string|null};
export type OpportunityWatchRule={categories:ProductCategory[];maxBudget:number;minOpportunityScore:number;minMargin:number;minRoi:number;maxRisk:number;radius:number|null};
export type OpportunityBreakdown={profitScore:number|null;roiScore:number|null;capitalEfficiencyScore:number|null;riskScore:number|null;confidenceScore:number|null;repairabilityScore:number|null;partsAvailabilityScore:number|null;liquidityScore:number|null;timeScore:number|null;overallOpportunityScore:number|null;capitalEfficiency:number|null;completeness:number};
export type OpportunityReason="diagnostic_unknown"|"missing_market"|"missing_parts"|"low_identity_confidence"|"low_market_confidence"|"low_parts_confidence"|"low_financial_confidence"|"high_risk"|"negative_margin"|"below_margin"|"below_roi"|"incomplete_financials";
export type RankingBadge="best_overall"|"highest_margin"|"highest_roi"|"lowest_budget"|"lowest_risk"|"fast_repair"|"best_capital_efficiency"|"high_confidence";
export type PipelineStageStatus="ready"|"uncertain"|"unknown"|"available"|"unavailable"|"insufficient_data"|"incomplete";
export type OpportunityPipelineTrace={
  firstBlockingStage:"identity"|"diagnostic"|"market"|"parts"|"economics"|null;
  identity:{status:PipelineStageStatus;confidence:number;objectKind:string;compatiblePlatform:string|null;family:string|null;model:string|null;reference:string|null};
  diagnostic:{status:PipelineStageStatus;selectedFault:string|null;primaryFault:string|null;confidence:number|null;evidence:Array<{source:string;text:string;normalizedSignal:string;weight:number;polarity:string}>;alternatives:Array<{fault:string;confidence:number}>;scenarioCount:number};
  market:{status:PipelineStageStatus;provider:string;tierUsed:number|null;queries:string[];comparablesFound:number;comparablesAccepted:number;exclusions:number;exclusionReasons:Record<string,number>;comparables:Array<{title:string;price:number|null;similarityScore:number;accepted:boolean;reasons:string[];estimatedObjectKind:string;estimatedSubjectKind:string}>;confidence:number;failureReason:string|null};
  parts:{status:PipelineStageStatus;provider:string;providerStatus:string;requirement:string|null;tiersAttempted:number[];queries:string[];candidatesFound:number;candidatesAccepted:number;confidence:number|null;failureReason:string|null};
  economics:{status:PipelineStageStatus;missingInputs:string[]};
};
export type GlobalOpportunity={listing:LeboncoinListing;decisionContext:DealDecisionContext|null;opportunityScore:number|null;opportunityBreakdown:OpportunityBreakdown;estimatedPurchaseCost:number|null;estimatedRepairCost:number|null;estimatedMarketValue:number|null;estimatedNetMargin:number|null;roi:number|null;maxRecommendedPurchasePrice:number|null;risk:number|null;confidence:number|null;readiness:"ready"|"partial"|"rejected";primaryReason:OpportunityReason|null;reasons:OpportunityReason[];consequences:OpportunityReason[];pipelineTrace:OpportunityPipelineTrace|null;warnings:string[];rankingBadges:RankingBadge[];liquidity:LiquidityEstimate|null};
export type GlobalSortMode="overall"|"margin"|"roi"|"capital_efficiency"|"lowest_budget"|"lowest_risk"|"highest_confidence";
export type GlobalScanStatus="complete"|"partial"|"provider_unavailable";
export type ProviderHealth="available"|"degraded"|"unavailable"|"blocked";
export type QueryDiagnostic={providerId:string;query:string;source:"network"|"cache";outcome:"success"|"error";resultCount:number;durationMs:number;errorCode:DiscoveryErrorCode|null;httpStatus:number|null};
export type ProviderDiagnostic={providerId:string;transport:string;route:string;health:ProviderHealth;queriesExecuted:number;errors:number;lastErrorCode:DiscoveryErrorCode|null;lastHttpStatus:number|null};
export type ScanDiagnostics={queriesPlanned:number;queriesExecuted:number;cacheHits:number;listingsRaw:number;listingsRelevant:number;analysed:number;providerErrors:number;stoppedEarly:boolean;stopReason:string|null;discoveryConcurrency:number;queryDiagnostics:QueryDiagnostic[];providers:ProviderDiagnostic[]};
export type GlobalScanResult={status:GlobalScanStatus;readyOpportunities:GlobalOpportunity[];partialOpportunities:GlobalOpportunity[];rejectedOpportunities:GlobalOpportunity[];diagnostics:ScanDiagnostics};
