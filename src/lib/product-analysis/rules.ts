import type { FaultType, ProductCategory } from "./types.ts";

export type CategoryRule = {
  category: ProductCategory;
  subcategory: string | null;
  pattern: RegExp;
};

export const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: "mac", subcategory: "MacBook", pattern: /\bmac\s*book(?:\s+(?:air|pro))?\b|\bimac\b|\bmac\s+mini\b|\bmac\s+pro\b/i },
  { category: "smartphone", subcategory: "iPhone", pattern: /\biphone\b/i },
  { category: "tablet", subcategory: "iPad", pattern: /\bipad\b/i },
  { category: "console", subcategory: "Console de jeux", pattern: /\b(?:ps\s*[345]|playstation\s*[345]|xbox|nintendo\s+switch|switch(?:\s+(?:lite|oled))?)\b/i },
  { category: "gpu", subcategory: "Carte graphique", pattern: /\b(?:rtx|gtx)\s*[1-5]\d{3}\b|\brx\s*[5-9]\d{3}\b|\bcarte\s+graphique\b|\bgpu\b/i },
  { category: "smartphone", subcategory: null, pattern: /\bsmartphone\b|\btelephone\s+portable\b|\bgalaxy\s+(?:(?:s|a)\s*\d+|z\s+(?:fold|flip))/i },
  { category: "tablet", subcategory: null, pattern: /\btablette\b|\bgalaxy\s+tab\b|\bsurface\s+(?:pro|go)\b/i },
  { category: "laptop", subcategory: null, pattern: /\bordinateur\s+portable\b|\bpc\s+portable\b|\blaptop\b|\bnotebook\b/i },
  { category: "desktop", subcategory: null, pattern: /\bpc\s+fixe\b|\bordinateur\s+(?:fixe|de\s+bureau)\b|\btour\s+(?:pc|gaming)\b/i },
  { category: "tv", subcategory: null, pattern: /\btelevision\b|\bteleviseur\b|\btv\b/i },
  { category: "monitor", subcategory: null, pattern: /\bmoniteur\b|\becran\s+(?:pc|ordinateur|gaming)\b/i },
  { category: "computer_component", subcategory: null, pattern: /\bcarte\s+mere\b|\bprocesseur\b|\bcpu\b|\bbarrette\s+ram\b|\bssd\b|\bdisque\s+dur\b|\balimentation\s+pc\b/i },
  { category: "audio_hifi", subcategory: null, pattern: /\bampli(?:ficateur)?\b|\benceinte\b|\bcasque\b|\bbarre\s+de\s+son\b|\bhi\s*fi\b|\bhome\s+cinema\b/i },
  { category: "camera", subcategory: null, pattern: /\bappareil\s+photo\b|\breflex\b|\bhybride\b|\bcamera\b|\bcamescope\b/i },
  { category: "wearable", subcategory: null, pattern: /\bsmartwatch\b|\bmontre\s+connectee\b|\bapple\s+watch\b|\bgalaxy\s+watch\b/i },
  { category: "other_electronics", subcategory: null, pattern: /\belectronique\b|\blecteur\s+(?:dvd|blu\s*ray)\b|\bvideoprojecteur\b/i },
];

export const BRANDS = [
  "Apple", "Samsung", "Sony", "Microsoft", "Nintendo", "Lenovo", "HP", "Dell",
  "Asus", "Acer", "MSI", "LG", "Philips", "TCL", "Hisense", "Xiaomi", "Huawei",
  "Google", "OnePlus", "Nvidia", "AMD", "Canon", "Nikon", "Bose", "JBL", "Marshall",
] as const;

export type ModelRule = {
  pattern: RegExp;
  format: (match: RegExpMatchArray) => string;
  inferredBrand?: string;
  subcategory?: string;
};

