import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ fetchWcAllPages: vi.fn() }));

import { fetchWcAllPages } from "./client";
import { getCustomerCohortAnalysis } from "./cohort";
import type { WcOrderRow } from "./cohort";

afterEach(() => {
  vi.resetAllMocks();
});

// "Now" is fixed mid-September 2026, so the current (partial) month is
// 2026-09, the most recent visible cohort row is 2026-08 (elapsed = 1),
// and the oldest visible cohort row is 2025-09 (elapsed = 12).
const NOW = new Date("2026-09-08T00:00:00Z");

function orderRow(customerId: number, dateCreated: string) {
  return { customer_id: customerId, date_created: dateCreated };
}

describe("getCustomerCohortAnalysis", () => {
  it("queries /wc-analytics/reports/orders for completed orders starting 24 months before now, paginated", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    await getCustomerCohortAnalysis(NOW);

    expect(fetchWcAllPages).toHaveBeenCalledTimes(1);
    expect(fetchWcAllPages).toHaveBeenCalledWith(
      "/wc-analytics/reports/orders",
      {
        "status_is[]": "completed",
        after: new Date(Date.UTC(2024, 8, 1)).toISOString(),
      },
    );
  });

  it("returns 12 rows, ordered oldest to newest, spanning the 12 months before the current in-progress month", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows.map((r) => r.cohortMonth)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("gives the most recent cohort row exactly 1 elapsed-month column and the oldest row 12", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(10, "2025-09-05 10:00:00"), // oldest visible cohort month
      orderRow(11, "2026-08-05 10:00:00"), // most recent visible cohort month
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows[0].cohortMonth).toBe("2025-09");
    expect(rows[0].retentionByMonth).toHaveLength(12);
    expect(rows[11].cohortMonth).toBe("2026-08");
    expect(rows[11].retentionByMonth).toHaveLength(1);
  });

  it("gives a cohort with zero customers an empty retentionByMonth array regardless of elapsed months", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows[0].cohortSize).toBe(0); // 2025-09, 12 months elapsed
    expect(rows[0].retentionByMonth).toEqual([]);
  });

  it("groups a customer's orders under the calendar month of their first order, computing per-month (non-cumulative) retention", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      // Customer A: first order June 2026, repeats in July and August.
      orderRow(1, "2026-06-05 10:00:00"),
      orderRow(1, "2026-07-10 10:00:00"),
      orderRow(1, "2026-08-02 10:00:00"),
      // Customer B: first (and only) order June 2026, no repeat.
      orderRow(2, "2026-06-20 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);
    const juneCohort = rows.find((r) => r.cohortMonth === "2026-06");

    expect(juneCohort?.cohortSize).toBe(2);
    // Elapsed months from 2026-06 to 2026-09 (current) = 3: Jul, Aug, Sep.
    // Jul: A active (1/2=50%). Aug: A active (1/2=50%). Sep: neither (0%).
    expect(juneCohort?.retentionByMonth).toEqual([50, 50, 0]);
  });

  it("excludes guest checkouts (customer_id 0) from cohort membership", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(0, "2026-06-05 10:00:00"),
      orderRow(0, "2026-07-05 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);
    const juneCohort = rows.find((r) => r.cohortMonth === "2026-06");

    expect(juneCohort?.cohortSize).toBe(0);
  });

  it("excludes guest checkouts even when the live API returns customer_id as the string \"0\" instead of the number 0", async () => {
    // WcOrderRow types customer_id as `number`, but that's an unverified
    // assumption about the live API's actual response shape (see cohort.ts).
    // Deliberately bypass the type here to simulate the live API returning
    // customer_id as a numeric string.
    const guestOrderWithStringId = {
      customer_id: "0",
      date_created: "2026-06-05 10:00:00",
    } as unknown as WcOrderRow;
    vi.mocked(fetchWcAllPages).mockResolvedValue([guestOrderWithStringId]);

    const rows = await getCustomerCohortAnalysis(NOW);
    const juneCohort = rows.find((r) => r.cohortMonth === "2026-06");

    expect(juneCohort?.cohortSize).toBe(0);
  });

  it("assigns a customer's cohort by their earliest order regardless of array order", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      orderRow(3, "2026-07-15 10:00:00"),
      orderRow(3, "2026-06-01 10:00:00"), // earlier order, appears second
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    expect(rows.find((r) => r.cohortMonth === "2026-06")?.cohortSize).toBe(1);
    expect(rows.find((r) => r.cohortMonth === "2026-07")?.cohortSize).toBe(0);
  });

  it("excludes a customer from a visible cohort row if their true first order was in the 12-month lookback buffer", async () => {
    vi.mocked(fetchWcAllPages).mockResolvedValue([
      // True first order Jan 2025 — inside the fetched 24-month window but
      // before the 12 visible cohort months (2025-09 onward). Then a
      // return order in March 2026, inside the visible window.
      orderRow(4, "2025-01-10 10:00:00"),
      orderRow(4, "2026-03-05 10:00:00"),
    ]);

    const rows = await getCustomerCohortAnalysis(NOW);

    // Must NOT be counted as a new March 2026 cohort member.
    expect(rows.find((r) => r.cohortMonth === "2026-03")?.cohortSize).toBe(0);
  });
});
