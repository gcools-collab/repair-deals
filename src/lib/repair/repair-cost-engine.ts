import { searchSupplierOffers } from "../suppliers/index.ts";
import type { PartOffer, SupplierSearchDiagnostic } from "../suppliers/index.ts";
import type { FaultType } from "../product-analysis/types.ts";
import type { RepairCostEstimate, RepairCostInput, RepairFinancialProjection, RepairFinancialProjectionInput, RepairScenario } from "./repair-types.ts";

type Template={label:string;partType:string|null;probability:number};
const templates:Partial<Record<FaultType,Template[]>>={
  broken_screen:[{label:"display assembly",partType:"screen_assembly",probability:1}],cracked_screen:[{label:"display assembly",partType:"screen_assembly",probability:1}],display_issue:[{label:"display assembly",partType:"screen_assembly",probability:.7},{label:"display connector",partType:"display_connector",probability:.3}],
  no_power:[{label:"charger",partType:"charger",probability:.2},{label:"power connector",partType:"charging_port",probability:.35},{label:"motherboard",partType:"motherboard",probability:.45}],
  charging_issue:[{label:"charging port",partType:"charging_port",probability:.65},{label:"charging controller",partType:"charging_controller",probability:.35}],battery_issue:[{label:"battery",partType:"battery",probability:1}],hdmi_issue:[{label:"HDMI port",partType:"hdmi_port",probability:.75},{label:"HDMI circuit",partType:"hdmi_circuit",probability:.25}],motherboard_issue:[{label:"motherboard",partType:"motherboard",probability:1}],backlight_issue:[{label:"LED backlight strips",partType:"led_strips",probability:.75},{label:"backlight board",partType:"backlight_board",probability:.25}],storage_issue:[{label:"storage module",partType:"storage_module",probability:1}],controller_issue:[{label:"controller module",partType:"controller_parts",probability:1}],
};
const round=(value:number)=>Math.round(value*100)/100;
const best=(offers:PartOffer[])=>offers.filter(offer=>offer.availability!=="out_of_stock").sort((a,b)=>b.confidence-a.confidence||a.totalPrice-b.totalPrice)[0]||null;

export async function estimateRepairCost(input:RepairCostInput):Promise<RepairCostEstimate>{
  const fault=input.diagnosticScenarios?.[0]?.fault||(input.diagnostic?.fault!=="unknown_fault"?input.diagnostic?.fault:input.detectedFaults.find(item=>item!=="unknown_fault")||null);
  if(!fault)return{status:"diagnostic_unknown",requiredParts:[],optionalParts:[],scenarios:[],partsCostMin:null,partsCostExpected:null,partsCostMax:null,shippingEstimate:null,repairCostExpected:null,confidence:null,assumptions:[],missingInputs:["diagnostic"],supplierDiagnostics:[]};
  const definitions:Template[]=input.diagnosticScenarios?.length?input.diagnosticScenarios.map(item=>({label:item.repairAction,partType:item.requiredPartType||null,probability:item.probability??0})):templates[fault as FaultType]||[];if(!definitions.length)return{status:"partial",requiredParts:[],optionalParts:[],scenarios:[],partsCostMin:null,partsCostExpected:null,partsCostMax:null,shippingEstimate:null,repairCostExpected:null,confidence:input.diagnostic?.confidence??input.diagnosticScenarios?.[0]?.diagnosticConfidence??null,assumptions:[`No repair scenario is defined for ${fault}.`],missingInputs:["repair_scenarios"],supplierDiagnostics:[]};
  const diagnostics:SupplierSearchDiagnostic[]=[];const scenarios:RepairScenario[]=[];const diagnosticConfidence=input.diagnosticScenarios?.[0]?.diagnosticConfidence??input.diagnostic?.confidence??50;
  for(const [index,definition] of definitions.entries()){
    const seeded=(input.seedOffers||[]).filter(offer=>offer.partType===definition.partType);
    const result=definition.partType?await searchSupplierOffers({category:input.device.category,brand:input.device.brand,model:input.device.model,deviceReference:input.device.confirmedReference||input.device.manufacturerReference||input.device.modelNumber,partType:definition.partType,diagnostic:input.diagnostic},input.suppliers||[]):{status:"complete" as const,offers:[],diagnostics:[]};
    diagnostics.push(...result.diagnostics);const offers=[...seeded,...result.offers];const selected=best(offers);
    scenarios.push({id:`${fault}-${index+1}`,label:definition.label,partType:definition.partType,probability:definition.probability,offers,selectedOffer:selected,partsCost:selected?.price??null,shippingCost:selected?.shippingPrice??null,totalCost:selected?.totalPrice??null,confidence:selected?Math.min(diagnosticConfidence,selected.confidence):0,assumptions:[`Scenario probability ${round(definition.probability*100)}% is a diagnostic prior, not a confirmed fault.`]});
  }
  const costed=scenarios.filter(scenario=>scenario.totalCost!==null);const allCosted=costed.length===scenarios.length;
  const expected=allCosted?round(scenarios.reduce((sum,scenario)=>sum+scenario.probability*scenario.totalCost!,0)):null;
  const shipping=allCosted?round(scenarios.reduce((sum,scenario)=>sum+scenario.probability*(scenario.shippingCost||0),0)):null;
  return{status:allCosted?"complete":"partial",requiredParts:definitions.length===1?[definitions[0].label]:[],optionalParts:definitions.length>1?definitions.map(item=>item.label):[],scenarios,partsCostMin:costed.length?Math.min(...costed.map(item=>item.partsCost!)):null,partsCostExpected:expected===null?null:round(expected-shipping!),partsCostMax:costed.length?Math.max(...costed.map(item=>item.partsCost!)):null,shippingEstimate:shipping,repairCostExpected:expected,confidence:allCosted?round(scenarios.reduce((sum,scenario)=>sum+scenario.probability*scenario.confidence,0)):null,assumptions:definitions.length>1?["Several diagnostic scenarios remain possible; the expected cost is probability-weighted."]:[],missingInputs:allCosted?[]:["parts_cost"],supplierDiagnostics:diagnostics};
}

export function projectRepairFinancials(input:RepairFinancialProjectionInput):RepairFinancialProjection{
  const missing=[input.purchasePrice===null?"purchase_price":null,input.repair.repairCostExpected===null?"parts_cost":null,input.marketValueExpected===null?"resale_value":null].filter((item):item is string=>item!==null);
  const reserve=input.riskReserve??null;const total=input.purchasePrice!==null&&input.repair.repairCostExpected!==null?round(input.purchasePrice+input.repair.repairCostExpected+(reserve||0)):null;
  const expected=input.marketValueExpected!==null&&total!==null?round(input.marketValueExpected-total):null;const worst=input.marketValueLow!==null&&input.purchasePrice!==null&&input.repair.partsCostMax!==null&&input.repair.shippingEstimate!==null?round(input.marketValueLow-input.purchasePrice-input.repair.partsCostMax-input.repair.shippingEstimate-(reserve||0)):null;
  return{purchasePrice:input.purchasePrice,partsCost:input.repair.partsCostExpected,shippingCost:input.repair.shippingEstimate,riskReserve:reserve,estimatedTotalCost:total,marketValueLow:input.marketValueLow,marketValueExpected:input.marketValueExpected,marketValueHigh:input.marketValueHigh,expectedProfit:expected,worstCaseProfit:worst,roi:expected!==null&&total!==null&&total>0?round(expected/total*100):null,readiness:missing.length?"incomplete":"complete",missingInputs:missing};
}
