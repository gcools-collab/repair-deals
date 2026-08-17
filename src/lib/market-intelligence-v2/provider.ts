import { scanLeboncoin } from "../leboncoin-scanner.ts";
import type { MarketComparableProvider } from "./types.ts";

export const leboncoinMarketProviderV2: MarketComparableProvider = { id:"leboncoin", name:"Leboncoin V2", async search(query,limit){ return (await scanLeboncoin({query,limit,broken_only:false})).results; } };
