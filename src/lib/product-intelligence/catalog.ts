import type { ProductCategory } from "../product-analysis/types.ts";

export type DeviceFamilyRule = {
  brand: string;
  family: string;
  category: ProductCategory;
  pattern: RegExp;
};

export const DEVICE_FAMILY_RULES: readonly DeviceFamilyRule[] = [
  { brand: "Apple", family: "MacBook Pro", category: "mac", pattern: /\bmac\s*book\s+pro\b/i },
  { brand: "Apple", family: "MacBook Air", category: "mac", pattern: /\bmac\s*book\s+air\b/i },
  { brand: "Apple", family: "iPhone", category: "smartphone", pattern: /\biphone\b/i },
  { brand: "Apple", family: "iPad", category: "tablet", pattern: /\bipad\b/i },
  { brand: "Sony", family: "PlayStation 5", category: "console", pattern: /\b(?:ps\s*5|playstation\s*5)\b/i },
  { brand: "Sony", family: "PlayStation 4", category: "console", pattern: /\b(?:ps\s*4|playstation\s*4)\b/i },
  { brand: "Microsoft", family: "Xbox", category: "console", pattern: /\bxbox\b/i },
  { brand: "Nintendo", family: "Switch", category: "console", pattern: /\b(?:nintendo\s+)?switch\b/i },
  { brand: "Samsung", family: "Galaxy", category: "smartphone", pattern: /\bgalaxy\b/i },
  { brand: "Samsung", family: "Samsung TV", category: "tv", pattern: /\b(?:samsung.*tv|tv.*samsung)\b/i },
  ...["Dell", "HP", "Lenovo", "Asus", "Acer", "MSI"].map((brand) => ({
    brand, family: `${brand} PC`, category: "laptop" as const, pattern: new RegExp(`\\b${brand}\\b`, "i"),
  })),
  { brand: "Nvidia", family: "GeForce RTX", category: "gpu", pattern: /\brtx\s*\d{4}\b/i },
  { brand: "AMD", family: "Radeon RX", category: "gpu", pattern: /\b(?:radeon\s+)?rx\s*\d{4}\b/i },
];

export type ReferenceCatalogRule = {
  id: string;
  matches: {
    brand: string;
    family: string;
    year?: number;
    screenSize?: number;
    variant?: string;
  };
  references: Array<{ reference: string; kind: "model_number" | "manufacturer_reference" }>;
  confidence: number;
  rationale: string;
};

export const REFERENCE_CATALOG: readonly ReferenceCatalogRule[] = [
  {
    id: "apple-macbook-pro-13-2016-touch-bar",
    matches: { brand: "Apple", family: "MacBook Pro", year: 2016, screenSize: 13, variant: "Touch Bar" },
    references: [
      { reference: "A1706", kind: "model_number" },
      { reference: "MacBookPro13,2", kind: "manufacturer_reference" },
    ],
    confidence: 88,
    rationale: "Le catalogue Apple associe cette combinaison 13 pouces, 2016 et Touch Bar à A1706 / MacBookPro13,2.",
  },
];
