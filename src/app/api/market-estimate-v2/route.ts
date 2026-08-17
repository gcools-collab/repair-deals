import { analyzeProductV2 } from "@/lib/product-intelligence";
import { estimateMarketV2, type MarketComparableProvider } from "@/lib/market-intelligence-v2";
import { leboncoinMarketProviderV2 } from "@/lib/market-intelligence-v2/provider";
import type { ProductAnalysisInput } from "@/lib/product-analysis";

export const runtime = "nodejs";
type MarketRouteInput = ProductAnalysisInput & { reference?: string | null; detectedFaults?: string[] | null; limit?: number };
function parse(value: unknown): MarketRouteInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Le corps doit être un objet");
  const input=value as Record<string,unknown>; if(typeof input.title!=="string"||!input.title.trim()||input.title.length>500) throw new TypeError("title est requis (500 caractères maximum)");
  const optional=(key:string,max:number)=>{const v=input[key]; if(v==null||v==="")return null;if(typeof v!=="string"||v.length>max)throw new TypeError(`${key} est invalide`);return v.trim();};
  if(input.limit!==undefined&&(!Number.isInteger(input.limit)||Number(input.limit)<1||Number(input.limit)>35)) throw new TypeError("limit doit être un entier entre 1 et 35");
  return {title:input.title.trim(),description:optional("description",10000),brand:optional("brand",200),model:optional("model",300),reference:optional("reference",200),attributes:input.attributes as ProductAnalysisInput["attributes"],repairKeywords:input.repairKeywords as string[]|undefined,detectedFaults:input.detectedFaults as string[]|null|undefined,limit:input.limit as number|undefined};
}
export function createMarketEstimateV2Handler(provider: MarketComparableProvider=leboncoinMarketProviderV2){ return async (request:Request)=>{ try { const input=parse(await request.json()); const analysisInput:ProductAnalysisInput={...input,title:[input.title,input.reference].filter(Boolean).join(" "),repairKeywords:[...(input.repairKeywords||[]),...(input.detectedFaults||[])]}; const {product}=analyzeProductV2(analysisInput); return Response.json({identity:product,estimate:await estimateMarketV2({identity:product,limit:input.limit},provider)}); } catch(error){ if(error instanceof SyntaxError)return Response.json({error:{code:"invalid_json",message:"JSON invalide"}},{status:400}); if(error instanceof TypeError)return Response.json({error:{code:"validation_error",message:error.message}},{status:422}); return Response.json({error:{code:"market_estimate_v2_failed",message:"L’estimation marché V2 a échoué ; aucun fallback V1 n’a été appliqué."}},{status:502}); } }; }
export const POST=createMarketEstimateV2Handler();
