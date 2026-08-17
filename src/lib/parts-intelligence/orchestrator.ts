import { rankPartCandidates } from "./ranking.ts";
import type { PartCandidate } from "./types.ts";
import type {
  PartRequirementSearchResult,
  PartSearchTier,
  TierAttempt,
  TieredPartsSearchConfig,
  TieredPartsSearchInput,
  TieredPartsSearchResult,
} from "./orchestrator-types.ts";
import type { PrecisePartRequirement } from "../product-intelligence/index.ts";

export const DEFAULT_TIERED_SEARCH_CONFIG: TieredPartsSearchConfig = {
  thresholds: {
    minimumAcceptableCandidates: 3,
    minimumAcceptableCompatibility: 65,
    minimumHighCompatibility: 80,
    minimumOverallScore: 65,
  },
  searchAlternatives: true,
};

function normalize(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function candidateKeys(candidate: PartCandidate) {
  const provider = candidate.provider?.id || "unknown-provider";
  const keys: string[] = [];
  if (candidate.providerItemId) keys.push(`item:${provider}:${candidate.providerItemId}`);
  if (candidate.url) keys.push(`url:${normalize(candidate.url)}`);
  if (candidate.partName && candidate.unitPrice !== null) {
    keys.push(`fallback:${normalize(candidate.partName)}:${candidate.unitPrice}:${candidate.currency || ""}`);
  }
  if (keys.length === 0) keys.push(`id:${provider}:${candidate.id}`);
  return keys;
}

function completeness(candidate: PartCandidate) {
  return [candidate.partName, candidate.unitPrice, candidate.shippingCost, candidate.quality,
    candidate.sellerMetadata?.feedbackCount, candidate.deliveryEstimate?.maxDate,
    candidate.returnPolicy?.returnsAccepted, candidate.compatibilityConfidence]
    .filter((value) => value !== null && value !== undefined).length;
}

function mergeCandidate(preferred: PartCandidate, other: PartCandidate): PartCandidate {
  const selected = completeness(other) > completeness(preferred) ? other : preferred;
  return { ...selected, evidence: [...new Set([...preferred.evidence, ...other.evidence])] };
}

export function deduplicatePartCandidates(candidates: PartCandidate[]) {
  const results: PartCandidate[] = [];
  const keyToIndex = new Map<string, number>();
  for (const candidate of candidates) {
    const keys = candidateKeys(candidate);
    const existingIndex = keys.map((key) => keyToIndex.get(key)).find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const index = results.push(candidate) - 1;
      keys.forEach((key) => keyToIndex.set(key, index));
      continue;
    }
    results[existingIndex] = mergeCandidate(results[existingIndex], candidate);
    candidateKeys(results[existingIndex]).forEach((key) => keyToIndex.set(key, existingIndex));
  }
  return results;
}

function resolvedConfig(input: TieredPartsSearchInput): TieredPartsSearchConfig {
  return {
    searchAlternatives: input.config?.searchAlternatives ?? DEFAULT_TIERED_SEARCH_CONFIG.searchAlternatives,
    thresholds: { ...DEFAULT_TIERED_SEARCH_CONFIG.thresholds, ...(input.config?.thresholds || {}) },
  };
}

