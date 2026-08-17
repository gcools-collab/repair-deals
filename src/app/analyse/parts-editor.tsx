"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateSelectedParts,
  PART_QUALITIES,
  planParts,
  rankPartCandidates,
  type PartCandidate,
  type PartEstimateResult,
  type PartQuality,
  type PartRequirement,
  type PartType,
} from "@/lib/parts-intelligence";
import { createManualPartCandidate } from "@/lib/parts-intelligence/providers/manual";
import { analyzeProductV2 } from "@/lib/product-intelligence";
import type { PartsSearchV2Response } from "@/lib/parts-search-v2";
import {
  FAULT_LABELS,
  type FaultType,
  type ProductAnalysisResult,
} from "@/lib/product-analysis";

type Props = {
  identity: ProductAnalysisResult | null;
  originalTitle: string;
  result: PartEstimateResult | null;
  onResult: (result: PartEstimateResult) => void;
  onV2Result: (result: PartsSearchV2Response | null) => void;
};

const RANKING_BADGE_LABELS = {
  recommended: "Recommandée",
  best_value: "Meilleure valeur",
  cheapest: "Moins chère",
  fastest: "Plus rapide",
  safest: "Plus sûre",
  oem: "OEM indiqué",
  highest_compatibility: "Compatibilité maximale",
} as const;

type ManualRow = {
  id: string;
  partType: PartType | "";
  partName: string;
  partReference: string;
  quantity: string;
  unitPrice: string;
  shippingCost: string;
  quality: PartQuality;
  selected: boolean;
  retrievedAt: string;
};

const QUALITY_LABELS: Record<PartQuality, string> = {
  original_oem: "Original OEM",
  original_pulled: "Original démonté",
  premium_compatible: "Compatible premium",
  compatible: "Compatible",
  refurbished: "Reconditionné",
  unknown: "Qualité inconnue",
};

function nullableNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowCandidate(row: ManualRow, model: string | null): PartCandidate {
  return createManualPartCandidate({
    id: row.id,
    retrievedAt: row.retrievedAt,
    partType: row.partType || null,
    partName: row.partName.trim() || null,
    partReference: row.partReference.trim() || null,
    compatibleModels: model ? [model] : null,
    quantity: nullableNumber(row.quantity),
    unitPrice: nullableNumber(row.unitPrice),
    currency: "EUR",
    shippingCost: nullableNumber(row.shippingCost),
    quality: row.quality,
    availability: "unknown",
    url: null,
  });
}

function euro(value: number | null) {
  if (value === null) return "À estimer";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function money(value: number | null, currency: string | null) {
  if (value === null || !currency) return "Inconnu";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value);
}

