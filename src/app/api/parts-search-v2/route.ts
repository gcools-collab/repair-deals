import { executePartsSearchV2, type PartsSearchV2Input, type PartsSearchV2Provider } from "@/lib/parts-search-v2";
import { FAULT_TYPES, type FaultType, type ProductAnalysisAttribute } from "@/lib/product-analysis";
import { configuredAutomaticPartProviders } from "@/lib/parts-intelligence/providers/configured";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, maximum = 500) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maximum) throw new TypeError(`${field} doit être une chaîne valide`);
  return value.trim();
}

function parseAttributes(value: unknown): Record<string, ProductAnalysisAttribute> | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new TypeError("attributes doit être un objet");
  const attributes: Record<string, ProductAnalysisAttribute> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) throw new TypeError("Chaque attribut doit être un objet");
    const scalar = candidate.value;
    if (scalar !== undefined && scalar !== null && !["string", "number", "boolean"].includes(typeof scalar)) {
      throw new TypeError("La valeur d’un attribut est invalide");
    }
    const values = candidate.values;
    const valuesLabel = candidate.valuesLabel;
    if (values !== undefined && (!Array.isArray(values) || !values.every((item) => typeof item === "string"))) throw new TypeError("attributes.values est invalide");
    if (valuesLabel !== undefined && (!Array.isArray(valuesLabel) || !valuesLabel.every((item) => typeof item === "string"))) throw new TypeError("attributes.valuesLabel est invalide");
    attributes[name] = {
      key: optionalString(candidate.key, "attribute.key", 200),
      keyLabel: optionalString(candidate.keyLabel, "attribute.keyLabel", 200),
      value: scalar as string | number | boolean | null | undefined,
      valueLabel: optionalString(candidate.valueLabel, "attribute.valueLabel", 500),
      values: values as string[] | undefined,
      valuesLabel: valuesLabel as string[] | undefined,
    };
  }
  return attributes;
}

function parseFaults(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every((fault) => typeof fault === "string" && FAULT_TYPES.includes(fault as FaultType))) {
    throw new TypeError(`${field} contient une panne invalide`);
  }
  return value as FaultType[];
}

export function parsePartsSearchV2Input(value: unknown): PartsSearchV2Input {
  if (!isRecord(value)) throw new TypeError("Le corps de la requête doit être un objet");
  const title = optionalString(value.title, "title", 500);
  if (!title) throw new TypeError("title doit contenir entre 1 et 500 caractères");
  const confirmedFault = optionalString(value.confirmedFault, "confirmedFault", 100);
  if (confirmedFault && !FAULT_TYPES.includes(confirmedFault as FaultType)) throw new TypeError("confirmedFault est invalide");
  const repairKeywords = value.repairKeywords;
  if (repairKeywords !== undefined && repairKeywords !== null &&
    (!Array.isArray(repairKeywords) || !repairKeywords.every((item) => typeof item === "string" && item.length <= 200))) {
    throw new TypeError("repairKeywords doit être un tableau de chaînes");
  }
  return {
    title,
    description: optionalString(value.description, "description", 10_000),
    brand: optionalString(value.brand, "brand", 200),
    model: optionalString(value.model, "model", 300),
    reference: optionalString(value.reference, "reference", 200),
    attributes: parseAttributes(value.attributes),
    repairKeywords: repairKeywords as string[] | null | undefined,
    detectedFaults: parseFaults(value.detectedFaults, "detectedFaults"),
    confirmedFault: confirmedFault as FaultType | null,
    currency: optionalString(value.currency, "currency", 10) || "EUR",
  };
}

type ProviderResolver = () => PartsSearchV2Provider[] | Promise<PartsSearchV2Provider[]>;

export function createPartsSearchV2Handler(resolveProviders: ProviderResolver = configuredAutomaticPartProviders) {
  return async function handler(request: Request) {
    try {
      const input = parsePartsSearchV2Input(await request.json());
      return Response.json(await executePartsSearchV2(input, await resolveProviders()));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return Response.json({ error: { code: "invalid_json", message: "Le corps JSON est invalide" } }, { status: 400 });
      }
      if (error instanceof TypeError) {
        return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 422 });
      }
      return Response.json({
        error: {
          code: "parts_search_v2_failed",
          message: "La recherche V2 a échoué ; aucun fallback V1 n’a été appliqué.",
        },
      }, { status: 502 });
    }
  };
}

export const POST = createPartsSearchV2Handler();
