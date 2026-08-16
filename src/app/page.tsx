import Link from "next/link";

const deals = [
  {
    id: 1,
    title: "PlayStation 5 - HDMI HS",
    category: "Console",
    price: 120,
    parts: 15,
    resale: 320,
    margin: 185,
    score: 94,
    risk: "Faible",
    repair: "Remplacement connecteur HDMI",
  },
  {
    id: 2,
    title: "iPhone 13 128 Go - écran cassé",
    category: "Smartphone",
    price: 90,
    parts: 45,
    resale: 220,
    margin: 85,
    score: 91,
    risk: "Faible",
    repair: "Remplacement écran",
  },
  {
    id: 3,
    title: "MacBook Air M1 - écran HS",
    category: "PC / Mac",
    price: 140,
    parts: 95,
    resale: 390,
    margin: 155,
    score: 86,
    risk: "Moyen",
    repair: "Remplacement écran complet",
  },
  {
    id: 4,
    title: "TV Samsung 55\" - rétroéclairage HS",
    category: "TV",
    price: 40,
    parts: 32,
    resale: 180,
    margin: 108,
    score: 83,
    risk: "Moyen",
    repair: "Remplacement barres LED",
  },
];

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-icon">R</div>
            <div>
              <strong>Repair Deals</strong>
              <span>Deal Hunter IA</span>
            </div>
          </div>

          <nav>
            <a className="active">🔥 Opportunités</a>
            <Link href="/scanner">🔎 Scanner</Link>
            <a>📦 Mes achats</a>
            <a>🛠️ Réparations</a>
            <a>💰 Reventes</a>
            <a>📊 Statistiques</a>
          </nav>
        </div>

        <div className="sidebar-footer">
          <span>Scraper</span>
          <strong>● En ligne</strong>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">REPAIR DEALS</p>
            <h1>Opportunités</h1>
            <p className="subtitle">
              Les meilleures annonces à acheter, réparer et revendre.
            </p>
          </div>

          <Link className="scan-button" href="/scanner">↻ Scanner maintenant</Link>
        </header>

        <section className="stats">
          <div className="stat-card">
            <span>Opportunités détectées</span>
            <strong>42</strong>
            <small>+12 aujourd’hui</small>
          </div>

          <div className="stat-card">
            <span>Marge potentielle</span>
            <strong>2 840 €</strong>
            <small>Sur les deals retenus</small>
          </div>

          <div className="stat-card">
            <span>Meilleur deal</span>
            <strong>94/100</strong>
            <small>PS5 HDMI HS</small>
          </div>

          <div className="stat-card">
            <span>Budget nécessaire</span>
            <strong>1 160 €</strong>
            <small>Achat + pièces</small>
          </div>
        </section>

        <section className="toolbar">
          <div className="filters">
            <button className="filter active">Tous</button>
            <button className="filter">Smartphones</button>
            <button className="filter">PC / Mac</button>
            <button className="filter">Consoles</button>
            <button className="filter">TV</button>
            <button className="filter">Autres</button>
          </div>

          <select defaultValue="score">
            <option value="score">Meilleur score</option>
            <option value="margin">Meilleure marge</option>
            <option value="recent">Plus récent</option>
          </select>
        </section>

        <section className="deals">
          {deals.map((deal) => (
            <article className="deal-card" key={deal.id}>
              <div className="deal-score">
                <div className="score-circle">
                  <strong>{deal.score}</strong>
                  <span>/100</span>
                </div>
                <small>DEAL SCORE</small>
              </div>

              <div className="deal-main">
                <div className="deal-topline">
                  <span className="category">{deal.category}</span>
                  <span
                    className={
                      deal.risk === "Faible"
                        ? "risk risk-low"
                        : "risk risk-medium"
                    }
                  >
                    Risque {deal.risk.toLowerCase()}
                  </span>
                </div>

                <h2>{deal.title}</h2>
                <p>{deal.repair}</p>

                <div className="prices">
                  <div>
                    <span>Achat</span>
                    <strong>{money(deal.price)}</strong>
                  </div>

                  <div>
                    <span>Pièces</span>
                    <strong>{money(deal.parts)}</strong>
                  </div>

                  <div>
                    <span>Revente estimée</span>
                    <strong>{money(deal.resale)}</strong>
                  </div>

                  <div className="margin">
                    <span>Marge estimée</span>
                    <strong>+{money(deal.margin)}</strong>
                  </div>
                </div>
              </div>

              <div className="deal-action">
                <button>Analyser →</button>
                <span>GO</span>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
