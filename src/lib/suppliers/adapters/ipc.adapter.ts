import type { PartOffer, PartSearchQuery, SupplierAdapter } from "../types.ts";

export interface IPCIntegration { searchParts(query:PartSearchQuery):Promise<PartOffer[]> }
export class IPCAdapter implements SupplierAdapter {
  readonly id="ipc-computer"; readonly name="IPC Computer"; readonly sourceTypes=["reference_catalog","supplier"] as const; readonly isMock=false;
  constructor(private readonly integration:IPCIntegration|null=null){}
  async searchParts(query:PartSearchQuery){if(!this.integration)throw new Error("ipc_integration_not_configured");return this.integration.searchParts(query)}
}
