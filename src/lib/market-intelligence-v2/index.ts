import type { MarketEstimate } from "../deal-economics/types.ts";
import type { LeboncoinListing } from "../leboncoin-scanner.ts";
import { resolveDeviceIdentity, type ResolvedProductIdentity } from "../product-intelligence/index.ts";
import type { MarketComparableProvider, MarketComparableV2, MarketEstimateV2, MarketEstimateV2Adapter, MarketEstimateV2Request, MarketQueryTier, MarketV2Thresholds } from "./types.ts";
import { classifyListingSubject, type ListingSubjectKind } from "./subject-classifier.ts";

export * from "./types.ts";
export * from "./subject-classifier.ts";

export const MARKET_V2_THRESHOLDS: MarketV2Thresholds = { minimumComparables: 5, minimumAverageSimilarity: 70, minimumStrongComparables: 3, strongSimilarity: 80, acceptanceSimilarity: 55, maximumRelativeDispersion: .75, minimumReadyConfidence: 60 };
const clean = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ") || null;
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function queryText(...values: Array<string | number | null | undefined>) { const seen=new Set<string>(); return values.flatMap(value=>String(value??"").trim().split(/\s+/)).filter(token=>{const key=norm(token);if(!key||seen.has(key))return false;seen.add(key);return true;}).join(" "); }

export function buildMarketQueryTiers(identity: ResolvedProductIdentity): MarketQueryTier[] {
  const tiers: MarketQueryTier[] = [];
  const family = clean(identity.family || identity.model); const brand = clean(identity.brand);
  const explicit = clean(identity.confirmedReference || identity.manufacturerReference || identity.modelNumber);
  if (explicit) tiers.push({ tier: 1, query: queryText(explicit, family), requiredIdentityFields: ["confirmedReference"], confidence: 95, rationale: "Référence fabricant explicite" });
  const probable = identity.probableReferences.find((r) => r.confidence >= 80 && norm(r.reference) !== norm(explicit || ""));
  if (probable) tiers.push({ tier: 2, query: queryText(probable.reference, family), requiredIdentityFields: ["probableReferences", "family"], confidence: probable.confidence, rationale: "Référence probable fiable et famille" });
  const detailed = queryText(brand, family, identity.screenSize, identity.year, identity.variant);
  if (family && (identity.year || identity.screenSize || identity.variant)) tiers.push({ tier: 3, query: detailed, requiredIdentityFields: ["family", "year", "screenSize", "variant"], confidence: 82, rationale: "Identité physique détaillée" });
  const model = queryText(brand, family, identity.generation || identity.model, identity.screenSize, identity.variant);
  if (family && model) tiers.push({ tier: 4, query: model, requiredIdentityFields: ["family", "generation"], confidence: 68, rationale: "Famille et génération/modèle" });
  if (family) tiers.push({ tier: 5, query: family, requiredIdentityFields: ["family"], confidence: 40, rationale: "Famille générique, dernier recours" });
  const seen = new Set<string>(); return tiers.filter((t) => { const q = norm(t.query); if (!q || seen.has(q)) return false; seen.add(q); return true; });
}

