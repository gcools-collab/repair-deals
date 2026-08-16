export const PRODUCT_CATEGORIES = [
  "smartphone",
  "tablet",
  "laptop",
  "desktop",
  "mac",
  "console",
  "tv",
  "monitor",
  "gpu",
  "computer_component",
  "audio_hifi",
  "camera",
  "wearable",
  "other_electronics",
  "unknown",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  smartphone: "Smartphone",
  tablet: "Tablette",
  laptop: "PC portable",
  desktop: "Ordinateur fixe",
  mac: "Mac",
  console: "Console",
  tv: "Téléviseur",
  monitor: "Écran / moniteur",
  gpu: "Carte graphique",
  computer_component: "Composant informatique",
  audio_hifi: "Audio / hi-fi",
  camera: "Photo / caméra",
  wearable: "Objet connecté",
  other_electronics: "Autre électronique",
  unknown: "Catégorie inconnue",
};

export const FAULT_TYPES = [
  "broken_screen",
  "cracked_screen",
  "no_power",
  "no_boot",
  "charging_issue",
  "battery_issue",
  "hdmi_issue",
  "motherboard_issue",
  "backlight_issue",
  "display_issue",
  "overheating",
  "liquid_damage",
  "controller_issue",
  "storage_issue",
  "unknown_fault",
] as const;

export type FaultType = (typeof FAULT_TYPES)[number];

export const FAULT_LABELS: Record<FaultType, string> = {
  broken_screen: "Écran hors service",
  cracked_screen: "Écran cassé / fissuré",
  no_power: "Ne s’allume plus",
  no_boot: "Ne démarre plus",
  charging_issue: "Problème de charge",
  battery_issue: "Batterie défectueuse",
  hdmi_issue: "Connectique HDMI",
  motherboard_issue: "Carte mère",
  backlight_issue: "Rétroéclairage",
  display_issue: "Problème d’affichage",
  overheating: "Surchauffe",
  liquid_damage: "Dégât liquide",
  controller_issue: "Manette / contrôleur",
  storage_issue: "Stockage",
  unknown_fault: "Panne non précisée",
};

export type ProductAnalysisAttribute = {
  key?: string | null;
  keyLabel?: string | null;
  value?: string | number | boolean | null;
  valueLabel?: string | null;
  values?: string[];
  valuesLabel?: string[];
};

export type ProductAnalysisInput = {
  title: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  attributes?: Record<string, ProductAnalysisAttribute> | null;
  repairKeywords?: string[] | null;
};

export type ProductAnalysisResult = {
  category: ProductCategory;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  detectedFaults: FaultType[];
  productConfidence: number;
  faultConfidence: number;
  evidence: string[];
};

export const SCANNER_ANALYSIS_STORAGE_KEY = "repair-deals:scanner-analysis";
