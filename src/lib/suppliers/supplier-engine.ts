import type { PartOffer, PartSearchQuery, SupplierAdapter, SupplierSearchResult } from "./types.ts";

function key(offer:PartOffer){return [offer.supplier.id,offer.productUrl||"",offer.partReference||"",offer.title,offer.totalPrice,offer.currency].join("|").toLowerCase()}

export async function searchSupplierOffers(query:PartSearchQuery,adapters:SupplierAdapter[],options:{allowMockData?:boolean}={}):Promise<SupplierSearchResult>{
  if(adapters.length===0)return{status:"unavailable",offers:[],diagnostics:[]};
  const settled=await Promise.all(adapters.map(async adapter=>{try{const offers=await adapter.searchParts(query);return{offers,diagnostic:{supplierId:adapter.id,status:offers.length?"success":"no_results",offerCount:offers.length,message:null} as const}}catch(error){return{offers:[],diagnostic:{supplierId:adapter.id,status:"unavailable",offerCount:0,message:error instanceof Error?error.message:"supplier_error"} as const}}}));
  const offers=[...new Map(settled.flatMap(result=>result.offers).filter(offer=>Number.isFinite(offer.totalPrice)&&offer.totalPrice>=0&&(options.allowMockData||!offer.supplier.isMock)).map(offer=>[key(offer),offer])).values()];
  const failures=settled.filter(result=>result.diagnostic.status==="unavailable").length;
  return{status:failures===adapters.length?"unavailable":failures?"partial":"complete",offers,diagnostics:settled.map(result=>result.diagnostic)};
}
