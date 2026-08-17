import type { DealDecisionContext } from "../deal-decision-context/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import type { ProductCategory } from "../product-analysis/types.ts";

export type GlobalScanConfig={categories:ProductCategory[];maxPurchasePrice:number;minPurchasePrice:number;radiusKm:number|null;location:{postalCode:string|null;latitude:number|null;longitude:number|null};maxListingsPerQuery:number;maxTotalListings:number;minimumRepairRelevance:number;minimumMarketConfidence:number;minimumPartsConfidence:number;minimumFinancialConfidence:number;maxRisk:number;minMargin:number;minRoi:number;concurrency:number;requestBudget:number};
export type GlobalSearchProfile={id:string;category:ProductCategory;queries:string[];enabled:boolean;priority:number};
export type LiquidityEstimate={confidence:number|null;estimatedDaysToSell:number|null;demandScore:number|null;supplyScore:number|null;source:string|null};
export type OpportunityWatchRule={categories:ProductCategory[];maxBudget:number;minOpportunityScore:number;minMargin:number;minRoi:number;maxRisk:number;radius:number|null};
export type OpportunityBreakdown={profitScore:number|null;roiScore:number|null;capitalEfficiencyScore:number|null;riskScore:number|null;confidenceScore:number|null;repairabilityScore:number|null;partsAvailabilityScore:number|null;liquidityScore:number|null;timeScore:number|null;overallOpportunityScore:number|null;capitalEfficiency:number|null;completeness:number};
export type OpportunityReason="missing_market"|"missing_parts"|"low_identity_confidence"|"low_market_confidence"|"low_parts_confidence"|"low_financial_confidence"|"high_risk"|"negative_margin"|"below_margin"|"below_roi"|"incomplete_financials";
export type RankingBadge="best_overall"|"highest_margin"|"highest_roi"|"lowest_budget"|"lowest_risk"|"fast_repair"|"best_capital_efficiency"|"high_confidence";
export type GlobalOpportunity={listing:LeboncoinListing;decisionContext:DealDecisionContext|null;opportunityScore:number|null;opportunityBreakdown:OpportunityBreakdown;estimatedPurchaseCost:number|null;estimatedRepairCost:number|null;estimatedMarketValue:number|null;estimatedNetMargin:number|null;roi:number|null;maxRecommendedPurchasePrice:number|null;risk:number|null;confidence:number|null;readiness:"ready"|"partial"|"rejected";reasons:OpportunityReason[];warnings:string[];rankingBadges:RankingBadge[];liquidity:LiquidityEstimate|null};
export type GlobalSortMode="overall"|"margin"|"roi"|"capital_efficiency"|"lowest_budget"|"lowest_risk"|"highest_confidence";
export type ScanDiagnostics={queriesPlanned:number;queriesExecuted:number;cacheHits:number;listingsRaw:number;listingsRelevant:number;analysed:number;providerErrors:number;stoppedEarly:boolean;stopReason:string|null};
export type GlobalScanResult={readyOpportunities:GlobalOpportunity[];partialOpportunities:GlobalOpportunity[];rejectedOpportunities:GlobalOpportunity[];diagnostics:ScanDiagnostics};
