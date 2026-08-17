import type { FinancialAnalysis } from "../deal-economics/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import { ScannerRequestError, type DiscoveryErrorCode } from "../leboncoin-scanner.ts";
import type { GlobalOpportunity,GlobalScanConfig,GlobalScanResult,GlobalSearchProfile,GlobalSortMode,OpportunityBreakdown,ProviderDiagnostic,RankingBadge,ScanDiagnostics } from "./types.ts";
export * from "./types.ts";

export const OPPORTUNITY_WEIGHTS={profitScore:.18,roiScore:.17,capitalEfficiencyScore:.18,riskScore:.13,confidenceScore:.14,repairabilityScore:.08,partsAvailabilityScore:.07,liquidityScore:.03,timeScore:.02} as const;
export const DEFAULT_GLOBAL_SCAN_CONFIG:GlobalScanConfig={categories:["smartphone","console","laptop","tv"],minPurchasePrice:0,maxPurchasePrice:500,radiusKm:null,location:{postalCode:null,latitude:null,longitude:null},maxListingsPerQuery:10,maxTotalListings:30,minimumRepairRelevance:40,minimumMarketConfidence:60,minimumPartsConfidence:65,minimumFinancialConfidence:60,maxRisk:70,minMargin:20,minRoi:10,concurrency:2,requestBudget:18,discoveryConcurrency:1,discoveryDelayMs:400,discoveryCacheTtlMs:120000};
export const DEFAULT_SEARCH_PROFILES:GlobalSearchProfile[]=[{id:"smartphones",category:"smartphone",queries:["iPhone cassé","iPhone pour pièces","Samsung écran cassé","téléphone HS","téléphone ne charge plus"],enabled:true,priority:1},{id:"consoles",category:"console",queries:["PS5 HS","PS5 HDMI","Switch HS","Xbox HS"],enabled:true,priority:1},{id:"computers",category:"laptop",queries:["MacBook écran cassé","MacBook HS","PC portable écran cassé","PC portable ne s'allume plus"],enabled:true,priority:2},{id:"tv",category:"tv",queries:["TV rétroéclairage","TV HS","TV écran noir"],enabled:true,priority:3}];
const clamp=(n:number)=>Math.round(Math.max(0,Math.min(100,n))*100)/100; const score=(value:number|null,scale:number)=>value===null?null:clamp(value/scale*100);
export type OpportunityScoreInput={purchaseCost:number|null;repairCost:number|null;marketValue:number|null;risk:number|null;globalConfidence:number|null;repairability:number|null;partsAvailability:number|null;repairMinutes:number|null;liquidityScore:number|null;financial:FinancialAnalysis|null};
export function calculateOpportunityScore(input:OpportunityScoreInput):OpportunityBreakdown{const invested=input.purchaseCost!==null&&input.repairCost!==null?input.purchaseCost+input.repairCost:null;const margin=invested!==null&&input.marketValue!==null?input.marketValue-invested:null;const efficiency=margin!==null&&invested!>0?margin/invested!:null;const roi=input.financial?.roiLow??(efficiency===null?null:efficiency*100);const parts:OpportunityBreakdown={profitScore:score(margin,200),roiScore:score(roi,150),capitalEfficiencyScore:score(efficiency,1.5),riskScore:input.risk===null?null:100-input.risk,confidenceScore:input.globalConfidence,repairabilityScore:input.repairability,partsAvailabilityScore:input.partsAvailability,liquidityScore:input.liquidityScore,timeScore:input.repairMinutes===null?null:clamp(100-input.repairMinutes/6),overallOpportunityScore:null,capitalEfficiency:efficiency===null?null:Math.round(efficiency*1000)/1000,completeness:0};let total=0,weights=0,known=0;for(const [key,weight] of Object.entries(OPPORTUNITY_WEIGHTS)){const value=parts[key as keyof typeof OPPORTUNITY_WEIGHTS] as number|null;if(value!==null){total+=value*weight;weights+=weight;known++;}}parts.completeness=Math.round(known/Object.keys(OPPORTUNITY_WEIGHTS).length*100);parts.overallOpportunityScore=margin===null||roi===null?null:clamp(total/Math.max(weights,1)*Math.min(1,parts.completeness/.65));return parts;}
const numeric=(x:number|null,asc=false)=>x===null?(asc?Infinity:-Infinity):x;
export function rankGlobalOpportunities(items:GlobalOpportunity[],mode:GlobalSortMode="overall"){const field=(o:GlobalOpportunity)=>mode==="margin"?o.estimatedNetMargin:mode==="roi"?o.roi:mode==="capital_efficiency"?o.opportunityBreakdown.capitalEfficiency:mode==="lowest_budget"?o.estimatedPurchaseCost:mode==="lowest_risk"?o.risk:mode==="highest_confidence"?o.confidence:o.opportunityScore;const asc=mode==="lowest_budget"||mode==="lowest_risk";return [...items].sort((a,b)=>asc?numeric(field(a),true)-numeric(field(b),true):numeric(field(b))-numeric(field(a)));}
function addBadges(items:GlobalOpportunity[]){const ready=items.filter(x=>x.readiness==="ready");const award=(badge:RankingBadge,field:(x:GlobalOpportunity)=>number|null,asc=false)=>{const candidates=ready.filter(x=>field(x)!==null);if(!candidates.length)return;const best=[...candidates].sort((a,b)=>asc?field(a)!-field(b)!:field(b)!-field(a)!)[0];best.rankingBadges.push(badge);};award("best_overall",x=>x.opportunityScore);award("highest_margin",x=>x.estimatedNetMargin);award("highest_roi",x=>x.roi);award("lowest_budget",x=>x.estimatedPurchaseCost,true);award("lowest_risk",x=>x.risk,true);award("fast_repair",x=>x.opportunityBreakdown.timeScore);award("best_capital_efficiency",x=>x.opportunityBreakdown.capitalEfficiency);award("high_confidence",x=>x.confidence);}
export type GlobalNetworkBudget={remaining:number;consume():boolean};
export type OpportunityDiscoveryProvider={id:string;transport:string;route:string;search(query:string,config:GlobalScanConfig):Promise<LeboncoinListing[]>};
export type GlobalListingProvider=OpportunityDiscoveryProvider;
export type GlobalListingAnalyzer=(listing:LeboncoinListing,config:GlobalScanConfig,budget:GlobalNetworkBudget)=>Promise<GlobalOpportunity>;
const cache=new Map<string,{at:number,value:LeboncoinListing[]}>();
const blockingErrors=new Set<DiscoveryErrorCode>(["provider_datadome","provider_rate_limited","bridge_auth_error"]);
const unavailableErrors=new Set<DiscoveryErrorCode>(["provider_unavailable","provider_timeout","bridge_unavailable"]);
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function errorDetails(error:unknown):{code:DiscoveryErrorCode;status:number|null}{
  if(error instanceof ScannerRequestError)return{code:error.code as DiscoveryErrorCode,status:error.upstreamStatus??error.status};
  return{code:"provider_unavailable",status:null};
}
export function clearGlobalDiscoveryCache(){cache.clear();}
export async function runGlobalOpportunityScan(config:GlobalScanConfig,profiles:GlobalSearchProfile[],providerOrProviders:OpportunityDiscoveryProvider|OpportunityDiscoveryProvider[],analyze:GlobalListingAnalyzer):Promise<GlobalScanResult>{
  const providers=Array.isArray(providerOrProviders)?providerOrProviders:[providerOrProviders];
  const queries=profiles.filter(p=>p.enabled&&config.categories.includes(p.category)).sort((a,b)=>a.priority-b.priority).flatMap(p=>p.queries.map(query=>({query,category:p.category})));
  const providerDiagnostics:ProviderDiagnostic[]=providers.map(provider=>({providerId:provider.id,transport:provider.transport,route:provider.route,health:"available",queriesExecuted:0,errors:0,lastErrorCode:null,lastHttpStatus:null}));
  const consecutiveErrors=providers.map(()=>0);
  const diagnostics:ScanDiagnostics={queriesPlanned:queries.length*providers.length,queriesExecuted:0,cacheHits:0,listingsRaw:0,listingsRelevant:0,analysed:0,providerErrors:0,stoppedEarly:false,stopReason:null,discoveryConcurrency:1,queryDiagnostics:[],providers:providerDiagnostics};
  const unique=new Map<string,LeboncoinListing>();
  const budget:GlobalNetworkBudget={remaining:config.requestBudget,consume(){if(this.remaining<=0)return false;this.remaining--;return true;}};
  let successfulQueries=0;
  let shouldStop=false;
  let previousNetworkRequest=false;
  for(const item of queries){
    for(let providerIndex=0;providerIndex<providers.length;providerIndex++){
      const provider=providers[providerIndex];
      const providerState=providerDiagnostics[providerIndex];
      if(providerState.health==="blocked"||providerState.health==="unavailable")continue;
      const cacheKey=JSON.stringify([provider.id,item.query,config.minPurchasePrice,config.maxPurchasePrice,config.radiusKm,config.location]);
      const hit=cache.get(cacheKey);
      let found:LeboncoinListing[];
      if(hit&&Date.now()-hit.at<config.discoveryCacheTtlMs){
        found=hit.value;diagnostics.cacheHits++;successfulQueries++;consecutiveErrors[providerIndex]=0;
        diagnostics.queryDiagnostics.push({providerId:provider.id,query:item.query,source:"cache",outcome:"success",resultCount:found.length,durationMs:0,errorCode:null,httpStatus:null});
      }else{
        if(diagnostics.queriesExecuted>=config.requestBudget||!budget.consume()){diagnostics.stoppedEarly=true;diagnostics.stopReason="request_budget_reached";shouldStop=true;break;}
        if(previousNetworkRequest&&config.discoveryDelayMs>0)await wait(config.discoveryDelayMs);
        previousNetworkRequest=true;
        const started=Date.now();
        diagnostics.queriesExecuted++;providerState.queriesExecuted++;
        try{
          found=await provider.search(item.query,config);successfulQueries++;consecutiveErrors[providerIndex]=0;
          cache.set(cacheKey,{at:Date.now(),value:found});
          diagnostics.queryDiagnostics.push({providerId:provider.id,query:item.query,source:"network",outcome:"success",resultCount:found.length,durationMs:Date.now()-started,errorCode:null,httpStatus:200});
        }catch(error){
          const details=errorDetails(error);diagnostics.providerErrors++;providerState.errors++;consecutiveErrors[providerIndex]++;providerState.lastErrorCode=details.code;providerState.lastHttpStatus=details.status;
          providerState.health=blockingErrors.has(details.code)?"blocked":unavailableErrors.has(details.code)||consecutiveErrors[providerIndex]>=2?"unavailable":"degraded";
          diagnostics.queryDiagnostics.push({providerId:provider.id,query:item.query,source:"network",outcome:"error",resultCount:0,durationMs:Date.now()-started,errorCode:details.code,httpStatus:details.status});
          console.warn("opportunity_discovery_failure",{providerId:provider.id,query:item.query,errorCode:details.code,httpStatus:details.status,durationMs:Date.now()-started});
          if(providerState.health==="blocked"){diagnostics.stoppedEarly=true;diagnostics.stopReason=details.code;shouldStop=true;break;}
          continue;
        }
      }
      diagnostics.listingsRaw+=found.length;
      for(const listing of found){if(unique.size>=config.maxTotalListings)break;if(listing.price===null||listing.price<config.minPurchasePrice||listing.price>config.maxPurchasePrice||listing.repairRelevanceScore<config.minimumRepairRelevance)continue;unique.set(listing.id||listing.url,listing);}
      if(unique.size>=config.maxTotalListings){diagnostics.stoppedEarly=true;diagnostics.stopReason="max_total_listings_reached";shouldStop=true;break;}
    }
    if(shouldStop||providerDiagnostics.every(provider=>provider.health==="blocked"||provider.health==="unavailable")){if(!diagnostics.stopReason)diagnostics.stopReason="provider_unavailable";diagnostics.stoppedEarly=true;break;}
  }
  diagnostics.listingsRelevant=unique.size;
  const opportunities:GlobalOpportunity[]=[];const queue=[...unique.values()];let cursor=0;
async function worker(){while(cursor<queue.length){const listing=queue[cursor++];if(budget.remaining<=0){diagnostics.stoppedEarly=true;diagnostics.stopReason="request_budget_reached";break;}try{opportunities.push(await analyze(listing,config,budget));}catch(error){opportunities.push({listing,decisionContext:null,opportunityScore:null,opportunityBreakdown:calculateOpportunityScore({purchaseCost:listing.price,repairCost:null,marketValue:null,risk:null,globalConfidence:null,repairability:null,partsAvailability:null,repairMinutes:null,liquidityScore:null,financial:null}),estimatedPurchaseCost:listing.price,estimatedRepairCost:null,estimatedMarketValue:null,estimatedNetMargin:null,roi:null,maxRecommendedPurchasePrice:null,risk:null,confidence:null,readiness:"partial",primaryReason:"incomplete_financials",reasons:["incomplete_financials"],consequences:[],pipelineTrace:null,warnings:[error instanceof Error?error.message:"Analyse impossible"],rankingBadges:[],liquidity:null});}diagnostics.analysed++;}}
  await Promise.all(Array.from({length:Math.max(1,Math.min(config.concurrency,4))},worker));addBadges(opportunities);
  const status=successfulQueries===0&&diagnostics.providerErrors>0?"provider_unavailable":diagnostics.providerErrors>0||diagnostics.stopReason==="request_budget_reached"?"partial":"complete";
  return{status,readyOpportunities:rankGlobalOpportunities(opportunities.filter(x=>x.readiness==="ready")),partialOpportunities:opportunities.filter(x=>x.readiness==="partial"),rejectedOpportunities:opportunities.filter(x=>x.readiness==="rejected"),diagnostics};
}
