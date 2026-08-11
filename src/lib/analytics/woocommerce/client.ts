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