const has = (text: string, value: string | number | null) => value !== null && value !== "" && new RegExp(`(?:^| )${norm(String(value)).replace(/ /g, " +")}(?: |$)`).test(text);
function variants(text: string) { return { promax: /\bpro max\b/.test(text), pro: /\bpro\b/.test(text), mini: /\bmini\b/.test(text), max: /\bmax\b/.test(text), touchbar: /\btouch ?bar\b/.test(text) }; }
function expectedSubject(objectKind:ResolvedProductIdentity["objectKind"]):ListingSubjectKind{return objectKind==="device"?"complete_device":objectKind;}
const subjectReason:Partial<Record<ListingSubjectKind,string>>={game:"game_not_device",empty_box:"empty_box",service:"service",spare_part:"spare_part",accessory:"accessory",vehicle:"vehicle",bundle:"large_bundle",unrelated:"unrelated",unknown:"wrong_subject_kind"};
export function scoreMarketComparable(identity: ResolvedProductIdentity, listing: LeboncoinListing, acceptance = MARKET_V2_THRESHOLDS.acceptanceSimilarity, searchTier:MarketQueryTier["tier"]|null=null): MarketComparableV2 {
  const text = norm(`${listing.title} ${listing.description || ""} ${listing.brand || ""} ${listing.modelReference || ""}`); const matches: string[] = []; const conflicts: string[] = []; const exclusions: string[] = []; const conditions: string[] = [];
  const comparableIdentity=resolveDeviceIdentity({title:listing.title,description:listing.description,brand:listing.brand,model:listing.modelReference,attributes:listing.attributes});
  const estimatedObjectKind=comparableIdentity.objectKind;
  const subject=classifyListingSubject(listing),estimatedSubjectKind=subject.kind;
  const conditionPatterns: Array<[string, RegExp]> = [["neuf", /\bneuf\b/], ["comme neuf", /comme neuf/], ["très bon état", /tres bon etat/], ["bon état", /bon etat/], ["état correct", /etat correct/]];
  for (const [label, pattern] of conditionPatterns) if (pattern.test(text)) conditions.push(label);
  if (listing.price === null || listing.price <= 0) exclusions.push("Prix absent ou invalide");
  if (["service", "lot"].includes(listing.listingKind)) exclusions.push(`Type d'annonce non comparable: ${listing.listingKind}`);
  if(estimatedObjectKind!==identity.objectKind){conflicts.push(`Type d'objet incompatible: ${estimatedObjectKind}`);exclusions.push(`Type d'objet incompatible: ${estimatedObjectKind}`);}
  if(estimatedSubjectKind!==expectedSubject(identity.objectKind))exclusions.push(subjectReason[estimatedSubjectKind]||"wrong_subject_kind");
  if (listing.likelyBroken || /\b(hs|pour pieces?|ecran casse|ne s allume|defaut majeur|reparation a prevoir|a reparer)\b/.test(text)) exclusions.push("Produit non fonctionnel ou réparation à prévoir");
  if(identity.objectKind!=="accessory"&&/\b(coque|housse|cable|chargeur)\b/.test(text)) exclusions.push("Accessoire incompatible avec l’objet recherché");
  if(identity.objectKind!=="spare_part"&&/\b(piece detachee|joystick|stick analogique)\b/.test(text)) exclusions.push("Pièce détachée incompatible avec l’objet recherché");
  if(/\b(service|reparation)\b/.test(text)) exclusions.push("Service non comparable");
  if(identity.objectKind!=="controller"&&/\b(manette|controller|controleur|dualsense|joy con)\b/.test(text)) exclusions.push("Contrôleur incompatible avec l’objet recherché");
  let score = 0;
  const refs = [identity.confirmedReference, identity.manufacturerReference, identity.modelNumber, ...identity.probableReferences.map((r) => r.reference)].filter(Boolean) as string[];
  if (refs.some((r) => has(text, r))) { score += 35; matches.push("Référence exacte"); }
  const controllerPlatformMatch=identity.objectKind==="controller"&&comparableIdentity.objectKind==="controller"&&identity.compatiblePlatform!==null&&identity.compatiblePlatform===comparableIdentity.compatiblePlatform;
  const familyOrModelMatch=has(text,identity.family)||has(text,identity.model)||controllerPlatformMatch;
  if (familyOrModelMatch) { score += 55; matches.push("Famille/modèle"); } else { conflicts.push("Famille/modèle absent"); score -= 25; }
  if (has(text, identity.brand)) { score += 5; matches.push("Marque"); }
  if (identity.year) { if (has(text, identity.year)) { score += 10; matches.push("Année"); } else { const years = text.match(/\b20\d{2}\b/g)?.map(Number) || []; if (years.length && !years.includes(identity.year)) { score -= 18; conflicts.push(`Année contradictoire: ${years[0]}`); } } }
  if (identity.screenSize) { const sizes = [...text.matchAll(/\b(1[0-9](?:[.,]\d)?)\s*(?:pouces?|inch|\")?/g)].map((m) => Number(m[1].replace(",", "."))); if (sizes.some((s) => Math.abs(s - identity.screenSize!) < .4)) { score += 10; matches.push("Taille écran"); } else if (sizes.length) { score -= 30; conflicts.push(`Taille écran contradictoire: ${sizes[0]}`); exclusions.push("Taille d'écran incompatible"); } }
  if (identity.variant) { if (has(text, identity.variant) || (norm(identity.variant).includes("touch bar") && variants(text).touchbar)) { score += 12; matches.push("Variante"); } }
  if (identity.storage && has(text, identity.storage)) { score += 4; matches.push("Stockage"); }
  if (norm(identity.family || identity.model || "").includes("iphone")) { const target = variants(norm(identity.variant || identity.model || identity.family || "")); const item = variants(text); if (target.pro !== item.pro || target.promax !== item.promax || target.mini !== item.mini) { conflicts.push("Variante iPhone incompatible"); exclusions.push("Variante iPhone incompatible"); score -= 45; } }
  if (/\bps4\b/.test(text) && norm(`${identity.family} ${identity.model}`).includes("ps5")) { conflicts.push("Génération PS4 incompatible"); exclusions.push("Génération incompatible"); score -= 60; }
  const targetText=norm(`${identity.family} ${identity.model} ${identity.variant}`);
  if(/\bswitch\b/.test(targetText)&&!/\bswitch\s*2\b/.test(targetText)&&/\bswitch\s*2\b/.test(text)){conflicts.push("Génération Switch 2 incompatible");exclusions.push("wrong_generation");score-=60;}
  for(const requiredVariant of ["oled","lite"]){if(new RegExp(`\\b${requiredVariant}\\b`).test(targetText)&&!new RegExp(`\\b${requiredVariant}\\b`).test(text)){conflicts.push(`Variante ${requiredVariant.toUpperCase()} absente`);exclusions.push("wrong_variant");score-=30;}}
  if(searchTier===5&&(!familyOrModelMatch||Boolean(identity.brand&&!has(text,identity.brand))||conflicts.length>0))exclusions.push("tier5_identity_insufficient");
  score = Math.max(0, Math.min(100, score)); if (score < acceptance) exclusions.push(`Similarité insuffisante (${score}/100)`);
  return { listing, estimatedObjectKind, estimatedSubjectKind, bundleSeverity:subject.bundleSeverity, subjectEvidence:subject.evidence, similarityScore: score, identityMatches: matches, identityConflicts: conflicts, conditionSignals: conditions, excluded: exclusions.length > 0, exclusionReasons: [...new Set(exclusions)] };
}

function quantile(sorted: number[], q: number) { const p = (sorted.length - 1) * q; const b = Math.floor(p); const r = p - b; return sorted[b] + ((sorted[b + 1] ?? sorted[b]) - sorted[b]) * r; }
export function robustWeightedPrices(comparables: MarketComparableV2[]) {
  const priced = comparables.filter((c) => !c.excluded && c.listing.price !== null).sort((a,b) => a.listing.price! - b.listing.price!); if (!priced.length) return { items: [], low: null, median: null, high: null, weightedMedian: null, effectiveSampleSize: 0, dispersion: 1 };
  const prices = priced.map((c) => c.listing.price!); const q1 = quantile(prices,.25), q3=quantile(prices,.75), iqr=q3-q1; const lo=q1-1.5*iqr, hi=q3+1.5*iqr; const items = priced.filter((c) => c.listing.price! >= lo && c.listing.price! <= hi); const p=items.map((c)=>c.listing.price!); const low=quantile(p,.25), median=quantile(p,.5), high=quantile(p,.75); const weights=items.map((c)=>Math.pow(c.similarityScore/100,2)); const total=weights.reduce((a,b)=>a+b,0); let cumulative=0, wm=p[0]; for(let i=0;i<p.length;i++){ cumulative+=weights[i]; if(cumulative>=total/2){wm=p[i];break;} } const ess=total ? total*total/weights.reduce((a,b)=>a+b*b,0):0; return {items, low, median, high, weightedMedian:wm, effectiveSampleSize:Math.round(ess*100)/100, dispersion: median ? (high-low)/median : 1};
}

function confidence(identity: ResolvedProductIdentity, tier: number, items: MarketComparableV2[], dispersion: number, thresholds: MarketV2Thresholds) { const avg=items.reduce((s,c)=>s+c.similarityScore,0)/Math.max(items.length,1); const strong=items.filter((c)=>c.similarityScore>=thresholds.strongSimilarity).length/Math.max(items.length,1); return Math.round(Math.max(0,Math.min(100, identity.confidence*.2 + (100-(tier-1)*15)*.15 + Math.min(items.length/thresholds.minimumComparables,1)*20 + avg*.25 + strong*100*.1 + Math.max(0,1-dispersion/thresholds.maximumRelativeDispersion)*10))); }
const key = (l: LeboncoinListing) => l.id || l.url || `${norm(l.title)}|${l.price}`;
export async function estimateMarketV2(request: MarketEstimateV2Request, provider: MarketComparableProvider): Promise<MarketEstimateV2> {
  const thresholds={...MARKET_V2_THRESHOLDS,...request.thresholds}; const tiers=buildMarketQueryTiers(request.identity); const attempted: MarketEstimateV2["tiersAttempted"]=[], all=new Map<string,{listing:LeboncoinListing;tier:MarketQueryTier["tier"]}>(); const excluded=new Map<string,MarketComparableV2>(); let accepted: MarketComparableV2[]=[]; let tierUsed: MarketEstimateV2["tierUsed"]=null; const warnings:string[]=[];
  if(!tiers.length) return {status:"identity_too_vague",lowPrice:null,medianPrice:null,highPrice:null,weightedMedian:null,sampleSize:0,effectiveSampleSize:0,confidence:0,tierUsed:null,tiersAttempted:[],comparables:[],excludedComparables:[],retrievedAt:new Date().toISOString(),source:provider.name,warnings:["Identité trop vague pour construire une requête marché."]};
  try { for(const tier of tiers){ const found=await provider.search(tier.query,request.limit??35); found.forEach((listing)=>{const itemKey=key(listing);if(!all.has(itemKey))all.set(itemKey,{listing,tier:tier.tier});}); const scored=[...all.values()].map((item)=>scoreMarketComparable(request.identity,item.listing,thresholds.acceptanceSimilarity,item.tier)); accepted=scored.filter((c)=>!c.excluded); scored.filter((c)=>c.excluded).forEach((c)=>excluded.set(key(c.listing),c)); const avg=Math.round(accepted.reduce((s,c)=>s+c.similarityScore,0)/Math.max(accepted.length,1)); const strong=accepted.filter((c)=>c.similarityScore>=thresholds.strongSimilarity).length; const sufficient=accepted.length>=thresholds.minimumComparables&&avg>=thresholds.minimumAverageSimilarity&&strong>=thresholds.minimumStrongComparables; attempted.push({tier:tier.tier,query:tier.query,rawCount:found.length,validCount:accepted.length,averageSimilarity:avg,strongCount:strong,stopReason:sufficient?"Seuils de qualité et quantité atteints":null}); tierUsed=tier.tier; if(sufficient) break; } } catch(e){ return {status:"provider_error",lowPrice:null,medianPrice:null,highPrice:null,weightedMedian:null,sampleSize:0,effectiveSampleSize:0,confidence:0,tierUsed,tiersAttempted:attempted,comparables:accepted,excludedComparables:[...excluded.values()],retrievedAt:new Date().toISOString(),source:provider.name,warnings:[e instanceof Error?e.message:"Provider marché indisponible"]}; }
  const stats=robustWeightedPrices(accepted); const conf=confidence(request.identity,tierUsed||5,stats.items,stats.dispersion,thresholds); let status:MarketEstimateV2["status"]="success"; if(stats.items.length<thresholds.minimumComparables) status="insufficient_comparables"; else if(stats.dispersion>thresholds.maximumRelativeDispersion) status="prices_too_dispersed"; if(stats.items.length<accepted.length) warnings.push(`${accepted.length-stats.items.length} outlier(s) écarté(s) par IQR.`); if(status!=="success") warnings.push(status==="prices_too_dispersed"?"Dispersion des prix trop forte.":"Échantillon comparable insuffisant.");
  return {status,lowPrice:status==="success"?stats.low:null,medianPrice:status==="success"?stats.median:null,highPrice:status==="success"?stats.high:null,weightedMedian:status==="success"?stats.weightedMedian:null,sampleSize:stats.items.length,effectiveSampleSize:stats.effectiveSampleSize,confidence:conf,tierUsed,tiersAttempted:attempted,comparables:stats.items.sort((a,b)=>b.similarityScore-a.similarityScore),excludedComparables:[...excluded.values()],retrievedAt:new Date().toISOString(),source:provider.name,warnings};
}

export function adaptMarketEstimateV2(result: MarketEstimateV2, minimumConfidence=MARKET_V2_THRESHOLDS.minimumReadyConfidence): MarketEstimateV2Adapter { const ready=result.status==="success"&&result.confidence>=minimumConfidence; const estimate:MarketEstimate={lowPrice:result.lowPrice,medianPrice:result.medianPrice,highPrice:result.highPrice,confidence:ready?result.confidence:null,sampleSize:result.sampleSize,source:{kind:"provider",name:result.source,retrievedAt:result.retrievedAt},comparableItems:result.comparables.map((c)=>({id:c.listing.id,title:c.listing.title,price:c.listing.price,url:c.listing.url,observedAt:c.listing.publishedAt,matchScore:c.similarityScore}))}; return {estimate,marketReady:ready}; }
