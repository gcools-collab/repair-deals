import { analyzeProduct } from "../product-analysis/index.ts";
import type { DeviceResolverInput } from "./types.ts";
import { resolveDeviceIdentity } from "./device-resolver.ts";
import { resolveDiagnostics } from "./diagnostic-resolver.ts";
import { resolvePrecisePartRequirements } from "./part-requirements-resolver.ts";

export * from "./types.ts";
export * from "./catalog.ts";
export * from "./device-resolver.ts";
export * from "./diagnostic-resolver.ts";
export * from "./part-requirements-types.ts";
export * from "./part-requirements-resolver.ts";

export function analyzeProductV2(input: DeviceResolverInput) {
  const analysis = input.v1Analysis || analyzeProduct(input);
  const product = resolveDeviceIdentity({ ...input, v1Analysis: analysis });
  const diagnostics = resolveDiagnostics({ product, analysis, originalInput: input });
  const partRequirements = resolvePrecisePartRequirements({ product, diagnostics });
  return { product, diagnostics, partRequirements, v1Analysis: analysis };
}
