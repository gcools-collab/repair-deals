"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketEstimateResult } from "@/lib/market-intelligence";
import type { MarketEstimateV2Response } from "@/lib/market-intelligence-v2";
import type { ProductAnalysisResult } from "@/lib/product-analysis";

type Props = {
  identity: ProductAnalysisResult | null;
  originalTitle: string;
  result: MarketEstimateResult | null;
  onResult: (result: MarketEstimateResult) => void;
  v2Result: MarketEstimateV2Response | null;
  onV2Result: (result: MarketEstimateV2Response) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "À estimer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function MarketEstimator({ identity, originalTitle, result, onResult, v2Result, onV2Result }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v2Loading, setV2Loading] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function estimate() {
    if (!identity || !originalTitle.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/market-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: identity.category,
          brand: identity.brand,
          model: identity.model,
          reference: identity.reference,
          originalTitle,
          productConfidence: identity.productConfidence,
        }),
        signal: controller.signal,
      });
      const body = (await response.json()) as MarketEstimateResult | { error?: { message?: string } };
      if (!response.ok) {
        throw new Error("error" in body ? body.error?.message || "Estimation marché impossible" : "Estimation marché impossible");
      }
      onResult(body as MarketEstimateResult);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Estimation marché impossible");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function estimateV2() {
    if (!identity || !originalTitle.trim()) return;
    setV2Loading(true); setError(null);
    try {
      const response = await fetch("/api/market-estimate-v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: originalTitle, brand: identity.brand, model: identity.model, reference: identity.reference, detectedFaults: identity.detectedFaults }) });
      const body = await response.json() as MarketEstimateV2Response | { error?: { message?: string } };
      if (!response.ok) throw new Error("error" in body ? body.error?.message || "Estimation V2 impossible" : "Estimation V2 impossible");
      onV2Result(body as MarketEstimateV2Response);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Estimation V2 impossible"); }
    finally { setV2Loading(false); }
  }

  return (
    <div className="market-estimator">
      <button className="market-estimate-button" type="button" onClick={estimateV2} disabled={v2Loading || !identity}>
        {v2Loading ? "Recherche V2 des comparables…" : "Estimer le marché (V2)"}
      </button>
      <button className="market-estimate-button" type="button" onClick={estimate} disabled={loading || !identity}>
        {loading ? "Recherche des comparables…" : "Estimer le marché (V1)"}
      </button>
      {!identity && <p className="market-estimate-note">L’identification produit doit être disponible avant la recherche.</p>}
      {error && <p className="market-estimate-error">{error}</p>}
      {v2Result && (
        <div className={v2Result.estimate.status === "success" ? "market-estimate-state success" : "market-estimate-state"}>
          <strong>Market Intelligence V2 · {v2Result.estimate.status}</strong>
          <span>Identité : {[v2Result.identity.brand, v2Result.identity.family, v2Result.identity.year, v2Result.identity.screenSize && `${v2Result.identity.screenSize} pouces`, v2Result.identity.variant].filter(Boolean).join(" ")}</span>
          <small>Tier utilisé : {v2Result.estimate.tierUsed ?? "aucun"} · tentés : {v2Result.estimate.tiersAttempted.map((tier) => tier.tier).join(" → ") || "aucun"}</small>
          <small>Bas {v2Result.estimate.lowPrice ?? "—"} € · médiane {v2Result.estimate.medianPrice ?? "—"} € · haut {v2Result.estimate.highPrice ?? "—"} € · pondérée {v2Result.estimate.weightedMedian ?? "—"} €</small>
          <small>Confiance {v2Result.estimate.confidence}/100 · échantillon {v2Result.estimate.sampleSize} (effectif {v2Result.estimate.effectiveSampleSize})</small>
          {v2Result.estimate.comparables.length > 0 && <details className="market-comparables"><summary>Top comparables V2</summary><ul>{v2Result.estimate.comparables.slice(0, 5).map((comparable) => <li key={comparable.listing.id || comparable.listing.url}><a href={comparable.listing.url} target="_blank" rel="noreferrer">{comparable.listing.title}</a><span>{comparable.listing.price ?? "—"} € · similarité {comparable.similarityScore}/100</span></li>)}</ul></details>}
        </div>
      )}
      {result && (
        <div className={result.status === "success" ? "market-estimate-state success" : "market-estimate-state"}>
          <strong>{result.status === "success" ? "Estimation Leboncoin disponible" : "Estimation non produite"}</strong>
          <span>{result.message}</span>
          {result.query && <small>Recherche : « {result.query} »</small>}
          <small>Source : {result.estimate.source?.name || "À estimer"} · récupération : {formatDate(result.estimate.source?.retrievedAt)}</small>
          {result.estimate.comparableItems.length > 0 && (
            <details className="market-comparables">
              <summary>Meilleurs comparables ({result.estimate.comparableItems.length})</summary>
              <ul>
                {result.estimate.comparableItems.slice(0, 5).map((item) => (
                  <li key={item.id || item.url || item.title}>
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : <span>{item.title}</span>}
                    <span>{item.price === null ? "Prix inconnu" : item.price.toLocaleString("fr-FR") + " €"} · match {item.matchScore ?? 0}/100</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
