import {
  parseScannerCriteria,
  scanLeboncoin,
  ScannerRequestError,
} from "@/lib/leboncoin-scanner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const criteria = parseScannerCriteria(await request.json());
    const scan = await scanLeboncoin(criteria);
    return Response.json({ count: scan.retainedCount, ...scan });
  } catch (error) {
    if (error instanceof ScannerRequestError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "invalid_json", message: "Request body is not valid JSON" } },
        { status: 400 },
      );
    }
    return Response.json(
      { error: { code: "internal_error", message: "Scanner failed unexpectedly" } },
      { status: 500 },
    );
  }
}
