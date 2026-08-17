"use client";

import Link from "next/link";
import { useState } from "react";
import { rankGlobalOpportunities, type GlobalOpportunity, type GlobalScanResult, type GlobalSortMode } from "@/lib/global-opportunity-scanner";

const euro = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export default function OpportunitiesPage() {
  const [budget, setBudget] = useState("500");
  const [categories, setCategories] = useState(["smartphone", "console", "laptop", "tv"]);
  const [sort, setSort] = useState<GlobalSortMode>("overall");
  const [result, setResult] = useState<GlobalScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, string>>({});
  const toggle = (value: string) => setCategories(current => current.includes(value) ? current.filter(category => category !== value) : [...current, value]);

  async function scan() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/global-scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories, maxPurchasePrice: Number(budget), maxListingsPerQuery: 8, maxTotalListings: 20, concurrency: 2, requestBudget: 16 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Scan impossible");
      setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Scan impossible"); }
    finally { setLoading(false); }
  }

  async function follow(opportunity: GlobalOpportunity) {
    setFollowed(current => ({ ...current, [opportunity.listing.id]: "saving" }));
    try {
      const response = await fetch("/api/deals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunity, listingProvider: "leboncoin" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Enregistrement impossible");
      setFollowed(current => ({ ...current, [opportunity.listing.id]: body.deal.id }));
    } catch (caught) { setFollowed(current => ({ ...current, [opportunity.listing.id]: "error" })); setError(caught instanceof Error ? caught.message : "Enregistrement impossible"); }
  }

  const ready = rankGlobalOpportunities(result?.readyOpportunities || [], sort);
  const card = (opportunity: GlobalOpportunity) => {
    const state = followed[opportunity.listing.id];
    const trace = opportunity.pipelineTrace;
    return <article className="listing-card" key={opportunity.listing.id}><div className="listing-content"><div className="listing-heading"><h2>{opportunity.listing.title}</h2><strong className="listing-price">{opportunity.opportunityScore ?? "—"}/100</strong></div><div className="listing-meta"><span>Achat {euro(opportunity.estimatedPurchaseCost)}</span><span>Pièces {euro(opportunity.estimatedRepairCost)}</span><span>Marché {euro(opportunity.estimatedMarketValue)}</span><span>Marge {euro(opportunity.estimatedNetMargin)}</span><span>ROI {opportunity.roi === null ? "—" : `${Math.round(opportunity.roi)} %`}</span><span>Risque {opportunity.risk === null ? "—" : `${opportunity.risk}/100`}</span><span>Confiance {opportunity.confidence === null ? "—" : `${Math.round(opportunity.confidence)}/100`}</span><span>Statut {opportunity.readiness}</span></div>{opportunity.rankingBadges.length > 0 && <div className="repair-keywords">{opportunity.rankingBadges.map(badge => <span className="repair-keyword" key={badge}>{badge}</span>)}</div>}{opportunity.primaryReason && <small>Premier blocage : {opportunity.primaryReason}</small>}{opportunity.consequences.length > 0 && <small>Conséquences : {opportunity.consequences.join(" · ")}</small>}{trace && <details><summary>Parcours de décision</summary><div className="listing-meta"><span>Identité {trace.identity.status} ({trace.identity.confidence}/100)</span><span>Diagnostic {trace.diagnostic.status}{trace.diagnostic.selectedFault ? ` · ${trace.diagnostic.selectedFault}` : ""}</span><span>Market {trace.market.status} · {trace.market.provider}</span><span>Parts {trace.parts.status} · {trace.parts.provider}</span><span>Économie {trace.economics.status}</span></div><pre>{JSON.stringify(trace, null, 2)}</pre></details>}<div className="listing-actions">{state && state !== "saving" && state !== "error" ? <Link className="primary-link" href={`/deals/${state}`}>Deal suivi →</Link> : <button className="primary-link" type="button" disabled={state === "saving"} onClick={() => follow(opportunity)}>{state === "saving" ? "Enregistrement…" : "Suivre ce deal"}</button>}</div></div></article>;
  };
  const providerState = result?.diagnostics.providers.map(provider => `${provider.providerId}: ${provider.health}`).join(" · ") || "—";

  return <main className="scanner-shell"><div className="scanner-container"><div className="listing-actions"><Link className="back-link" href="/">← Retour</Link><Link className="secondary-link" href="/deals">Deals suivis →</Link></div><header className="scanner-header"><div><p className="eyebrow">GLOBAL OPPORTUNITY SCANNER</p><h1>Opportunités Repair Deals</h1><p className="subtitle">Scan borné, classement économique et suivi explicite.</p></div></header><section className="scanner-form"><label><span>Budget maximum</span><input type="number" min="0" value={budget} onChange={event => setBudget(event.target.value)} /></label><label><span>Tri</span><select value={sort} onChange={event => setSort(event.target.value as GlobalSortMode)}><option value="overall">Meilleur global</option><option value="roi">ROI</option><option value="margin">Marge</option><option value="lowest_budget">Petit budget</option><option value="lowest_risk">Faible risque</option></select></label><div className="repair-keywords">{[["smartphone", "Smartphones"], ["console", "Consoles"], ["laptop", "Ordinateurs"], ["tv", "TV"]].map(([value, label]) => <label className="broken-toggle" key={value}><input type="checkbox" checked={categories.includes(value)} onChange={() => toggle(value)} /><span>{label}</span></label>)}</div><button className="scanner-submit" type="button" onClick={scan} disabled={loading || categories.length === 0}>{loading ? "Scan en cours…" : "Lancer le scan global"}</button></section>{error && <div className="scanner-state scanner-error">{error}</div>}{result && <section className="scanner-results">{result.status === "provider_unavailable" ? <div className="scanner-state scanner-error">Leboncoin Discovery est temporairement indisponible. Le scan n’a pas pu être terminé.</div> : <div className="results-heading"><h2>{ready.length} opportunité(s) prête(s)</h2><span>{result.partialOpportunities.length} partielles · {result.rejectedOpportunities.length} rejetées</span></div>}<div className="listing-meta"><span>Requêtes prévues {result.diagnostics.queriesPlanned}</span><span>Requêtes exécutées {result.diagnostics.queriesExecuted}</span><span>Annonces récupérées {result.diagnostics.listingsRaw}</span><span>Annonces pertinentes {result.diagnostics.listingsRelevant}</span><span>Deals analysés {result.diagnostics.analysed}</span><span>Discovery Leboncoin {providerState}</span></div>{result.status === "partial" && <div className="scanner-state">Le scan est partiel. Consultez le parcours de chaque annonce pour identifier l’étape incomplète.</div>}<div className="listing-grid">{ready.map(card)}{result.partialOpportunities.map(card)}{result.rejectedOpportunities.map(card)}</div><details><summary>Diagnostics techniques du scan</summary><pre>{JSON.stringify(result.diagnostics, null, 2)}</pre></details></section>}</div></main>;
}