export default function PartsEditor({ identity, originalTitle, result, onResult, onV2Result }: Props) {
  const [confirmedFault, setConfirmedFault] = useState<FaultType | "">(identity?.detectedFaults.length === 1 ? identity.detectedFaults[0] : "");
  const [faultExplicitlyConfirmed, setFaultExplicitlyConfirmed] = useState(false);
  const [rows, setRows] = useState<ManualRow[]>([]);
  const [selectedAutoIds, setSelectedAutoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v2Response, setV2Response] = useState<PartsSearchV2Response | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  function searchInput(fault: FaultType | "" = confirmedFault) {
    if (!identity) return { category: "unknown" as const, brand: null, model: null, reference: null, detectedFaults: [], confirmedFault: null, currency: "EUR" };
    return {
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      reference: identity.reference,
      detectedFaults: identity.detectedFaults,
      confirmedFault: fault || null,
      currency: "EUR",
    };
  }

  function publish(nextRows: ManualRow[], baseResult: PartEstimateResult | null = result) {
    const input = searchInput();
    if (!input) return;
    const plan = baseResult || planParts(input);
    const manualCandidates = nextRows.map((row) => rowCandidate(row, identity?.model || null));
    const automaticCandidates = plan.candidates.filter((candidate) => candidate.provider?.kind !== "manual");
    const candidates = [...automaticCandidates, ...manualCandidates];
    onResult(aggregateSelectedParts(
      plan,
      candidates,
      [...selectedAutoIds, ...nextRows.filter((row) => row.selected).map((row) => row.id)],
    ));
  }

  function updateRows(nextRows: ManualRow[]) {
    setRows(nextRows);
    publish(nextRows);
  }

  function addPart() {
    const id = "manual-ui-" + Date.now();
    updateRows([...rows, {
      id,
      partType: result?.probableParts[0]?.partType || "",
      partName: "",
      partReference: "",
      quantity: "1",
      unitPrice: "",
      shippingCost: "",
      quality: "unknown",
      selected: true,
      retrievedAt: new Date().toISOString(),
    }]);
  }

  function updateRow(id: string, update: Partial<ManualRow>) {
    updateRows(rows.map((row) => row.id === id ? { ...row, ...update } : row));
  }

  function toggleAutomatic(id: string, selected: boolean) {
    const nextIds = selected ? [...new Set([...selectedAutoIds, id])] : selectedAutoIds.filter((value) => value !== id);
    setSelectedAutoIds(nextIds);
    if (!result) return;
    const manualCandidates = rows.map((row) => rowCandidate(row, identity?.model || null));
    onResult(aggregateSelectedParts(result, [...result.candidates.filter((candidate) => candidate.provider?.kind !== "manual"), ...manualCandidates],
      [...nextIds, ...rows.filter((row) => row.selected).map((row) => row.id)]));
  }

  function chooseFault(value: FaultType | "") {
    setConfirmedFault(value);
    setFaultExplicitlyConfirmed(Boolean(value));
    setV2Response(null);
    onV2Result(null);
    if (!identity) return;
    const nextPlan = planParts({
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      reference: identity.reference,
      detectedFaults: identity.detectedFaults,
      confirmedFault: value || null,
      currency: "EUR",
    });
    const candidates = rows.map((row) => rowCandidate(row, identity.model));
    onResult(aggregateSelectedParts(nextPlan, candidates, rows.filter((row) => row.selected).map((row) => row.id)));
  }

  async function prepareSearchesV1() {
    const input = searchInput();
    if (!input) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parts-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const body = (await response.json()) as PartEstimateResult | { error?: { message?: string } };
      if (!response.ok) {
        throw new Error("error" in body ? body.error?.message || "Préparation impossible" : "Préparation impossible");
      }
      const plan = body as PartEstimateResult;
      const automaticIds = plan.selectedCandidates.filter((candidate) => candidate.provider?.id === "ebay").map((candidate) => candidate.id);
      setSelectedAutoIds(automaticIds);
      const manualCandidates = rows.map((row) => rowCandidate(row, identity?.model || null));
      onResult(aggregateSelectedParts(plan, [...plan.candidates, ...manualCandidates],
        [...automaticIds, ...rows.filter((row) => row.selected).map((row) => row.id)]));
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Préparation impossible");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function prepareSearchesV2() {
    if (!identity || !originalTitle.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parts-search-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: originalTitle,
          brand: identity.brand,
          model: identity.model,
          reference: identity.reference,
          detectedFaults: identity.detectedFaults,
          confirmedFault: faultExplicitlyConfirmed ? confirmedFault || null : null,
          currency: "EUR",
        }),
        signal: controller.signal,
      });
      const body = await response.json() as PartsSearchV2Response | { error?: { message?: string } };
      if (!response.ok) throw new Error("error" in body ? body.error?.message || "Recherche V2 impossible" : "Recherche V2 impossible");
      const next = body as PartsSearchV2Response;
      setV2Response(next);
      onV2Result(next);
      setSelectedAutoIds([]);
      const candidates = [...new Map(next.searchResults.allResults.flatMap((item) => item.candidates).map((candidate) => [candidate.id, candidate])).values()];
      const plan = planParts(searchInput());
      const manualCandidates = rows.map((row) => rowCandidate(row, identity.model));
      onResult(aggregateSelectedParts(plan, [...candidates, ...manualCandidates], rows.filter((row) => row.selected).map((row) => row.id)));
    } catch (caught) {
      if (!controller.signal.aborted) {
        setV2Response(null);
        onV2Result(null);
        setError(caught instanceof Error ? caught.message : "Recherche V2 impossible");
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  const probableParts: PartRequirement[] = result?.probableParts || [];
  const ebayCandidates = useMemo(
    () => result?.candidates.filter((candidate) => candidate.provider?.id === "ebay") || [],
    [result],
  );
  const preciseRequirement = useMemo(() => {
    if (!identity || !originalTitle.trim()) return null;
    return analyzeProductV2({ title: originalTitle, v1Analysis: identity }).partRequirements.primaryRequirements[0] || null;
  }, [identity, originalTitle]);
  const ranking = useMemo(() => preciseRequirement && ebayCandidates.length > 0
    ? rankPartCandidates(preciseRequirement, ebayCandidates)
    : null, [ebayCandidates, preciseRequirement]);
  const rankedEbayCandidates = ranking?.allRanked || [];

  return (
    <section className="parts-section">
      <div className="parts-heading">
        <div><p className="eyebrow">PARTS INTELLIGENCE</p><h2>Pièces nécessaires</h2></div>
        <div className="parts-search-actions">
          <button type="button" className="parts-prepare" disabled={!identity || loading} onClick={prepareSearchesV2}>
            {loading ? "Recherche…" : "Rechercher les pièces (V2)"}
          </button>
          <button type="button" disabled={!identity || loading} onClick={prepareSearchesV1}>Recherche V1</button>
        </div>
      </div>

      <label className="parts-fault">
        <span>Panne retenue</span>
        <select value={confirmedFault} disabled={!identity} onChange={(event) => chooseFault(event.target.value as FaultType | "")}>
          <option value="">Aucune panne confirmée</option>
          {identity?.detectedFaults.map((fault) => <option key={fault} value={fault}>{FAULT_LABELS[fault]}</option>)}
        </select>
      </label>

      {!identity && <p className="parts-state">L’identification produit est nécessaire avant de préparer les recherches.</p>}
      {error && <p className="parts-error">{error}</p>}
      {result && <p className="parts-state">{result.message}</p>}

      {probableParts.length > 0 && (
        <div className="probable-parts">
          <strong>Types de pièces probables — diagnostic à confirmer</strong>
          <div>{probableParts.map((part) => <span key={part.partType}>{part.label}</span>)}</div>
        </div>
      )}

      {result && result.searchQueries.length > 0 && (
        <details className="part-queries">
          <summary>Requêtes proposées ({result.searchQueries.length})</summary>
          <ul>{result.searchQueries.map((query) => <li key={query}>{query}</li>)}</ul>
        </details>
      )}

      {v2Response && (
        <div className="parts-v2-results">
          <div className="v2-identity-summary">
            <strong>{[v2Response.identity.brand, v2Response.identity.model || v2Response.identity.family].filter(Boolean).join(" ")}</strong>
            <span>Confiance identité : {v2Response.identity.confidence}/100</span>
            <span>Diagnostic : {v2Response.selectedDiagnostic ? FAULT_LABELS[v2Response.selectedDiagnostic.fault] : "non confirmé"}</span>
          </div>
          {v2Response.providerStatus.map((provider) => <p className="parts-state" key={provider.id}>{provider.name} : {provider.status}</p>)}
          {v2Response.primaryResults.map((searchResult) => (
            <section className="v2-requirement-group" key={`primary-${searchResult.requirement.partType}-${searchResult.requirement.normalizedPartName}`}>
              <div className="ebay-candidates-heading"><strong>Besoin principal — {searchResult.requirement.normalizedPartName}</strong><span>Tier utilisé : {searchResult.tierUsed ?? "aucun"} · tentés : {searchResult.tiersAttempted.map((tier) => tier.tier).join(", ") || "aucun"}</span></div>
              <div className="parts-ranking-summary">
                <div><span>Pièce recommandée</span><strong>{searchResult.ranking.recommended?.candidate.partName || "Aucune recommandation assez fiable"}</strong></div>
                <div><span>Meilleure valeur</span><strong>{searchResult.ranking.bestValue?.candidate.partName || "Indisponible"}</strong></div>
                <div><span>Moins chère</span><strong>{searchResult.ranking.cheapest?.candidate.partName || "Coût rendu inconnu"}</strong></div>
                <div><span>Plus rapide</span><strong>{searchResult.ranking.fastest?.candidate.partName || "Délai inconnu"}</strong></div>
                <div><span>Plus sûre</span><strong>{searchResult.ranking.safest?.candidate.partName || "Indisponible"}</strong></div>
              </div>
              {searchResult.ranking.allRanked.map((ranked) => <article className={`ebay-candidate${ranked.eligible ? "" : " ranking-excluded"}`} key={ranked.candidate.id}>
                <label className="part-selected"><input type="checkbox" checked={selectedAutoIds.includes(ranked.candidate.id)} disabled={!ranked.eligible} onChange={(event) => toggleAutomatic(ranked.candidate.id, event.target.checked)} /><span>Confirmer cette pièce</span></label>
                <div className="ebay-candidate-main"><strong>{ranked.candidate.partName}</strong><div className="ranking-badges">{ranked.badges.map((badge) => <span key={badge}>{RANKING_BADGE_LABELS[badge]}</span>)}</div><span>Compatibilité : {ranked.compatibilityScore}/100 · qualité : {ranked.qualityScore}/100</span></div>
                <dl><div><dt>Score global</dt><dd>{ranked.overallScore}/100</dd></div><div><dt>Coût rendu</dt><dd>{money(ranked.landedCost, ranked.candidate.currency)}</dd></div><div><dt>Vendeur</dt><dd>{ranked.sellerScore}/100</dd></div><div><dt>Livraison</dt><dd>{ranked.deliveryScore}/100</dd></div><div><dt>Garantie / retour</dt><dd>{ranked.warrantyScore}/100</dd></div></dl>
                {(ranked.exclusionReasons.length > 0 || ranked.warnings.length > 0) && <div className="ranking-warnings">{[...ranked.exclusionReasons, ...ranked.warnings].map((warning) => <span key={warning}>{warning}</span>)}</div>}
              </article>)}
            </section>
          ))}
          {v2Response.alternativeResults.length > 0 && <details className="v2-alternatives"><summary>Alternatives diagnostiques ({v2Response.alternativeResults.length})</summary>{v2Response.alternativeResults.map((searchResult) => <div key={`${searchResult.requirement.partType}-${searchResult.requirement.normalizedPartName}`}><strong>{searchResult.requirement.normalizedPartName}</strong><span>Tier {searchResult.tierUsed ?? "—"} · {searchResult.candidates.length} candidat(s) · recommandation : {searchResult.ranking.recommended?.candidate.partName || "aucune"}</span></div>)}</details>}
          {v2Response.warnings.length > 0 && <details><summary>Avertissements V2 ({v2Response.warnings.length})</summary><ul>{v2Response.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
        </div>
      )}

      {!v2Response && ebayCandidates.length > 0 && (
        <div className="ebay-candidates">
          <div className="ebay-candidates-heading">
            <strong>Candidats eBay</strong>
            <span>{ebayCandidates.length} résultat(s) issu(s) de l’API officielle</span>
          </div>
          {ranking && (
            <div className="parts-ranking-summary">
              <div><span>Pièce recommandée</span><strong>{ranking.recommended?.candidate.partName || "Aucune recommandation assez fiable"}</strong></div>
              <div><span>Meilleure valeur</span><strong>{ranking.bestValue?.candidate.partName || "Indisponible"}</strong></div>
              <div><span>Moins chère</span><strong>{ranking.cheapest?.candidate.partName || "Coût rendu inconnu"}</strong></div>
              <div><span>Plus rapide</span><strong>{ranking.fastest?.candidate.partName || "Délai inconnu"}</strong></div>
              <div><span>Plus sûre</span><strong>{ranking.safest?.candidate.partName || "Indisponible"}</strong></div>
            </div>
          )}
          {(ranking ? rankedEbayCandidates : ebayCandidates.map((candidate) => ({ candidate, badges: [], warnings: [], evidence: [], overallScore: null, compatibilityScore: null, qualityScore: null, landedCost: candidate.totalPrice, sellerScore: null, deliveryScore: null, warrantyScore: null, riskPenalty: null, eligible: true, exclusionReasons: [] }))).map((ranked) => {
            const candidate = ranked.candidate;
            return <article className={`ebay-candidate${ranked.eligible ? "" : " ranking-excluded"}`} key={candidate.id}>
              <label className="part-selected">
                <input type="checkbox" checked={selectedAutoIds.includes(candidate.id)}
                  onChange={(event) => toggleAutomatic(candidate.id, event.target.checked)} />
                <span>Utiliser dans le calcul</span>
              </label>
              <div className="ebay-candidate-main">
                <strong>{candidate.partName}</strong>
                {ranked.badges.length > 0 && <div className="ranking-badges">{ranked.badges.map((badge) => <span key={badge}>{RANKING_BADGE_LABELS[badge]}</span>)}</div>}
                <span>Condition : {candidate.condition || "inconnue"} · Qualité : {candidate.quality || "unknown"}</span>
                <span>Compatibilité : {ranked.compatibilityScore === null ? candidate.compatibilityConfidence ?? 0 : ranked.compatibilityScore}/100</span>
                {candidate.seller && <span>Vendeur : {candidate.seller}</span>}
              </div>
              <dl>
                <div><dt>Score global</dt><dd>{ranked.overallScore === null ? "À calculer" : `${ranked.overallScore}/100`}</dd></div>
                <div><dt>Qualité</dt><dd>{ranked.qualityScore === null ? "À confirmer" : `${ranked.qualityScore}/100`}</dd></div>
                <div><dt>Coût rendu</dt><dd>{money(ranked.landedCost, candidate.currency)}</dd></div>
                <div><dt>Vendeur</dt><dd>{ranked.sellerScore === null ? "Inconnu" : `${ranked.sellerScore}/100`}</dd></div>
                <div><dt>Livraison</dt><dd>{ranked.deliveryScore === null ? money(candidate.shippingCost, candidate.currency) : `${ranked.deliveryScore}/100`}</dd></div>
                <div><dt>Garantie / retour</dt><dd>{ranked.warrantyScore === null ? "Inconnu" : `${ranked.warrantyScore}/100`}</dd></div>
                <div><dt>Risque</dt><dd>{ranked.riskPenalty === null ? "À évaluer" : `−${ranked.riskPenalty}`}</dd></div>
              </dl>
              {(ranked.warnings.length > 0 || ranked.exclusionReasons.length > 0) && <div className="ranking-warnings">{[...ranked.exclusionReasons, ...ranked.warnings].map((warning) => <span key={warning}>{warning}</span>)}</div>}
              {candidate.url && <a href={candidate.url} target="_blank" rel="noreferrer">Voir sur eBay ↗</a>}
              <details><summary>Preuves et traçabilité</summary><ul>{[...candidate.evidence, ...ranked.evidence].map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                <small>Item ID : {candidate.providerItemId} · relevé le {candidate.retrievedAt}</small>
              </details>
            </article>;
          })}
        </div>
      )}

      <div className="manual-parts-heading">
        <div><strong>Pièces saisies manuellement</strong><span>Une livraison vide reste inconnue ; saisir 0 € pour confirmer la gratuité.</span></div>
        <button type="button" onClick={addPart}>+ Ajouter une pièce</button>
      </div>

      <div className="manual-parts-list">
        {rows.map((row) => {
          const candidate = rowCandidate(row, identity?.model || null);
          return (
            <article className="manual-part" key={row.id}>
              <label className="part-selected"><input type="checkbox" checked={row.selected} onChange={(event) => updateRow(row.id, { selected: event.target.checked })} /><span>Inclure dans le coût</span></label>
              <label><span>Type</span><select value={row.partType} onChange={(event) => updateRow(row.id, { partType: event.target.value as PartType | "" })}><option value="">Autre / inconnu</option>{probableParts.map((part) => <option value={part.partType} key={part.partType}>{part.label}</option>)}</select></label>
              <label><span>Nom</span><input value={row.partName} onChange={(event) => updateRow(row.id, { partName: event.target.value })} placeholder="Ex. Port HDMI" /></label>
              <label><span>Référence</span><input value={row.partReference} onChange={(event) => updateRow(row.id, { partReference: event.target.value })} placeholder="À confirmer" /></label>
              <label><span>Qualité</span><select value={row.quality} onChange={(event) => updateRow(row.id, { quality: event.target.value as PartQuality })}>{PART_QUALITIES.map((quality) => <option value={quality} key={quality}>{QUALITY_LABELS[quality]}</option>)}</select></label>
              <label><span>Quantité</span><input type="number" min="1" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} /></label>
              <label><span>Prix unitaire</span><input type="number" min="0" value={row.unitPrice} onChange={(event) => updateRow(row.id, { unitPrice: event.target.value })} placeholder="À estimer" /></label>
              <label><span>Livraison</span><input type="number" min="0" value={row.shippingCost} onChange={(event) => updateRow(row.id, { shippingCost: event.target.value })} placeholder="À estimer" /></label>
              <div className="part-total"><span>Total</span><strong>{euro(candidate.totalPrice)}</strong><small>Source : saisie utilisateur · confiance : à estimer</small></div>
              <button className="part-delete" type="button" onClick={() => updateRows(rows.filter((item) => item.id !== row.id))}>Supprimer</button>
            </article>
          );
        })}
        {rows.length === 0 && <p className="parts-empty">Aucune pièce saisie. Aucun coût de réparation n’est généré.</p>}
      </div>

      <div className="parts-total">
        <span>Coût des pièces sélectionnées</span>
        <strong>{euro(result?.partsCostLow ?? null)}</strong>
        <small>Confiance : {result?.confidence === null || result?.confidence === undefined ? "À estimer" : result.confidence + "/100"}</small>
      </div>
    </section>
  );
}
