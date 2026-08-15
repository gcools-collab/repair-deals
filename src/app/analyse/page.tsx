"use client";

import { useMemo, useState } from "react";
import { analyzeDeal } from "@/lib/deal-engine";

function euros(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AnalysePage() {
  const [form, setForm] = useState({
    title: "PlayStation 5 - HDMI HS",
    category: "Console",
    purchasePrice: 120,
    partsCost: 15,
    resalePrice: 320,
    repairMinutes: 90,
    repairConfidence: 90,
    marketConfidence: 88,
    hiddenFaultRisk: 20,
    extraCosts: 10,
  });

  const result = useMemo(
    () => analyzeDeal(form),
    [form]
  );

  function update(
    key: keyof typeof form,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [key]:
        key === "title" || key === "category"
          ? value
          : Number(value),
    }));
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080b10",
        color: "white",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <a
          href="/"
          style={{
            color: "#5cff9d",
            textDecoration: "none",
          }}
        >
          ← Retour aux opportunités
        </a>

        <h1 style={{ marginTop: 20 }}>
          Analyse d'une annonce
        </h1>

        <p style={{ color: "#7d8796" }}>
          Teste rapidement si une réparation vaut
          vraiment le coup.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            marginTop: 25,
          }}
        >
          <section
            style={{
              background: "#0f141b",
              border: "1px solid #212832",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2>Données de l'annonce</h2>

            {[
              ["title", "Titre"],
              ["category", "Catégorie"],
              ["purchasePrice", "Prix d'achat"],
              ["partsCost", "Coût des pièces"],
              ["resalePrice", "Prix de revente estimé"],
              ["repairMinutes", "Temps réparation (min)"],
              ["extraCosts", "Autres frais"],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{
                  display: "block",
                  marginTop: 14,
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#798392",
                    marginBottom: 6,
                  }}
                >
                  {label}
                </span>

                <input
                  value={
                    form[
                      key as keyof typeof form
                    ]
                  }
                  onChange={(e) =>
                    update(
                      key as keyof typeof form,
                      e.target.value
                    )
                  }
                  type={
                    key === "title" ||
                    key === "category"
                      ? "text"
                      : "number"
                  }
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 9,
                    border: "1px solid #29313c",
                    background: "#0a0e13",
                    color: "white",
                  }}
                />
              </label>
            ))}

            {[
              [
                "repairConfidence",
                "Confiance réparation",
              ],
              [
                "marketConfidence",
                "Confiance prix marché",
              ],
              [
                "hiddenFaultRisk",
                "Risque panne cachée",
              ],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{
                  display: "block",
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                  }}
                >
                  <span
                    style={{
                      color: "#798392",
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </span>

                  <strong>
                    {
                      form[
                        key as keyof typeof form
                      ]
                    }
                    %
                  </strong>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={
                    form[
                      key as keyof typeof form
                    ]
                  }
                  onChange={(e) =>
                    update(
                      key as keyof typeof form,
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    marginTop: 8,
                  }}
                />
              </label>
            ))}
          </section>

          <section
            style={{
              background: "#0f141b",
              border: "1px solid #212832",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                border: "7px solid #5cff9d",
                display: "grid",
                placeContent: "center",
                margin: "0 auto",
                textAlign: "center",
              }}
            >
              <strong
                style={{ fontSize: 38 }}
              >
                {result.dealScore}
              </strong>

              <span
                style={{
                  color: "#74808c",
                  fontSize: 12,
                }}
              >
                /100
              </span>
            </div>

            <h2
              style={{
                textAlign: "center",
              }}
            >
              Deal Score
            </h2>

            <div
              style={{
                textAlign: "center",
                marginBottom: 25,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontWeight: 800,
                  background:
                    result.recommendation === "GO"
                      ? "#14301f"
                      : result.recommendation ===
                        "NEGOCIER"
                      ? "#302912"
                      : "#351919",
                  color:
                    result.recommendation === "GO"
                      ? "#5cff9d"
                      : result.recommendation ===
                        "NEGOCIER"
                      ? "#ffd166"
                      : "#ff7474",
                }}
              >
                {result.recommendation}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 10,
              }}
            >
              {[
                [
                  "Marge brute",
                  euros(result.grossMargin),
                ],
                [
                  "Marge ajustée",
                  euros(result.netMargin),
                ],
                ["ROI", `${result.roi}%`],
                [
                  "Marge / heure",
                  euros(result.hourlyMargin),
                ],
                [
                  "Repair Score",
                  `${result.repairScore}/100`,
                ],
                [
                  "Market Score",
                  `${result.marketScore}/100`,
                ],
                [
                  "Risk Score",
                  `${result.riskScore}/100`,
                ],
                [
                  "Prix max conseillé",
                  euros(
                    result.maxRecommendedPrice
                  ),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background: "#0a0e13",
                    border: "1px solid #222a34",
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: "#727d89",
                      fontSize: 11,
                    }}
                  >
                    {label}
                  </span>

                  <strong
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 18,
                    }}
                  >
                    {value}
                  </strong>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 12,
                background: "#0a0e13",
                border: "1px solid #222a34",
              }}
            >
              <strong>Décision moteur</strong>

              <p
                style={{
                  color: "#8a94a0",
                  lineHeight: 1.6,
                }}
              >
                {result.recommendation === "GO"
                  ? `Bonne opportunité. À ${euros(
                      form.purchasePrice
                    )}, la marge ajustée reste intéressante.`
                  : result.recommendation ===
                    "NEGOCIER"
                  ? `Deal intéressant seulement si le prix baisse. Essaie de négocier autour de ${euros(
                      result.maxRecommendedPrice
                    )}.`
                  : `Rentabilité ou niveau de risque insuffisant. Prix maximum conseillé : ${euros(
                      result.maxRecommendedPrice
                    )}.`}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
