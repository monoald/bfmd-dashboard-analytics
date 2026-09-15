import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAGE_CONCURRENCY,
  fetchWc,
  fetchWcAllPages,
  fetchWcCount,
  WooCommerceApiError,
} from "./client";

describe("WooCommerce client", () => {
  beforeEach(() => {
    vi.stubEnv("WC_STORE_URL", "https://store.example.com");
    vi.stubEnv("WC_CONSUMER_KEY", "ck_test");
    vi.stubEnv("WC_CONSUMER_SECRET", "cs_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds the request URL, query params, and Basic Auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWc<{ hello: string }>(
      "/wc-analytics/reports/orders",
      { status: "completed" },
    );

    expect(result).toEqual({ hello: "world" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://store.example.com/wp-json/wc-analytics/reports/orders?status=completed",
    );
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`,
    );
  });

  it("throws WooCommerceApiError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );

    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(
      WooCommerceApiError,
    );
  });

  it("throws when environment variables are missing", async () => {
    vi.unstubAllEnvs();
    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(
      /Missing WooCommerce/,
    );
  });

  it("reads the total count from the X-WP-Total header, forcing per_page=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      headers: new Headers({ "X-WP-Total": "42" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const count = await fetchWcCount("/wc-analytics/reports/orders", {
      status: "completed",
    });

    expect(count).toBe(42);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("per_page=1");
  });

  describe("fetchWcAllPages", () => {
    it("stops after one page when X-WP-TotalPages is 1", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: 1 }, { id: 2 }],
        headers: new Headers({ "X-WP-TotalPages": "1" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("fetches every page and concatenates the results, not just the first 100 rows", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1 }, { id: 2 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 3 }, { id: 4 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 5 }],
          headers: new Headers({ "X-WP-TotalPages": "3" }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain("page=1");
      expect(fetchMock.mock.calls[1][0]).toContain("page=2");
      expect(fetchMock.mock.calls[2][0]).toContain("page=3");
    });

    // Page 1 is always fetched first and read for X-WP-TotalPages before any
    // other page is requested — this is what lets an empty page 1 (below)
    // return an empty result without ever consulting the header.
    it("returns no rows and fetches only once when page 1 is empty", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
        headers: new Headers({ "X-WP-TotalPages": "5" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // The old sequential implementation stopped the instant it saw an empty
    // page, even if X-WP-TotalPages claimed more remained (a real WC quirk).
    // The new implementation can't stop mid-flight once pages 2+ are fetched
    // in parallel, so it fetches them all and then truncates the combined
    // result at the first empty page, discarding anything after it — same
    // final result, at the cost of a few now-wasted requests in this rare
    // case.
    it("truncates at the first empty page even if later pages return rows and X-WP-TotalPages says more remain", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 3 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 4 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 5 }],
          headers: new Headers({ "X-WP-TotalPages": "5" }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([{ id: 1 }]);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("never issues more than DEFAULT_PAGE_CONCURRENCY page requests at once", async () => {
      const TOTAL_PAGES = 12;
      let inFlight = 0;
      let maxInFlight = 0;

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const page = new URL(url).searchParams.get("page");
        await new Promise((resolve) =>
          setTimeout(resolve, (TOTAL_PAGES - Number(page)) * 2),
        );
        inFlight -= 1;
        return {
          ok: true,
          json: async () => [{ id: `page-${page}` }],
          headers: new Headers({ "X-WP-TotalPages": String(TOTAL_PAGES) }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages<{ id: string }>(
        "/wc-analytics/reports/customers",
      );

      expect(rows).toHaveLength(TOTAL_PAGES);
      expect(fetchMock).toHaveBeenCalledTimes(TOTAL_PAGES);
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(DEFAULT_PAGE_CONCURRENCY);
      expect(rows.map((r) => r.id)).toEqual(
        Array.from({ length: TOTAL_PAGES }, (_, i) => `page-${i + 1}`),
      );
    });
  });
});
