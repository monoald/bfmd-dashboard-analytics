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

export const DEFAULT_PAGE_CONCURRENCY = 5;

// Runs `fn` over every item in `items`, at most `limit` calls in flight at
// once, preserving output order regardless of completion order.
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// Fetches every page of a listing endpoint rather than assuming the result
// fits in one page. A single per_page: "100" request silently truncates
// once a store has more matching rows than that in the queried window (seen
// live: 315 active customers in a 30-day window on a store with heavy QA
// seed data), dropping real customers from both the numerator and
// denominator of the returning-rate calculation with no visible error.
//
// Page 1 is fetched first (sequentially) to learn X-WP-TotalPages; the
// remaining pages are then fetched in parallel, capped at
// DEFAULT_PAGE_CONCURRENCY so a single WordPress/PHP-FPM backend isn't hit
// with dozens of simultaneous requests (that risks queuing/timeouts on a
// backend with a limited worker pool, which could net out slower than
// sequential fetching, not faster).
//
// If any page comes back empty, every page from that one onward is
// discarded, even if pages after it returned rows — the old sequential
// implementation stopped the instant it saw an empty page, regardless of
// what X-WP-TotalPages claimed (a real WC quirk); this reproduces the same
// final result now that pages can't be stopped mid-flight once dispatched.
export async function fetchWcAllPages<T>(
  path: string,
  params: Record<string, string> = {},
  pageSize = 100,
): Promise<T[]> {
  const firstPageResponse = await wcRequest(path, {
    ...params,
    per_page: String(pageSize),
    page: "1",
  });
  const firstPageRows = (await firstPageResponse.json()) as T[];
  const totalPages = Number(
    firstPageResponse.headers.get("X-WP-TotalPages") ?? "1",
  );

  if (totalPages <= 1 || firstPageRows.length === 0) {
    return firstPageRows;
  }

  const remainingPageNumbers = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2,
  );
  const remainingPages = await mapWithConcurrencyLimit(
    remainingPageNumbers,
    DEFAULT_PAGE_CONCURRENCY,
    async (page) => {
      const response = await wcRequest(path, {
        ...params,
        per_page: String(pageSize),
        page: String(page),
      });
      return (await response.json()) as T[];
    },
  );

  const allPages = [firstPageRows, ...remainingPages];
  const firstEmptyIndex = allPages.findIndex((rows) => rows.length === 0);
  const keptPages =
    firstEmptyIndex === -1 ? allPages : allPages.slice(0, firstEmptyIndex);
  return keptPages.flat();
}