function queryGroups(requirement: PrecisePartRequirement) {
  const groups = new Map<PartSearchTier, string[]>();
  for (const query of requirement.queryTiers) {
    const current = groups.get(query.tier) || [];
    if (!current.some((item) => normalize(item) === normalize(query.query))) current.push(query.query);
    groups.set(query.tier, current);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

function thresholdsMet(attempt: TierAttempt, config: TieredPartsSearchConfig) {
  return attempt.acceptableCandidateCount >= config.thresholds.minimumAcceptableCandidates &&
    attempt.highCompatibilityCount >= 1 &&
    (attempt.bestOverallScore ?? 0) >= config.thresholds.minimumOverallScore;
}

async function searchRequirement(
  input: TieredPartsSearchInput,
  requirement: PrecisePartRequirement,
  role: "primary" | "alternative",
  config: TieredPartsSearchConfig,
): Promise<PartRequirementSearchResult> {
  const emptyRanking = () => rankPartCandidates(requirement, [], { now: input.now });
  if (input.providers.length === 0) return { role, requirement, tierUsed: null, tiersAttempted: [], candidates: [], ranking: emptyRanking(), stopReason: "no_providers", warnings: ["Aucun fournisseur de pièces n’est configuré."] };
  const groups = queryGroups(requirement);
  if (groups.length === 0) return { role, requirement, tierUsed: null, tiersAttempted: [], candidates: [], ranking: emptyRanking(), stopReason: "no_queries", warnings: ["Aucune requête suffisamment précise n’est disponible."] };

  const accumulated: PartCandidate[] = [];
  const tiersAttempted: TierAttempt[] = [];
  const warnings: string[] = [];
  let ranking = emptyRanking();
  for (const [tier, queries] of groups) {
    const settled = await Promise.all(input.providers.map(async (provider) => {
      try {
        return { provider, candidates: await provider.search(input.providerInput, queries), error: null };
      } catch (error) {
        return { provider, candidates: [] as PartCandidate[], error: error instanceof Error ? error.message : "Erreur fournisseur inconnue" };
      }
    }));
    const raw = settled.flatMap((result) => result.candidates);
    accumulated.push(...raw);
    const unique = deduplicatePartCandidates(accumulated);
    accumulated.splice(0, accumulated.length, ...unique);
    ranking = rankPartCandidates(requirement, unique, { now: input.now });
    const acceptable = ranking.allRanked.filter((item) => item.eligible && item.compatibilityScore >= config.thresholds.minimumAcceptableCompatibility);
    const errors = settled.filter((item) => item.error).map((item) => ({ providerId: item.provider.descriptor.id, message: item.error as string }));
    errors.forEach((error) => warnings.push(`${error.providerId}: ${error.message}`));
    const attempt: TierAttempt = {
      tier, queries, providerIds: input.providers.map((provider) => provider.descriptor.id),
      rawCandidateCount: raw.length, uniqueCandidateCount: unique.length,
      acceptableCandidateCount: acceptable.length,
      highCompatibilityCount: acceptable.filter((item) => item.compatibilityScore >= config.thresholds.minimumHighCompatibility).length,
      bestOverallScore: ranking.allRanked[0]?.overallScore ?? null,
      providerErrors: errors,
    };
    tiersAttempted.push(attempt);
    if (thresholdsMet(attempt, config)) {
      return { role, requirement, tierUsed: tier, tiersAttempted, candidates: unique, ranking, stopReason: "quality_thresholds_met", warnings: [...new Set(warnings)] };
    }
  }
  return { role, requirement, tierUsed: tiersAttempted.at(-1)?.tier ?? null, tiersAttempted, candidates: [...accumulated], ranking, stopReason: "tiers_exhausted", warnings: [...new Set(warnings)] };
}

export async function orchestrateTieredPartsSearch(input: TieredPartsSearchInput): Promise<TieredPartsSearchResult> {
  const config = resolvedConfig(input);
  const primaryResults: PartRequirementSearchResult[] = [];
  for (const requirement of input.partRequirements.primaryRequirements) {
    primaryResults.push(await searchRequirement(input, requirement, "primary", config));
  }
  const alternativeResults: PartRequirementSearchResult[] = [];
  if (config.searchAlternatives) {
    for (const requirement of input.partRequirements.alternativeRequirements) {
      alternativeResults.push(await searchRequirement(input, requirement, "alternative", config));
    }
  }
  const allResults = [...primaryResults, ...alternativeResults];
  return { primaryResults, alternativeResults, allResults, warnings: [...new Set(allResults.flatMap((result) => result.warnings))] };
}
