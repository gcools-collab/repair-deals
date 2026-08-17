import type { FaultType } from "../product-analysis/types.ts";
import type { DiagnosticHypothesis, DiagnosticResolverInput } from "./types.ts";

type DiagnosticRule = Omit<DiagnosticHypothesis, "confidence" | "evidences" | "probableCauses" | "confirmedCauses"> & {
  causes: Array<{ cause: string; confidence: number }>;
};

const COMMON_DISPLAY_CHECKS = [
  "Tester avec un écran externe si le produit le permet",
  "Vérifier les traces de liquide ou d’oxydation",
  "Vérifier le rétroéclairage",
  "Vérifier les charnières et les dommages de châssis",
  "Rechercher une image faible avec une lampe lorsque pertinent",
];

const RULES: Partial<Record<FaultType, DiagnosticRule>> = {
  broken_screen: { fault: "broken_screen", causes: [{ cause: "display assembly", confidence: 78 }, { cause: "LCD panel", confidence: 68 }, { cause: "display flex cable", confidence: 42 }, { cause: "display connector", confidence: 35 }], severity: "high", requiredChecks: COMMON_DISPLAY_CHECKS, repairDifficulty: "hard", hiddenRisk: 35 },
  cracked_screen: { fault: "cracked_screen", causes: [{ cause: "display assembly", confidence: 82 }, { cause: "LCD panel", confidence: 64 }, { cause: "digitizer", confidence: 58 }], severity: "high", requiredChecks: COMMON_DISPLAY_CHECKS, repairDifficulty: "hard", hiddenRisk: 30 },
  hdmi_issue: { fault: "hdmi_issue", causes: [{ cause: "HDMI port", confidence: 78 }, { cause: "HDMI connector solder joints", confidence: 58 }, { cause: "HDMI encoder circuit", confidence: 34 }], severity: "high", requiredChecks: ["Inspecter le port HDMI et ses broches", "Tester la sortie vidéo avec un câble et un écran connus fonctionnels", "Rechercher des signes de chute ou de contrainte sur le port", "Vérifier les autres symptômes et le démarrage de la console"], repairDifficulty: "expert", hiddenRisk: 45 },
  charging_issue: { fault: "charging_issue", causes: [{ cause: "USB-C connector", confidence: 72 }, { cause: "charging port", confidence: 68 }, { cause: "charging flex cable", confidence: 46 }, { cause: "charging controller", confidence: 30 }], severity: "high", requiredChecks: ["Inspecter le connecteur et ses broches", "Tester avec un chargeur et un câble connus fonctionnels", "Mesurer la prise de charge si possible", "Vérifier les traces de liquide et les dommages de carte mère"], repairDifficulty: "hard", hiddenRisk: 42 },
  backlight_issue: { fault: "backlight_issue", causes: [{ cause: "LED backlight strips", confidence: 76 }, { cause: "backlight power board", confidence: 52 }, { cause: "panel connection", confidence: 32 }], severity: "high", requiredChecks: ["Effectuer le test de la lampe sur la dalle", "Vérifier si le son reste présent", "Tester les tensions de rétroéclairage", "Inspecter la dalle pour fissures et chocs"], repairDifficulty: "hard", hiddenRisk: 40 },
};

function supplementalFaults(input: DiagnosticResolverInput) {
  const text = `${input.originalInput.title} ${input.originalInput.description || ""}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const faults: FaultType[] = [];
  if (/\busb\s*-?\s*c\b/.test(text)) faults.push("charging_issue");
  return faults;
}

export function resolveDiagnostics(input: DiagnosticResolverInput): DiagnosticHypothesis[] {
  const faults = [...new Set([...input.analysis.detectedFaults, ...supplementalFaults(input)])];
  return faults.map((fault) => {
    const rule = RULES[fault] || { fault, causes: [], severity: "unknown" as const, requiredChecks: ["Faire confirmer la panne par un diagnostic fonctionnel"], repairDifficulty: "unknown" as const, hiddenRisk: 50 };
    const confirmed = new Set((input.confirmedCauses?.[fault] || []).map((cause) => cause.toLowerCase()));
    const probableCauses = rule.causes.filter((cause) => !confirmed.has(cause.cause.toLowerCase())).map((cause) => ({
      ...cause, status: "probable" as const, evidences: [`Cause possible issue de la règle déterministe « ${fault} » ; non confirmée.`],
    }));
    const confirmedCauses = rule.causes.filter((cause) => confirmed.has(cause.cause.toLowerCase())).map((cause) => ({
      ...cause, confidence: 100, status: "confirmed" as const, evidences: ["Cause fournie comme confirmée explicitement à l’entrée du resolver."],
    }));
    return {
      fault, probableCauses, confirmedCauses,
      confidence: Math.min(100, Math.max(input.analysis.faultConfidence, fault === "charging_issue" && supplementalFaults(input).includes(fault) ? 72 : 0)),
      severity: rule.severity, requiredChecks: [...rule.requiredChecks], repairDifficulty: rule.repairDifficulty,
      hiddenRisk: rule.hiddenRisk,
      evidences: [input.analysis.detectedFaults.includes(fault) ? `Panne « ${fault} » détectée par Product Analysis V1.` : `Panne « ${fault} » détectée par la mention explicite USB-C.`],
    };
  });
}
