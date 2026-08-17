import type {
  DealDecisionContext,
  DealDecisionContextInput,
  DealDecisionReadiness,
  DealDecisionStage,
} from "./types.ts";

export * from "./types.ts";

function computeReadiness(input: DealDecisionContextInput): DealDecisionReadiness {
  const identityReady = Boolean(
    input.resolvedIdentity && input.resolvedIdentity.confidence >= 60 &&
    input.resolvedIdentity.brand && (input.resolvedIdentity.model || input.resolvedIdentity.family),
  );
  const diagnosticReady = Boolean(
    input.selectedDiagnostic && input.selectedDiagnostic.confidence > 0 &&
    (input.selectedDiagnostic.confirmedCauses.length > 0 || input.selectedDiagnostic.probableCauses.length > 0),
  );
  const partsReady = input.selectedParts.length > 0;
  const marketReady = Boolean(
    input.marketEstimate?.medianPrice !== null && input.marketEstimate?.medianPrice !== undefined &&
    input.marketEstimate?.confidence !== null && input.marketEstimate?.confidence !== undefined,
  );
  const financialReady = input.financialEstimate?.readiness === "ready";
  const decisionReady = identityReady && diagnosticReady && partsReady && marketReady && financialReady &&
    input.financialEstimate?.financialConfidence !== null &&
    input.financialEstimate?.financialConfidence !== undefined &&
    input.financialEstimate.validationErrors.length === 0;
  const missing = [
    !identityReady ? "Identité produit suffisamment précise" : null,
    !diagnosticReady ? "Diagnostic sélectionné avec causes exploitables" : null,
    !partsReady ? "Au moins une pièce compatible sélectionnée" : null,
    !marketReady ? "Estimation marché avec médiane et confiance" : null,
    !financialReady ? "Analyse financière complète" : null,
    financialReady && !decisionReady ? "Confiance financière suffisante pour décider" : null,
  ].filter((value): value is string => value !== null);
  let currentStage: DealDecisionStage = "incomplete";
  if (identityReady) currentStage = "identity_ready";
  if (identityReady && diagnosticReady) currentStage = "diagnostic_ready";
  if (identityReady && diagnosticReady && partsReady) currentStage = "parts_ready";
  if (identityReady && diagnosticReady && partsReady && marketReady) currentStage = "market_ready";
  if (identityReady && diagnosticReady && partsReady && marketReady && financialReady) currentStage = "financial_ready";
  if (decisionReady) currentStage = "decision_ready";
  return { identityReady, diagnosticReady, partsReady, marketReady, financialReady, decisionReady, currentStage, missing };
}

export function createDealDecisionContext(input: DealDecisionContextInput): DealDecisionContext {
  const readiness = computeReadiness(input);
  const warnings = [...new Set([
    ...(input.warnings || []),
    ...(input.resolvedIdentity?.contradictions || []),
    ...(input.partSearchResults?.warnings || []),
    ...readiness.missing.map((item) => `Manquant : ${item}.`),
  ])];
  return { ...input, readiness, warnings };
}
