import { analyzeProduct } from "../product-analysis/index.ts";
import { analyzeProductV2, resolvePrecisePartRequirements } from "../product-intelligence/index.ts";
import {
  orchestrateTieredPartsSearch,
  type PartRequirementSearchResult,
  type RankedPartCandidate,
} from "../parts-intelligence/index.ts";
import type {
  PartPreselectionDecision,
  PartsSearchV2Input,
  PartsSearchV2Provider,
  PartsSearchV2Response,
  PublicProviderStatus,
} from "./types.ts";

export * from "./types.ts";

function requirementId(result: PartRequirementSearchResult) {
  return `${result.requirement.diagnosticFault}:${result.requirement.partType}:${result.requirement.normalizedPartName.toLowerCase()}`;
}

export function evaluatePartPreselection(
  result: PartRequirementSearchResult,
  selectedDiagnosticConfirmed: boolean,
): PartPreselectionDecision {
  const recommended: RankedPartCandidate | null = result.ranking.recommended;
  const reasons: string[] = [];
  if (!recommended) reasons.push("Aucun candidat ne dépasse les seuils de recommandation.");
  if (!selectedDiagnosticConfirmed) reasons.push("Le diagnostic n’a pas été confirmé par l’utilisateur.");
  if (result.requirement.confirmedReferences.length === 0) reasons.push("Aucune référence produit confirmée ou explicite n’est disponible.");
  if (recommended && recommended.compatibilityScore < 90) reasons.push("La compatibilité reste inférieure au seuil de préselection de 90/100.");
  if (recommended && recommended.overallScore < 75) reasons.push("Le score global reste inférieur au seuil de préselection de 75/100.");
  return {
    requirementId: requirementId(result),
    candidateId: recommended?.candidate.id || null,
    allowed: reasons.length === 0,
    reasons,
  };
}

function providerStatuses(
  providers: PartsSearchV2Provider[],
  results: PartRequirementSearchResult[],
): PublicProviderStatus[] {
  const hasAnyCandidates = results.some((result) => result.candidates.length > 0);
  return providers.map(({ id, name, provider }) => {
    if (!provider) return { id, name, configured: false, status: "not_configured" as const, attemptedTiers: 0, errorCount: 0 };
    const attempts = results.flatMap((result) => result.tiersAttempted).filter((attempt) => attempt.providerIds.includes(id));
    const errors = attempts.flatMap((attempt) => attempt.providerErrors).filter((error) => error.providerId === id);
    const hasProviderCandidates = results.some((result) => result.candidates.some((candidate) => candidate.provider?.id === id));
    const status = errors.length > 0
      ? hasAnyCandidates ? "partial_failure" as const : "failed" as const
      : hasProviderCandidates ? "success" as const : "no_results" as const;
    return { id, name, configured: true, status, attemptedTiers: attempts.length, errorCount: errors.length };
  });
}

export async function executePartsSearchV2(
  input: PartsSearchV2Input,
  providerEntries: PartsSearchV2Provider[],
): Promise<PartsSearchV2Response> {
  const baseV1 = analyzeProduct(input);
  const requestedFaults = [...new Set([
    ...baseV1.detectedFaults,
    ...(input.detectedFaults || []),
    ...(input.confirmedFault ? [input.confirmedFault] : []),
  ])];
  const v1Analysis = requestedFaults.length === baseV1.detectedFaults.length && requestedFaults.every((fault) => baseV1.detectedFaults.includes(fault))
    ? baseV1
    : { ...baseV1, detectedFaults: requestedFaults, faultConfidence: Math.max(baseV1.faultConfidence, input.confirmedFault ? 90 : 60) };
  const v2 = analyzeProductV2({ ...input, model: input.model || input.reference, v1Analysis });
  const selectedDiagnostic = input.confirmedFault
    ? v2.diagnostics.find((diagnostic) => diagnostic.fault === input.confirmedFault) || null
    : null;
  const diagnosticsForRequirements = selectedDiagnostic ? [selectedDiagnostic] : v2.diagnostics;
  const requirements = resolvePrecisePartRequirements({ product: v2.product, diagnostics: diagnosticsForRequirements });
  const providers = providerEntries.flatMap((entry) => entry.provider ? [entry.provider] : []);
  const searchResults = await orchestrateTieredPartsSearch({
    resolvedIdentity: v2.product,
    diagnostics: diagnosticsForRequirements,
    partRequirements: requirements,
    providerInput: {
      category: v2.product.category,
      brand: v2.product.brand,
      model: v2.product.model,
      reference: v2.product.confirmedReference || v2.product.manufacturerReference || v2.product.modelNumber,
      detectedFaults: requestedFaults,
      confirmedFault: input.confirmedFault,
      currency: input.currency || "EUR",
    },
    providers,
  });
  const allResults = searchResults.allResults;
  const providerStatus = providerStatuses(providerEntries, allResults);
  const preselectionDecisions = searchResults.primaryResults.map((result) =>
    evaluatePartPreselection(result, Boolean(input.confirmedFault && selectedDiagnostic)),
  );
  const warnings = [...new Set([
    ...searchResults.warnings,
    ...providerStatus.filter((status) => status.status === "not_configured").map((status) => `${status.name} n’est pas configuré.`),
    ...providerStatus.filter((status) => status.status === "failed").map((status) => `${status.name} a échoué sans résultat exploitable.`),
    ...preselectionDecisions.flatMap((decision) => decision.allowed ? [] : decision.reasons),
  ])];
  return {
    identity: v2.product,
    diagnostics: v2.diagnostics,
    selectedDiagnostic,
    requirements,
    searchResults,
    primaryResults: searchResults.primaryResults,
    alternativeResults: searchResults.alternativeResults,
    preselectionDecisions,
    providerStatus,
    warnings,
    v1Analysis,
  };
}
