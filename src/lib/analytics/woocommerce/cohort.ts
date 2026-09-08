import { fetchWcAllPages } from "./client";
import {
  addIsoMonths,
  dateToIsoMonth,
  isoMonthsBetween,
  wcDateToIsoMonth,
} from "../format";
import type { CohortRow } from "../types";

export interface WcOrderRow {
  customer_id: number;
  date_created: string;
}

const VISIBLE_COHORT_MONTHS = 12;
const LOOKBACK_BUFFER_MONTHS = 12;

function isoMonthStartUtc(isoMonth: string): Date {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Cohort row = customers grouped by the calendar month of their true
// first-ever order. Fetches 24 months of order history (12 visible cohort
// months + a 12-month lookback buffer) so a customer who first ordered
// before the visible window, then returns within it, isn't misclassified
// as a brand-new cohort member in the month they return. A customer whose
// real first order predates the full 24-month fetch is still
// misclassified this way — documented, bounded tradeoff, see the design
// spec's "Known limitation".
//
// `now` defaults to the real current time; callers that need caching
// (actions.ts) must call this with zero arguments so the cache key stays
// stable — passing a fresh Date each call would bust the cache every time.
export async function getCustomerCohortAnalysis(
  now: Date = new Date(),
): Promise<CohortRow[]> {
  const currentMonth = dateToIsoMonth(now);
  const fetchStartMonth = addIsoMonths(
    currentMonth,
    -(VISIBLE_COHORT_MONTHS + LOOKBACK_BUFFER_MONTHS),
  );

  const orders = await fetchWcAllPages<WcOrderRow>(
    "/wc-analytics/reports/orders",
    {
      "status_is[]": "completed",
      after: isoMonthStartUtc(fetchStartMonth).toISOString(),
    },
  );

  // Per customer, every order's month, counting duplicates — a plain
  // Set of months isn't enough because Month 0 (below) needs to tell a
  // customer's first order apart from a *repeat* order in that same
  // calendar month, which requires a count, not just presence.
  const orderMonthCountsByCustomer = new Map<number, Map<string, number>>();
  for (const order of orders) {
    // WcOrderRow types customer_id as `number`, but that's an unverified
    // assumption about this endpoint's actual live response shape (no
    // fetcher in this codebase reads this endpoint's response body, only
    // its X-WP-Total header) — coerce defensively in case the live API
    // returns customer_id as a numeric string instead.
    if (Number(order.customer_id) === 0) continue;
    const month = wcDateToIsoMonth(order.date_created);
    if (!month) continue;
    const counts =
      orderMonthCountsByCustomer.get(order.customer_id) ?? new Map<string, number>();
    counts.set(month, (counts.get(month) ?? 0) + 1);
    orderMonthCountsByCustomer.set(order.customer_id, counts);
  }

  const customerIdsByCohortMonth = new Map<string, number[]>();
  for (const [customerId, counts] of orderMonthCountsByCustomer) {
    const cohortMonth = [...counts.keys()].sort()[0];
    const ids = customerIdsByCohortMonth.get(cohortMonth) ?? [];
    ids.push(customerId);
    customerIdsByCohortMonth.set(cohortMonth, ids);
  }

  const rows: CohortRow[] = [];
  for (let i = VISIBLE_COHORT_MONTHS; i >= 1; i--) {
    const cohortMonth = addIsoMonths(currentMonth, -i);
    const cohortCustomerIds = customerIdsByCohortMonth.get(cohortMonth) ?? [];
    const cohortSize = cohortCustomerIds.length;
    const elapsed = isoMonthsBetween(cohortMonth, currentMonth);

    const retentionByMonth: number[] = [];
    if (cohortSize > 0) {
      // Month 0: customers who placed a *repeat* order within the same
      // calendar month as their first-ever order (their first order
      // itself doesn't count — that's what defines cohort membership).
      const month0ActiveCount = cohortCustomerIds.filter(
        (id) => (orderMonthCountsByCustomer.get(id)?.get(cohortMonth) ?? 0) >= 2,
      ).length;
      retentionByMonth.push(round1((month0ActiveCount / cohortSize) * 100));

      for (let n = 1; n <= elapsed; n++) {
        const targetMonth = addIsoMonths(cohortMonth, n);
        const activeCount = cohortCustomerIds.filter((id) =>
          orderMonthCountsByCustomer.get(id)?.has(targetMonth),
        ).length;
        retentionByMonth.push(round1((activeCount / cohortSize) * 100));
      }
    }

    rows.push({ cohortMonth, cohortSize, retentionByMonth });
  }

  return rows;
}
