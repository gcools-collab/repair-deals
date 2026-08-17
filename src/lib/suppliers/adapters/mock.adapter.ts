import type { PartOffer, PartSearchQuery, SupplierAdapter } from "../types.ts";
export class MockSupplierAdapter implements SupplierAdapter {
  readonly id="mock-dev";readonly name="Mock supplier (development only)";readonly sourceTypes=["supplier"] as const;readonly isMock=true;
  constructor(private readonly fixtures:PartOffer[]=[]){ }
  async searchParts(query:PartSearchQuery){return this.fixtures.filter(offer=>offer.partType===query.partType)}
}
