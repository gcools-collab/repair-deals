export type EbayEnvironment = "sandbox" | "production";

export type EbayClientConfig = {
  clientId: string;
  clientSecret: string;
  environment: EbayEnvironment;
  marketplaceId?: string;
  timeoutMs?: number;
};

export type EbayItemSummary = {
  itemId?: unknown;
  title?: unknown;
  price?: { value?: unknown; currency?: unknown };
  itemWebUrl?: unknown;
  image?: { imageUrl?: unknown };
  seller?: { username?: unknown; feedbackPercentage?: unknown; feedbackScore?: unknown };
  topRatedBuyingExperience?: unknown;
  condition?: unknown;
  shippingOptions?: Array<{
    shippingCost?: { value?: unknown; currency?: unknown };
    minEstimatedDeliveryDate?: unknown;
    maxEstimatedDeliveryDate?: unknown;
  }>;
  itemLocation?: { country?: unknown; postalCode?: unknown };
  buyingOptions?: unknown;
  estimatedAvailabilities?: Array<{ estimatedAvailabilityStatus?: unknown }>;
  itemCreationDate?: unknown;
  itemEndDate?: unknown;
};

type TokenCache = { accessToken: string; expiresAt: number };

export class EbayApiError extends Error {
  constructor(
    message: string,
    readonly code: "oauth" | "unauthorized" | "forbidden" | "rate_limit" | "timeout" | "invalid_response" | "request",
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "EbayApiError";
  }
}

const TOKEN_SCOPE = "https://api.ebay.com/oauth/api_scope";
const TOKEN_SAFETY_MS = 60_000;

function endpoints(environment: EbayEnvironment) {
  const origin = environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  return {
    oauth: origin + "/identity/v1/oauth2/token",
    search: origin + "/buy/browse/v1/item_summary/search",
  };
}

function textValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new EbayApiError("Réponse eBay invalide.", "invalid_response", response.status);
  }
}

export class EbayBrowseClient {
  private token: TokenCache | null = null;
  private tokenRequest: Promise<string> | null = null;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly config: EbayClientConfig,
    dependencies: { fetch?: typeof fetch; now?: () => number } = {},
  ) {
    this.fetcher = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8_000);
    try {
      return await this.fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EbayApiError("La requête eBay a expiré.", "timeout");
      }
      throw new EbayApiError("eBay est momentanément inaccessible.", "request");
    } finally {
      clearTimeout(timeout);
    }
  }

  async getApplicationToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && this.token.expiresAt - TOKEN_SAFETY_MS > this.now()) {
      return this.token.accessToken;
    }
    if (!forceRefresh && this.tokenRequest) return this.tokenRequest;

    const request = this.requestToken();
    this.tokenRequest = request;
    try {
      return await request;
    } finally {
      if (this.tokenRequest === request) this.tokenRequest = null;
    }
  }

  private async requestToken() {
    const response = await this.fetchWithTimeout(endpoints(this.config.environment).oauth, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(this.config.clientId + ":" + this.config.clientSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: TOKEN_SCOPE }),
    });
    const body = await safeJson(response) as Record<string, unknown>;
    const accessToken = textValue(body.access_token);
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);

    if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new EbayApiError("L’authentification eBay a échoué.", "oauth", response.status);
    }
    this.token = { accessToken, expiresAt: this.now() + expiresIn * 1000 };
    return accessToken;
  }

  async search(query: string, limit = 10): Promise<EbayItemSummary[]> {
    return this.searchAttempt(query, Math.min(Math.max(limit, 1), 50), false);
  }

  private async searchAttempt(query: string, limit: number, retried: boolean): Promise<EbayItemSummary[]> {
    const token = await this.getApplicationToken(retried);
    const url = new URL(endpoints(this.config.environment).search);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fieldgroups", "EXTENDED");

    const response = await this.fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.config.marketplaceId ?? "EBAY_FR",
      },
    });
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.searchAttempt(query, limit, true);
    }
    if (response.status === 401) throw new EbayApiError("Le jeton eBay a été refusé.", "unauthorized", 401);
    if (response.status === 403) throw new EbayApiError("L’application eBay n’a pas accès à Browse.", "forbidden", 403);
    if (response.status === 429) throw new EbayApiError("La limite de requêtes eBay est atteinte.", "rate_limit", 429);
    if (!response.ok) throw new EbayApiError("La recherche eBay a échoué.", "request", response.status);

    const body = await safeJson(response);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new EbayApiError("Réponse de recherche eBay invalide.", "invalid_response", response.status);
    }
    const summaries = (body as { itemSummaries?: unknown }).itemSummaries;
    if (summaries === undefined) return [];
    if (!Array.isArray(summaries)) {
      throw new EbayApiError("Résultats eBay invalides.", "invalid_response", response.status);
    }
    return summaries as EbayItemSummary[];
  }
}

export function ebayConfigFromEnv(environment: NodeJS.ProcessEnv = process.env): EbayClientConfig | null {
  const clientId = environment.EBAY_CLIENT_ID?.trim();
  const clientSecret = environment.EBAY_CLIENT_SECRET?.trim();
  const selected = environment.EBAY_ENVIRONMENT?.trim() || "sandbox";
  if (!clientId || !clientSecret) return null;
  if (selected !== "sandbox" && selected !== "production") {
    throw new EbayApiError("EBAY_ENVIRONMENT doit valoir sandbox ou production.", "oauth");
  }
  return { clientId, clientSecret, environment: selected, marketplaceId: "EBAY_FR" };
}
