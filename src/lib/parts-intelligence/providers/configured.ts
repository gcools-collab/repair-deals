import type { PartsSearchV2Provider } from "../../parts-search-v2/types.ts";
import { EbayBrowseClient, ebayConfigFromEnv, type EbayClientConfig } from "./ebay-client.ts";
import { EbayPartsProvider } from "./ebay.ts";

let ebayProviderCache: { config: EbayClientConfig; provider: EbayPartsProvider } | undefined;

function sameConfig(left: EbayClientConfig, right: EbayClientConfig) {
  return left.clientId === right.clientId && left.clientSecret === right.clientSecret &&
    left.environment === right.environment && left.marketplaceId === right.marketplaceId;
}

export function configuredEbayProvider() {
  const config = ebayConfigFromEnv();
  if (!config) return null;
  if (!ebayProviderCache || !sameConfig(ebayProviderCache.config, config)) {
    ebayProviderCache = { config, provider: new EbayPartsProvider(new EbayBrowseClient(config)) };
  }
  return ebayProviderCache.provider;
}

export function resetEbayProviderForTests() {
  ebayProviderCache = undefined;
}

export function configuredAutomaticPartProviders(): PartsSearchV2Provider[] {
  return [{ id: "ebay", name: "eBay", provider: configuredEbayProvider() }];
}
