"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { analyzeDeal } from "@/lib/deal-engine";
import {
  analyzeFinancials,
  type FinancialAnalysisInput,
  type MarketEstimate,
  type RepairEstimate,
} from "@/lib/deal-economics";
import { toDealEngineInput } from "@/lib/deal-economics/deal-engine-adapter";
import type { MarketEstimateResult } from "@/lib/market-intelligence";
import { toRepairEstimate, type PartEstimateResult } from "@/lib/parts-intelligence";
import PartsEditor from "./parts-editor";
import MarketEstimator from "./market-estimator";
import {
  CATEGORY_LABELS,
  FAULT_LABELS,
  PRODUCT_CATEGORIES,
  SCANNER_ANALYSIS_STORAGE_KEY,
  type ProductAnalysisInput,
  type ProductAnalysisResult,
} from "@/lib/product-analysis";

type AnalyseFormProps = {
  imported: boolean;
  importedTitle: string;
  importedPrice: number | null;
};

type IdentityForm = { title: string; category: string; purchasePrice: string };
type EconomicForm = {
  marketLow: string;
  marketMedian: string;
  marketHigh: string;
  repairMinutes: string;
  hiddenFaultRisk: string;
  extraCosts: string;
};

const MANUAL_SOURCE = { kind: "manual", name: "Saisie utilisateur" } as const;
const EMPTY_ECONOMICS: EconomicForm = {
  marketLow: "",
  marketMedian: "",
  marketHigh: "",
  repairMinutes: "",
  hiddenFaultRisk: "",
  extraCosts: "",
};

function nullableNumber(value: string) {
  return value === "" ? null : Number(value);
}

