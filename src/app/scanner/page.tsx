"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { LeboncoinListing } from "@/lib/leboncoin-scanner";
import {
  SCANNER_ANALYSIS_STORAGE_KEY,
  type ProductAnalysisInput,
} from "@/lib/product-analysis";

type ScannerResponse = {
  count: number;
  results: LeboncoinListing[];
};

type ApiError = {
  error?: { message?: string };
};

function euros(value: number | null) {
  if (value === null) return "Prix non renseigné";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Date non renseignée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function listingLocation(listing: LeboncoinListing) {
  const location = listing.location;
  if (!location) return "Localisation non renseignée";
  return location.cityLabel || [location.city, location.zipcode].filter(Boolean).join(" ") || "Localisation non renseignée";
}

function analysisHref(listing: LeboncoinListing) {
  const parameters = new URLSearchParams({ source: "scanner", title: listing.title });
  if (listing.price !== null) parameters.set("purchasePrice", String(listing.price));
  return `/analyse?${parameters.toString()}`;
}

function RepairKeywordBadge({ keyword }: { keyword: string }) {
  return <span className="repair-keyword">{keyword}</span>;
}

function ListingCard({ listing, onAnalyse }: { listing: LeboncoinListing; onAnalyse: (listing: LeboncoinListing) => void }) {
  return (
    <article className="listing-card">
      {listing.images[0] ? (
        <div
          className="listing-image"
          role="img"
          aria-label={`Photo de ${listing.title}`}
          style={{ backgroundImage: `url(${JSON.stringify(listing.images[0]).slice(1, -1)})` }}
        />
      ) : (
        <div className="listing-image listing-image-empty" aria-label="Aucune photo">
          <span>Pas de photo</span>
        </div>
      )}

      <div className="listing-content">
        <div className="listing-heading">
          <div>
            <div className="listing-badges">
              <span className={listing.likelyBroken ? "broken-badge" : "neutral-badge"}>
                {listing.likelyBroken ? "À réparer probable" : "Panne non détectée"}
              </span>
            </div>
            <h2>{listing.title}</h2>
          </div>
          <strong className="listing-price">{euros(listing.price)}</strong>
        </div>

        <div className="listing-meta">
          <span>⌖ {listingLocation(listing)}</span>
          <span>Publié le {formatDate(listing.publishedAt)}</span>
        </div>

        {(listing.brand || listing.modelReference) && (
          <dl className="listing-identity">
            {listing.brand && <><dt>Marque</dt><dd>{listing.brand}</dd></>}
            {listing.modelReference && <><dt>Modèle / référence</dt><dd>{listing.modelReference}</dd></>}
          </dl>
        )}

        {listing.detectedFaultKeywords.length > 0 && (
          <div className="repair-keywords" aria-label="Signaux de panne détectés">
            {listing.detectedFaultKeywords.map((keyword) => (
              <RepairKeywordBadge key={keyword} keyword={keyword} />
            ))}
          </div>
        )}

        <div className="listing-actions">
          <button className="primary-link" type="button" onClick={() => onAnalyse(listing)}>
            Analyser le deal →
          </button>
          <a className="secondary-link" href={listing.url} target="_blank" rel="noreferrer">
            Voir sur Leboncoin ↗
          </a>
        </div>
      </div>
    </article>
  );
}

export default function ScannerPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [limit, setLimit] = useState("20");
  const [brokenOnly, setBrokenOnly] = useState(true);
  const [results, setResults] = useState<LeboncoinListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  function startAnalysis(listing: LeboncoinListing) {
    const analysisInput: ProductAnalysisInput = {
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      model: listing.modelReference,
      attributes: listing.attributes,
      repairKeywords: listing.detectedFaultKeywords,
    };
    sessionStorage.setItem(
      SCANNER_ANALYSIS_STORAGE_KEY,
      JSON.stringify({ input: analysisInput, purchasePrice: listing.price }),
    );
    router.push(analysisHref(listing));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setIsLoading(true);
    setError(null);

    const payload = {
      query: query.trim(),
      ...(minPrice === "" ? {} : { min_price: Number(minPrice) }),
      ...(maxPrice === "" ? {} : { max_price: Number(maxPrice) }),
      limit: Number(limit),
      broken_only: brokenOnly,
    };

    try {
      const response = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = (await response.json()) as ScannerResponse | ApiError;
      if (!response.ok) {
        const apiError = body as ApiError;
        throw new Error(apiError.error?.message || "Le scanner n’a pas pu terminer la recherche.");
      }
      setResults((body as ScannerResponse).results);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setResults(null);
      setError(caught instanceof Error ? caught.message : "Une erreur inattendue est survenue.");
    } finally {
      if (requestController.current === controller) {
        setIsLoading(false);
        requestController.current = null;
      }
    }
  }

  return (
    <main className="scanner-shell">
      <div className="scanner-container">
        <Link className="back-link" href="/">← Retour aux opportunités</Link>
        <header className="scanner-header">
          <div>
            <p className="eyebrow">LEBONCOIN SCANNER</p>
            <h1>Trouver du matériel à réparer</h1>
            <p className="subtitle">Recherche libre, résultats réels et signaux de panne détectés automatiquement.</p>
          </div>
        </header>

        <form className="scanner-form" onSubmit={submit}>
          <label className="scanner-query">
            <span>Que recherches-tu ?</span>
            <input
              required
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex. MacBook écran cassé, PS5 HDMI HS…"
            />
          </label>
          <label>
            <span>Prix minimum</span>
            <input min="0" type="number" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0 €" />
          </label>
          <label>
            <span>Prix maximum</span>
            <input min="0" type="number" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Sans limite" />
          </label>
          <label>
            <span>Nombre de résultats</span>
            <select value={limit} onChange={(event) => setLimit(event.target.value)}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="35">35</option>
            </select>
          </label>
          <label className="broken-toggle">
            <input type="checkbox" checked={brokenOnly} onChange={(event) => setBrokenOnly(event.target.checked)} />
            <span>Annonces à réparer uniquement</span>
          </label>
          <button className="scanner-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Recherche en cours…" : "Lancer le scan"}
          </button>
        </form>

        <section className="scanner-results" aria-live="polite" aria-busy={isLoading}>
          {isLoading && <div className="scanner-state"><span className="spinner" />Le scanner interroge Leboncoin…</div>}
          {error && <div className="scanner-state scanner-error"><strong>Recherche impossible</strong><span>{error}</span></div>}
          {!isLoading && !error && results?.length === 0 && (
            <div className="scanner-state"><strong>Aucune annonce trouvée</strong><span>Élargis les prix, modifie les mots-clés ou désactive le filtre des annonces à réparer.</span></div>
          )}
          {!isLoading && !error && results && results.length > 0 && (
            <>
              <div className="results-heading"><h2>{results.length} annonce{results.length > 1 ? "s" : ""}</h2><span>Résultats du dernier scan</span></div>
              <div className="listing-grid">{results.map((listing) => <ListingCard key={listing.id} listing={listing} onAnalyse={startAnalysis} />)}</div>
            </>
          )}
          {!isLoading && !error && results === null && (
            <div className="scanner-empty"><span>⌁</span><h2>Prêt à scanner</h2><p>Lance une recherche pour afficher les annonces disponibles. Aucun résultat fictif n’est injecté.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
