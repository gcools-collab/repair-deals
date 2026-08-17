import type { FaultType } from "../product-analysis/types.ts";
import type { DiagnosticHypothesis, ResolvedProductIdentity } from "../product-intelligence/index.ts";
import type { PartOffer, SupplierAdapter, SupplierSearchDiagnostic } from "../suppliers/index.ts";
import type { DiagnosticRepairScenario } from "../diagnostic-intelligence-v2/types.ts";

export type RepairScenario = { id:string; label:string; partType:string|null; probability:number; offers:PartOffer[]; selectedOffer:PartOffer|null; partsCost:number|null; shippingCost:number|null; totalCost:number|null; confidence:number; assumptions:string[] };
export type RepairCostInput = { device:ResolvedProductIdentity; diagnostic:DiagnosticHypothesis|null; detectedFaults:FaultType[]; diagnosticScenarios?:DiagnosticRepairScenario[]; suppliers?:SupplierAdapter[]; seedOffers?:PartOffer[] };
export type RepairCostEstimate = {
  status:"complete"|"partial"|"diagnostic_unknown";
  requiredParts:string[]; optionalParts:string[]; scenarios:RepairScenario[];
  partsCostMin:number|null; partsCostExpected:number|null; partsCostMax:number|null;
  shippingEstimate:number|null; repairCostExpected:number|null;
  confidence:number|null; assumptions:string[]; missingInputs:string[];
  supplierDiagnostics:SupplierSearchDiagnostic[];
};

export type RepairFinancialProjectionInput={purchasePrice:number|null;repair:RepairCostEstimate;marketValueLow:number|null;marketValueExpected:number|null;marketValueHigh:number|null;riskReserve?:number|null};
export type RepairFinancialProjection={purchasePrice:number|null;partsCost:number|null;shippingCost:number|null;riskReserve:number|null;estimatedTotalCost:number|null;marketValueLow:number|null;marketValueExpected:number|null;marketValueHigh:number|null;expectedProfit:number|null;worstCaseProfit:number|null;roi:number|null;readiness:"complete"|"incomplete";missingInputs:string[]};
