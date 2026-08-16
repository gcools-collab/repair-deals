"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketEstimateResult } from "@/lib/market-intelligence";
import type { ProductAnalysisResult } from "@/lib/product-analysis";

type Props = {
  identity: ProductAnalysisResult | null;
  originalTitle: string;
  result: MarketEstimateResult | null;
  onResult: (result: MarketEstimateResult) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "À estimer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function MarketEstimator({ identity, originalTitle, result, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="market-estimator">
      <button className="market-estimate-button" type="button" onClick={estimate} disabled={loading || !identity}>
        {loading ? "Recherche des comparables…" : "Estimer le prix marché"}
      </button>
      {!identity && <p className="market-estimate-note">L’identification produit doit être disponible avant la recherche.</p>}
      {error && <p className="market-estimate-error">{error}</p>}
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
