import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWc, fetchWcCount, WooCommerceApiError } from "./client";

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

    const result = await fetchWc<{ hello: string }>("/wc-analytics/reports/orders", { status: "completed" });

    expect(result).toEqual({ hello: "world" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://store.example.com/wc-analytics/reports/orders?status=completed");
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
  });

  it("throws WooCommerceApiError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" })
    );

    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(WooCommerceApiError);
  });

  it("throws when environment variables are missing", async () => {
    vi.unstubAllEnvs();
    await expect(fetchWc("/wc-analytics/reports/orders")).rejects.toThrow(/Missing WooCommerce/);
  });

  it("reads the total count from the X-WP-Total header, forcing per_page=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      headers: new Headers({ "X-WP-Total": "42" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const count = await fetchWcCount("/wc-analytics/reports/orders", { status: "completed" });

    expect(count).toBe(42);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("per_page=1");
  });
});
