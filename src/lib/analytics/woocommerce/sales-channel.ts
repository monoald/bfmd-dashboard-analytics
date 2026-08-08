import { fetchWc } from "./client";
import type { NamedValue, PeriodBounds, ResolvedDateRange } from "../types";

interface WcOrderRow {
  created_via: string;
  total: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  checkout: "Online Store",
  "store-api": "Online Store",
  admin: "Admin",
  "rest-api": "API",
  subscription: "Subscriptions",
};

async function fetchAllOrders(period: PeriodBounds): Promise<WcOrderRow[]> {
  const perPage = 100;
  let page = 1;
  const results: WcOrderRow[] = [];

  while (true) {
    const rows = await fetchWc<WcOrderRow[]>("/wc/v3/orders", {
      after: period.start.toISOString(),
      before: period.end.toISOString(),
      status: "any",
      per_page: String(perPage),
      page: String(page),
    });
    results.push(...rows);
    if (rows.length < perPage) break;
    page += 1;
  }
  return results;
}

export async function getSalesByChannel(range: ResolvedDateRange): Promise<NamedValue[]> {
  const orders = await fetchAllOrders(range.current);
  const totalsByChannel = new Map<string, number>();

  for (const order of orders) {
    const label = CHANNEL_LABELS[order.created_via] ?? order.created_via;
    totalsByChannel.set(label, (totalsByChannel.get(label) ?? 0) + Number(order.total));
  }

  return [...totalsByChannel.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}
