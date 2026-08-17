import type { DiagnosticEvidence,DiagnosticFault,DiagnosticIntelligenceV2Input } from "./types.ts";
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g,"'");
type Rule={signal:DiagnosticFault|"condition_only";pattern:RegExp;negative?:RegExp;weight:number};
const rules:Rule[]=[
 {signal:"condition_only",pattern:/\b(pour pieces|hs|ne fonctionne plus)\b/,weight:0},
 {signal:"hdmi_issue",pattern:/\b((port|prise|connecteur)\s+hdmi\s+(arrache|casse|hs|endommage)|hdmi\s+(hs|casse|arrache|sans image|ne fonctionne plus))\b/,negative:/\bhdmi\s+(fonctionne|ok)\b/,weight:95},
 {signal:"charging_issue",pattern:/\b(ne charge plus|charge pas|probleme de charge|port de charge (casse|hs))\b/,negative:/\b(charge correctement|charge bien|aucun probleme de charge)\b/,weight:92},
 {signal:"stick_drift",pattern:/\b(drift|joystick (derive|bouge seul)|stick (derive|bouge seul))\b/,weight:95},
 {signal:"broken_screen",pattern:/\b(ecran|vitre)\s+(casse|fissure|brise)\b/,negative:/\b(ecran|vitre)\s+(intact|sans fissure|en parfait etat)\b/,weight:95},
 {signal:"panel_damage",pattern:/\b(dalle|panel)\s+(cassee|casse|fissuree|fissure)\b/,negative:/\bdalle\s+intacte?\b/,weight:95},
 {signal:"battery_issue",pattern:/\b(batterie morte|batterie hs|batterie ne tient plus|autonomie nulle)\b/,negative:/\bbatterie\s+(bonne|ok|fonctionne)\b/,weight:90},
 {signal:"no_power",pattern:/\b(ne s'allume plus|aucun signe de vie|ne demarre plus)\b/,negative:/\b(fonctionne|demarre correctement|s'allume correctement)\b/,weight:88},
 {signal:"power_instability",pattern:/\b(s'allume puis s'eteint|redemarre seul|coupures?)\b/,weight:88},
 {signal:"no_display",pattern:/\b(ecran noir|aucune image|pas d'image|no display)\b/,weight:82},
 {signal:"sound_only",pattern:/\b(son (est )?present|du son mais (pas|aucune) image|son sans image)\b/,weight:92},
 {signal:"no_backlight",pattern:/\b(image visible (a la lampe|avec une lampe)|pas de retroeclairage)\b/,weight:95},
 {signal:"overheating",pattern:/\b(surchauffe|chauffe enormement|overheat)\b/,weight:90},
 {signal:"liquid_damage",pattern:/\b(oxyde|oxydation|tombe dans l'eau|degat liquide)\b/,weight:95},
 {signal:"disc_drive_issue",pattern:/\b(ne lit plus les disques|lecteur disque hs|avale pas les disques)\b/,weight:92},
 {signal:"keyboard_issue",pattern:/\b(clavier hs|touches? ne fonctionne(nt)? plus)\b/,weight:90},
 {signal:"hinge_damage",pattern:/\b(charniere casse|charniere hs)\b/,weight:92},
];
function values(input:DiagnosticIntelligenceV2Input){return Object.values(input.attributes||{}).flatMap(attribute=>[attribute.keyLabel,attribute.valueLabel,attribute.value,...(attribute.valuesLabel||[]),...(attribute.values||[])]).filter((item):item is string|number=>item!==null&&item!==undefined).map(String).join(" ")}
export function extractDiagnosticEvidence(input:DiagnosticIntelligenceV2Input):DiagnosticEvidence[]{const sources=[{source:"title" as const,text:input.title,multiplier:1},{source:"description" as const,text:input.description||"",multiplier:1.05},{source:"attribute" as const,text:values(input),multiplier:1.1}];const evidence:DiagnosticEvidence[]=[];for(const source of sources){const text=normalize(source.text);if(!text)continue;for(const rule of rules){const positive=text.match(rule.pattern);if(positive)evidence.push({source:source.source,text:positive[0],normalizedSignal:rule.signal,weight:Math.min(100,Math.round(rule.weight*source.multiplier)),polarity:"positive"});const negative=rule.negative&&text.match(rule.negative);if(negative)evidence.push({source:source.source,text:negative[0],normalizedSignal:rule.signal,weight:Math.min(100,Math.round(rule.weight*source.multiplier)),polarity:"negative"})}}for(const fault of input.detectedFaults||[])if(fault!=="unknown_fault")evidence.push({source:"detected_fault",text:fault,normalizedSignal:fault,weight:55,polarity:"positive"});return evidence}
