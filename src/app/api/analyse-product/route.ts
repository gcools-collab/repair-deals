import { analyzeProduct, type ProductAnalysisAttribute, type ProductAnalysisInput } from "@/lib/product-analysis";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function parseAttributes(value: unknown): Record<string, ProductAnalysisAttribute> | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isRecord(value)) throw new Error("attributes must be an object");
  const attributes: Record<string, ProductAnalysisAttribute> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) throw new Error("each attribute must be an object");
    const scalar = candidate.value;
    if (scalar !== undefined && scalar !== null && !["string", "number", "boolean"].includes(typeof scalar)) {
      throw new Error("attribute value is invalid");
    }
    if (![candidate.key, candidate.keyLabel, candidate.valueLabel].every(optionalString)) {
      throw new Error("attribute metadata is invalid");
    }
    attributes[name] = {
      key: candidate.key as string | null | undefined,
      keyLabel: candidate.keyLabel as string | null | undefined,
      value: scalar as string | number | boolean | null | undefined,
      valueLabel: candidate.valueLabel as string | null | undefined,
    };
  }
  return attributes;
}

function parseInput(value: unknown): ProductAnalysisInput {
  if (!isRecord(value)) throw new Error("request body must be an object");
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 500) {
    throw new Error("title must contain 1 to 500 characters");
  }
  if (![value.description, value.brand, value.model].every(optionalString)) {
    throw new Error("description, brand and model must be strings when provided");
  }
  if (
    value.repairKeywords !== undefined &&
    value.repairKeywords !== null &&
    (!Array.isArray(value.repairKeywords) || !value.repairKeywords.every((keyword) => typeof keyword === "string"))
  ) {
    throw new Error("repairKeywords must be an array of strings");
  }
  return {
    title: value.title.trim(),
    description: value.description as string | null | undefined,
    brand: value.brand as string | null | undefined,
    model: value.model as string | null | undefined,
    attributes: parseAttributes(value.attributes),
    repairKeywords: value.repairKeywords as string[] | null | undefined,
  };
}

export async function POST(request: Request) {
  try {
    return Response.json(analyzeProduct(parseInput(await request.json())));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    return Response.json(
      {
        error: {
          code: invalidJson ? "invalid_json" : "validation_error",
          message: invalidJson ? "Request body is not valid JSON" : error instanceof Error ? error.message : "Invalid request",
        },
      },
      { status: invalidJson ? 400 : 422 },
    );
  }
}
