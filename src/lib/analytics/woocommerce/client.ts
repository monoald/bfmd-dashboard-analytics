export class WooCommerceApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(`WooCommerce API error ${status} for ${path}: ${message}`);
    this.name = "WooCommerceApiError";
  }
}

interface WcCredentials {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

function getCredentials(): WcCredentials {
  const storeUrl = process.env.WC_STORE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new Error(
      "Missing WooCommerce environment variables (WC_STORE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)",
    );
  }
  return { storeUrl, consumerKey, consumerSecret };
}

async function wcRequest(
  path: string,
  params: Record<string, string>,
): Promise<Response> {
  const { storeUrl, consumerKey, consumerSecret } = getCredentials();
  const url = new URL(`/wp-json${path}`, storeUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64",
  );
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new WooCommerceApiError(response.status, path, body);
  }
  return response;
}

export async function fetchWc<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const response = await wcRequest(path, params);
  return (await response.json()) as T;
}

export async function fetchWcCount(
  path: string,
  params: Record<string, string> = {},
): Promise<number> {
  const response = await wcRequest(path, { ...params, per_page: "1" });
  return Number(response.headers.get("X-WP-Total") ?? "0");
}

// Fetches every page of a listing endpoint rather than assuming the result
// fits in one page. A single per_page: "100" request silently truncates
// once a store has more matching rows than that in the queried window (seen
// live: 315 active customers in a 30-day window on a store with heavy QA
// seed data), dropping real customers from both the numerator and
// denominator of the returning-rate calculation with no visible error.
export async function fetchWcAllPages<T>(
  path: string,
  params: Record<string, string> = {},
  pageSize = 100,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  for (;;) {
    const response = await wcRequest(path, {
      ...params,
      per_page: String(pageSize),
      page: String(page),
    });
    const rows = (await response.json()) as T[];
    results.push(...rows);
    const totalPages = Number(response.headers.get("X-WP-TotalPages") ?? "1");
    if (page >= totalPages || rows.length === 0) break;
    page += 1;
  }
  return results;
}
