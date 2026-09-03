import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

    it("stops early if a page comes back empty, even if X-WP-TotalPages says more remain", async () => {
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
        });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchWcAllPages("/wc-analytics/reports/customers");

      expect(rows).toEqual([{ id: 1 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