function euros(value: number | null) {
  if (value === null) return "À estimer";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function range(low: number | null, high: number | null, formatter: (value: number) => string) {
  if (low === null && high === null) return "À estimer";
  if (low === null) return formatter(high as number);
  if (high === null) return formatter(low);
  return low === high ? formatter(low) : `${formatter(low)} – ${formatter(high)}`;
}

function storedAnalysisInput(fallbackTitle: string): ProductAnalysisInput {
  try {
    const raw = sessionStorage.getItem(SCANNER_ANALYSIS_STORAGE_KEY);
    if (!raw) return { title: fallbackTitle };
    const stored = JSON.parse(raw) as unknown;
    if (!stored || typeof stored !== "object" || !("input" in stored)) return { title: fallbackTitle };
    const input = (stored as { input?: unknown }).input;
    if (!input || typeof input !== "object" || !("title" in input) || typeof (input as { title?: unknown }).title !== "string") {
      return { title: fallbackTitle };
    }
    const candidate = input as ProductAnalysisInput;
    return candidate.title === fallbackTitle ? candidate : { title: fallbackTitle };
  } catch {
    return { title: fallbackTitle };
  }
}

export default function AnalyseForm({ imported, importedTitle, importedPrice }: AnalyseFormProps) {
  const [identity, setIdentity] = useState<IdentityForm>({
    title: imported ? importedTitle : "",
    category: "",
    purchasePrice: importedPrice === null ? "" : String(importedPrice),
  });
  const [economicForm, setEconomicForm] = useState<EconomicForm>(EMPTY_ECONOMICS);
  const [productAnalysis, setProductAnalysis] = useState<ProductAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(imported);
  const [marketResult, setMarketResult] = useState<MarketEstimateResult | null>(null);
  const [partsResult, setPartsResult] = useState<PartEstimateResult | null>(null);

  useEffect(() => {
    if (!imported) return;
    const controller = new AbortController();
    const identify = async () => {
      try {
        const response = await fetch("/api/analyse-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storedAnalysisInput(importedTitle)),
          signal: controller.signal,
        });
        const body = (await response.json()) as ProductAnalysisResult | { error?: { message?: string } };
        if (!response.ok) throw new Error("error" in body ? body.error?.message : "Identification impossible");
        const result = body as ProductAnalysisResult;
        setProductAnalysis(result);
        setIdentity((current) => current.category
          ? current
          : { ...current, category: result.category === "unknown" ? "" : CATEGORY_LABELS[result.category] });
      } catch (error) {
        if (!controller.signal.aborted) setAnalysisError(error instanceof Error ? error.message : "Identification impossible");
      } finally {
        if (!controller.signal.aborted) setAnalysisLoading(false);
      }
    };
    void identify();
    return () => controller.abort();
  }, [imported, importedTitle]);

  const marketEstimate = useMemo<MarketEstimate>(() => ({
    lowPrice: nullableNumber(economicForm.marketLow),
    medianPrice: nullableNumber(economicForm.marketMedian),
    highPrice: nullableNumber(economicForm.marketHigh),
    confidence: marketResult?.status === "success" ? marketResult.estimate.confidence : null,
    sampleSize: marketResult?.estimate.sampleSize ?? null,
    source: marketResult?.estimate.source ?? MANUAL_SOURCE,
    comparableItems: marketResult?.estimate.comparableItems ?? [],
  }), [economicForm.marketHigh, economicForm.marketLow, economicForm.marketMedian, marketResult]);

  const repairEstimate = useMemo<RepairEstimate>(() => {
    const minutes = nullableNumber(economicForm.repairMinutes);
    const base = { estimatedMinutesLow: minutes, estimatedMinutesHigh: minutes, difficulty: null, hiddenFaultRisk: nullableNumber(economicForm.hiddenFaultRisk) };
    return partsResult ? toRepairEstimate(partsResult, base) : { probableParts: [], partsCostLow: null, partsCostHigh: null, confidence: null, source: null, ...base };
  }, [economicForm.hiddenFaultRisk, economicForm.repairMinutes, partsResult]);

  const economicInput = useMemo<FinancialAnalysisInput>(() => ({
    purchasePrice: nullableNumber(identity.purchasePrice),
    marketEstimate,
    repairEstimate,
    extraCosts: nullableNumber(economicForm.extraCosts),
  }), [economicForm.extraCosts, identity.purchasePrice, marketEstimate, repairEstimate]);
  const financial = useMemo(() => analyzeFinancials(economicInput), [economicInput]);
  const dealEngineInput = useMemo(
    () => toDealEngineInput({ title: identity.title, category: identity.category }, economicInput, financial),
    [economicInput, financial, identity.category, identity.title],
  );
  const dealResult = useMemo(() => dealEngineInput ? analyzeDeal(dealEngineInput) : null, [dealEngineInput]);

  function updateEconomic(key: keyof EconomicForm, value: string) {
    if (key === "marketLow" || key === "marketMedian" || key === "marketHigh") setMarketResult(null);
    setEconomicForm((current) => ({ ...current, [key]: value }));
  }

  function acceptMarketResult(result: MarketEstimateResult) {
    setMarketResult(result);
    if (result.status !== "success") return;
    setEconomicForm((current) => ({
      ...current,
      marketLow: String(result.estimate.lowPrice),
      marketMedian: String(result.estimate.medianPrice),
      marketHigh: String(result.estimate.highPrice),
    }));
  }

  return (
    <main className="analysis-shell">
      <div className="analysis-container">
        <Link className="back-link" href={imported ? "/scanner" : "/"}>← {imported ? "Retour au scanner" : "Retour aux opportunités"}</Link>
        <div className="analysis-title">
          <div><p className="eyebrow">DEAL ENGINE</p><h1>Analyse d’une annonce</h1><p className="subtitle">Renseigne les données réelles disponibles. Les inconnues restent vides.</p></div>
          <span className={imported ? "mode-badge imported" : "mode-badge"}>{imported ? "Import Scanner" : "Saisie manuelle"}</span>
        </div>

        {imported && <div className="import-notice"><strong>Annonce importée sans estimation financière</strong><span>L’identification est automatique, mais aucun coût de pièce ni prix marché n’est déduit du produit.</span></div>}

        {imported && (
          <section className="product-identification">
            <div className="identification-heading"><div><p className="eyebrow">ANALYSE DÉTERMINISTE</p><h2>Identification Repair Deals</h2></div>{analysisLoading && <span className="identification-status">Identification…</span>}</div>
            {analysisError && <p className="identification-error">{analysisError}</p>}
            {productAnalysis && (
              <>
                <div className="identification-fields">
                  <label><span>Catégorie</span><select value={productAnalysis.category} onChange={(event) => {
                    const category = event.target.value as ProductAnalysisResult["category"];
                    setProductAnalysis({ ...productAnalysis, category }); setMarketResult(null); setPartsResult(null);
                    setIdentity((current) => ({ ...current, category: category === "unknown" ? "" : CATEGORY_LABELS[category] }));
                  }}>{PRODUCT_CATEGORIES.map((category) => <option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}</select></label>
                  {(["brand", "model", "reference"] as const).map((field) => <label key={field}><span>{{ brand: "Marque", model: "Modèle", reference: "Référence" }[field]}</span><input value={productAnalysis[field] ?? ""} onChange={(event) => { setProductAnalysis({ ...productAnalysis, [field]: event.target.value || null }); setMarketResult(null); setPartsResult(null); }} placeholder="Non identifié" /></label>)}
                </div>
                <div className="identification-summary"><div><span>Confiance produit</span><strong>{productAnalysis.productConfidence}/100</strong><progress max="100" value={productAnalysis.productConfidence} /></div><div><span>Confiance diagnostic</span><strong>{productAnalysis.faultConfidence}/100</strong><progress max="100" value={productAnalysis.faultConfidence} /></div></div>
                <div className="identified-faults"><strong>Pannes détectées</strong><div>{productAnalysis.detectedFaults.length ? productAnalysis.detectedFaults.map((fault) => <span key={fault}>{FAULT_LABELS[fault]}</span>) : <em>Aucune panne précise détectée</em>}</div></div>
                <details className="analysis-evidence"><summary>Preuves utilisées ({productAnalysis.evidence.length})</summary><ul>{productAnalysis.evidence.map((item) => <li key={item}>{item}</li>)}</ul></details>
              </>
            )}
          </section>
        )}

        <PartsEditor key={[productAnalysis?.category, productAnalysis?.brand, productAnalysis?.model, productAnalysis?.reference].join("|")} identity={productAnalysis} result={partsResult} onResult={setPartsResult} />

        <section className="economics-section">
          <div className="economics-heading"><div><p className="eyebrow">ESTIMATIONS CONTRÔLÉES</p><h2>Économie du deal</h2></div><span className={`readiness readiness-${financial.readiness}`}>{financial.readiness === "ready" ? "Prêt" : financial.readiness === "estimable" ? "Partiellement estimable" : "Incomplet"}</span></div>

          <div className="deal-basics">
            <label><span>Titre</span><input value={identity.title} onChange={(event) => { setIdentity({ ...identity, title: event.target.value }); setMarketResult(null); }} placeholder="Titre de l’annonce" /></label>
            <label><span>Catégorie</span><input value={identity.category} onChange={(event) => setIdentity({ ...identity, category: event.target.value })} placeholder="À confirmer" /></label>
            <label><span>Prix d’achat</span><input type="number" min="0" value={identity.purchasePrice} onChange={(event) => setIdentity({ ...identity, purchasePrice: event.target.value })} placeholder="À estimer" /></label>
          </div>

          <div className="economics-grid">
            <section className="economics-panel">
              <h3>Marché</h3>
              {(["marketLow", "marketMedian", "marketHigh"] as const).map((key, index) => <label key={key}><span>{["Prix bas", "Prix médian", "Prix haut"][index]}</span><input type="number" min="0" value={economicForm[key]} onChange={(event) => updateEconomic(key, event.target.value)} placeholder="À estimer" /></label>)}
              <MarketEstimator identity={productAnalysis} originalTitle={identity.title} result={marketResult} onResult={acceptMarketResult} />
              <dl><div><dt>Confiance</dt><dd>{marketEstimate.confidence === null ? "À estimer" : `${marketEstimate.confidence}/100`}</dd></div><div><dt>Comparables</dt><dd>{marketEstimate.sampleSize ?? "À estimer"}</dd></div><div><dt>Source</dt><dd>{marketEstimate.source?.name ?? "À estimer"}</dd></div></dl>
            </section>

            <section className="economics-panel">
              <h3>Réparation</h3>
              <div className="repair-cost-summary"><span>Coût des pièces sélectionnées</span><strong>{range(repairEstimate.partsCostLow, repairEstimate.partsCostHigh, euros)}</strong></div>
              <label><span>Temps de réparation (min)</span><input type="number" min="0" value={economicForm.repairMinutes} onChange={(event) => updateEconomic("repairMinutes", event.target.value)} placeholder="À estimer" /></label>
              <label><span>Risque de panne cachée (%)</span><input type="number" min="0" max="100" value={economicForm.hiddenFaultRisk} onChange={(event) => updateEconomic("hiddenFaultRisk", event.target.value)} placeholder="À estimer" /></label>
              <label><span>Frais supplémentaires</span><input type="number" min="0" value={economicForm.extraCosts} onChange={(event) => updateEconomic("extraCosts", event.target.value)} placeholder="À estimer ou confirmer 0" /></label>
              <dl><div><dt>Pièces sélectionnées</dt><dd>{repairEstimate.probableParts.length || "À estimer"}</dd></div><div><dt>Difficulté</dt><dd>À estimer</dd></div><div><dt>Confiance</dt><dd>{repairEstimate.confidence === null ? "À estimer" : `${repairEstimate.confidence}/100`}</dd></div><div><dt>Source</dt><dd>{repairEstimate.source?.name ?? "À estimer"}</dd></div></dl>
            </section>

            <section className="economics-panel finance-panel">
              <h3>Finance</h3>
              <dl className="finance-metrics">
                <div><dt>Coût total estimé</dt><dd>{range(financial.estimatedTotalCostLow, financial.estimatedTotalCostHigh, euros)}</dd></div>
                <div><dt>Marge estimée</dt><dd>{range(financial.grossMarginLow, financial.grossMarginHigh, euros)}</dd></div>
                <div><dt>ROI</dt><dd>{range(financial.roiLow, financial.roiHigh, (value) => `${value.toFixed(2)} %`)}</dd></div>
                <div><dt>Prix max conseillé</dt><dd>{euros(financial.maxRecommendedPurchasePrice)}</dd></div>
                <div><dt>Confiance financière</dt><dd>{financial.financialConfidence === null ? "À estimer" : `${financial.financialConfidence}/100`}</dd></div>
              </dl>
              {dealResult ? <div className="deal-score-ready"><span>Deal Score</span><strong>{dealResult.dealScore}/100</strong></div> : <p className="deal-score-waiting">Deal Score en attente des confiances marché/réparation et de toutes les données essentielles.</p>}
            </section>
          </div>

          {financial.validationErrors.length > 0 && <div className="economics-errors"><strong>Données à corriger</strong><ul>{financial.validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        </section>
      </div>
    </main>
  );
}
