import type { LeboncoinListing } from "../leboncoin-scanner.ts";

export type ListingSubjectKind = "complete_device" | "controller" | "game" | "accessory" | "spare_part" | "empty_box" | "service" | "bundle" | "vehicle" | "unrelated" | "unknown";
export type BundleSeverity = "none" | "small" | "large";
export type ListingSubjectClassification = { kind: ListingSubjectKind; bundleSeverity: BundleSeverity; evidence: string[] };

const norm=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9+]+/g," ").trim();
function attributesText(listing:LeboncoinListing){return norm(Object.entries(listing.attributes).flatMap(([name,attribute])=>[name,attribute.key,attribute.keyLabel,attribute.value,attribute.valueLabel,...attribute.values,...attribute.valuesLabel]).filter(value=>value!==null&&value!==undefined).join(" "));}

export function classifyListingSubject(listing:LeboncoinListing):ListingSubjectClassification{
  const title=norm(listing.title),description=norm(listing.description||""),attributes=attributesText(listing),all=`${title} ${description} ${attributes}`;
  const evidence:string[]=[];
  if(/\b(boite|box|emballage|carton)\b[^.]{0,50}\b(vide|seul(?:e)?|only)\b|\bbox only\b/.test(all))return{kind:"empty_box",bundleSeverity:"none",evidence:["empty_box_signal"]};
  if(/\b(automobile|vehicule|voiture|moto|scooter|velo|vtt|utilitaire)\b/.test(attributes)||/\b(voiture|automobile|vehicule|moto|scooter|velo|vtt)\b/.test(title))return{kind:"vehicle",bundleSeverity:"none",evidence:[attributes?"structured_vehicle_category":"vehicle_text_signal"]};
  if(listing.listingKind==="service"||/\b(reparation|service|pose|installation|deblocage|diagnostic)\b/.test(title))return{kind:"service",bundleSeverity:"none",evidence:["service_signal"]};
  const complete=/^(?:console\s+)?(?:sony\s+)?(?:ps\s*5|playstation\s*5)\b|^(?:console\s+)?(?:nintendo\s+)?switch(?:\s+(?:oled|lite|2))?\b|^(?:apple\s+)?(?:iphone|ipad|macbook)\b|^(?:tv|television|televiseur)\b/.test(title);
  const largeBundle=listing.listingKind==="lot"||/\b(lot|gros\s+pack)\b/.test(title)||/\b(?:[3-9]|\d{2,})\s*(?:jeux|manettes|accessoires)\b/.test(all);
  if(largeBundle)return{kind:"bundle",bundleSeverity:"large",evidence:["large_bundle_signal"]};
  if(/\b(ventilateur|lecteur\s+carte|port\s+hdmi|hdmi\s+port|connecteur|joystick|stick\s+analogique|nappe|carte\s+mere|piece\s+detachee)\b/.test(title))return{kind:"spare_part",bundleSeverity:"none",evidence:["spare_part_signal"]};
  if(/\b(coque|housse|etui|chargeur|cable|support|protection|station\s+de\s+charge)\b/.test(title))return{kind:"accessory",bundleSeverity:"none",evidence:["accessory_signal"]};
  if(!complete&&/\b(dualsense|joy\s*con|manette|controller|controleur)\b/.test(title))return{kind:"controller",bundleSeverity:"none",evidence:["controller_signal"]};
  const explicitGame=/\b(jeu|jeux|edition\s+physique|cartouche|disque\s+de\s+jeu|pegi\s*\d+)\b/.test(all);
  const platformSuffix=/\b(?:ps\s*5|playstation\s*5|switch|xbox)\b\s*$/.test(title)&&!complete;
  const structuredGame=/\b(jeu|jeux|gaming software|video game)\b/.test(attributes);
  if(explicitGame||platformSuffix||structuredGame)return{kind:"game",bundleSeverity:"none",evidence:[structuredGame?"structured_game_category":explicitGame?"game_signal":"platform_used_as_compatibility"]};
  if(complete){const smallBundle=/\bavec\s+(?:une?\s+)?manette\b|\+\s*manette\b/.test(title);if(smallBundle)evidence.push("small_bundle_signal");return{kind:"complete_device",bundleSeverity:smallBundle?"small":"none",evidence};}
  if(listing.listingKind==="accessory")return{kind:"accessory",bundleSeverity:"none",evidence:["provider_accessory_kind"]};
  if(listing.listingKind==="spare_part")return{kind:"spare_part",bundleSeverity:"none",evidence:["provider_spare_part_kind"]};
  if(/\b(renault|dacia)\b/.test(title)&&/\b(km|diesel|essence|dci|tce)\b/.test(all))return{kind:"vehicle",bundleSeverity:"none",evidence:["vehicle_text_fallback"]};
  return{kind:"unknown",bundleSeverity:"none",evidence:[]};
}