export const MODEL_RULES: readonly ModelRule[] = [
  {
    pattern: /\biphone\s*(1[1-6])(?:\s*(pro\s+max|pro|max|plus|mini))?\b/i,
    format: (match) => `iPhone ${match[1]}${match[2] ? ` ${match[2].replace(/\b\w/g, (letter) => letter.toUpperCase())}` : ""}`,
    inferredBrand: "Apple",
    subcategory: "iPhone",
  },
  {
    pattern: /\bmac\s*book\s+(air|pro)(?:\s+(m[1-4]))?\b/i,
    format: (match) => `MacBook ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}${match[2] ? ` ${match[2].toUpperCase()}` : ""}`,
    inferredBrand: "Apple",
    subcategory: "MacBook",
  },
  { pattern: /\bipad(?:\s+(pro|air|mini))?\b/i, format: (match) => `iPad${match[1] ? ` ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : ""}`, inferredBrand: "Apple", subcategory: "iPad" },
  { pattern: /\bps\s*5\s*pro\b|\bplaystation\s*5\s*pro\b/i, format: () => "PS5 Pro", inferredBrand: "Sony" },
  { pattern: /\bps\s*5\s*slim\b|\bplaystation\s*5\s*slim\b/i, format: () => "PS5 Slim", inferredBrand: "Sony" },
  { pattern: /\bps\s*5\b|\bplaystation\s*5\b/i, format: () => "PS5", inferredBrand: "Sony" },
  { pattern: /\bps\s*4\s*pro\b|\bplaystation\s*4\s*pro\b/i, format: () => "PS4 Pro", inferredBrand: "Sony" },
  { pattern: /\bps\s*4\b|\bplaystation\s*4\b/i, format: () => "PS4", inferredBrand: "Sony" },
  { pattern: /\bxbox\s+series\s+s\b/i, format: () => "Xbox Series S", inferredBrand: "Microsoft" },
  { pattern: /\bxbox\s+series\s+x\b/i, format: () => "Xbox Series X", inferredBrand: "Microsoft" },
  { pattern: /\bxbox\s+one\b/i, format: () => "Xbox One", inferredBrand: "Microsoft" },
  { pattern: /\b(?:nintendo\s+)?switch\s+oled\b/i, format: () => "Switch OLED", inferredBrand: "Nintendo" },
  { pattern: /\b(?:nintendo\s+)?switch\s+lite\b/i, format: () => "Switch Lite", inferredBrand: "Nintendo" },
  { pattern: /\bnintendo\s+switch\b|\bswitch\b/i, format: () => "Switch", inferredBrand: "Nintendo" },
  { pattern: /\bgalaxy\s+(s\s*\d{2})(?:\s*(ultra|plus|fe))?\b/i, format: (match) => `Galaxy ${match[1].replace(/\s/g, "").toUpperCase()}${match[2] ? ` ${match[2].toUpperCase()}` : ""}`, inferredBrand: "Samsung" },
  { pattern: /\bgalaxy\s+(a\s*\d{2})\b/i, format: (match) => `Galaxy ${match[1].replace(/\s/g, "").toUpperCase()}`, inferredBrand: "Samsung" },
  { pattern: /\bgalaxy\s+z\s+(fold|flip)(?:\s*(\d))?\b/i, format: (match) => `Galaxy Z ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}${match[2] ? ` ${match[2]}` : ""}`, inferredBrand: "Samsung" },
  { pattern: /\b(rtx)\s*(20|30|40|50)(\d{2})(?:\s*(ti|super))?\b/i, format: (match) => `${match[1].toUpperCase()} ${match[2]}${match[3]}${match[4] ? ` ${match[4].toUpperCase()}` : ""}`, inferredBrand: "Nvidia" },
  { pattern: /\b(rx)\s*([5679]\d{3})(?:\s*(xt|xtx))?\b/i, format: (match) => `${match[1].toUpperCase()} ${match[2]}${match[3] ? ` ${match[3].toUpperCase()}` : ""}`, inferredBrand: "AMD" },
];

export type FaultRule = { fault: FaultType; pattern: RegExp };

export const FAULT_RULES: readonly FaultRule[] = [
  { fault: "cracked_screen", pattern: /\becran\s+(?:casse|fissure|brise)\b|\bdalle\s+(?:cassee|fissuree|brisee)\b/i },
  { fault: "broken_screen", pattern: /\becran\s+(?:casse|fissure|brise|hs|hors\s+service)\b|\bdalle\s+(?:hs|hors\s+service)\b/i },
  { fault: "no_power", pattern: /\bne\s+s\s+allume\s+plus\b|\bne\s+s\s+allume\s+pas\b|\baucune\s+alimentation\b/i },
  { fault: "no_boot", pattern: /\bne\s+demarre\s+plus\b|\bne\s+demarre\s+pas\b|\bboot\s+(?:loop|impossible)\b/i },
  { fault: "charging_issue", pattern: /\bne\s+charge\s+plus\b|\bne\s+charge\s+pas\b|\bprobleme\s+de\s+charge\b|\bport\s+de\s+charge\b/i },
  { fault: "battery_issue", pattern: /\bbatterie\s+(?:hs|morte|usee|defectueuse|gonflee)\b|\bautonomie\s+(?:faible|nulle)\b/i },
  { fault: "hdmi_issue", pattern: /\bhdmi\s+(?:hs|casse|defectueux|hors\s+service)\b|\bport\s+hdmi\b/i },
  { fault: "motherboard_issue", pattern: /\bcarte\s+mere\s+(?:hs|morte|defectueuse|a\s+reparer)\b/i },
  { fault: "backlight_issue", pattern: /\bretro\s*eclairage\b|\bbacklight\b|\bbarres?\s+led\b/i },
  { fault: "display_issue", pattern: /\bpas\s+d\s+image\b|\bprobleme\s+d\s+affichage\b|\bimage\s+(?:saute|clignote)\b/i },
  { fault: "overheating", pattern: /\bsurchauffe\b|\bchauffe\s+(?:trop|anormalement)\b/i },
  { fault: "liquid_damage", pattern: /\boxyd(?:e|ee|ation)\b|\bdegat\s+(?:des\s+)?eaux?\b|\btombe\s+dans\s+l\s+eau\b/i },
  { fault: "controller_issue", pattern: /\bmanette\s+(?:hs|cassee|defectueuse)\b|\bjoy\s*con\s+drift\b|\bstick\s+drift\b/i },
  { fault: "storage_issue", pattern: /\b(?:ssd|disque\s+dur|stockage)\s+(?:hs|mort|defectueux)\b/i },
];

export const GENERIC_FAULT_PATTERN = /\ben\s+panne\b|\bpour\s+pieces?\b|\ba\s+reparer\b|\bdefectueux\b|\bdefauts?\b|\bvendu\s+en\s+l\s+etat\b|\bhs\b/i;
