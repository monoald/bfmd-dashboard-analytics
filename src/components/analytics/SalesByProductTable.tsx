import type { SalesByProductBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { computeChange } from "@/lib/analytics/normalize";
import { CARD_CLASS, trendArrow, trendBadgeClass } from "./theme";

export interface SalesByProductTableProps {
  data: SalesByProductBreakdownRow[];
}

type MoneyPair = { current: number; previous: number };

const UNAVAILABLE = "—";

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

// Sums a nullable per-row money column across all rows — but only if every
// row actually has a value for it. WC's products report currently sets
// grossSales/discounts/salesReversals/taxes/totalSales to null on every row
// (see SalesByProductBreakdownRow's comment), so summing would otherwise
// silently produce a fabricated $0.00 total for data that was never
// fetched; staying null-if-any-row-is-null keeps that "unavailable" signal
// intact in the summary row too.
function sumMoneyColumn(
  rows: SalesByProductBreakdownRow[],
  pick: (row: SalesByProductBreakdownRow) => MoneyPair | null,
): MoneyPair | null {
  const pairs = rows.map(pick);
  if (pairs.some((pair) => pair === null)) return null;
  return {
    current: sum(pairs.map((pair) => pair!.current)),
    previous: sum(pairs.map((pair) => pair!.previous)),
  };
}

interface MoneyColumn {
  heading: string;
  pick: (row: SalesByProductBreakdownRow) => MoneyPair | null;
}

const MONEY_COLUMNS: MoneyColumn[] = [
  { heading: "Gross Sales", pick: (r) => r.grossSales },
  { heading: "Discounts", pick: (r) => r.discounts },
  { heading: "Sales Reversals", pick: (r) => r.salesReversals },
  { heading: "Net Sales", pick: (r) => r.netSales },
  { heading: "Taxes", pick: (r) => r.taxes },
  { heading: "Total Sales", pick: (r) => r.totalSales },
];

function MoneyCell({
  pair,
  bold,
}: {
  pair: MoneyPair | null;
  bold?: boolean;
}) {
  if (pair === null) {
    return (
      <td className="py-2 pr-4 align-top text-(--analytics-t2)">
        {UNAVAILABLE}
      </td>
    );
  }
  return (
    <td className="py-2 pr-4 align-top tabular-nums">
      <div
        className={
          bold
            ? "font-extrabold text-(--analytics-t1)"
            : "font-semibold text-(--analytics-t1)"
        }
      >
        {formatCurrency(pair.current)}
      </div>
      <div className="text-(--analytics-t2)">{formatCurrency(pair.previous)}</div>
    </td>
  );
}

export function SalesByProductTable({ data }: SalesByProductTableProps) {
  if (data.length === 0) return null;

  const netItemsSoldCurrent = sum(data.map((r) => r.netItemsSold.current));
  const netItemsSoldPrevious = sum(data.map((r) => r.netItemsSold.previous));
  const netItemsSoldChange = computeChange(
    netItemsSoldCurrent,
    netItemsSoldPrevious,
  );

  const moneySummaries = MONEY_COLUMNS.map((col) => sumMoneyColumn(data, col.pick));
  // Net Sales is always available (col index 3) — its summary drives the
  // one % change badge shown on the summary row, same convention as the
  // Net Items Sold badge above.
  const netSalesSummary = moneySummaries[3];
  const netSalesChange = netSalesSummary
    ? computeChange(netSalesSummary.current, netSalesSummary.previous)
    : null;

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Product Title</th>
            <th className="py-2 pr-4 font-semibold">Product Vendor</th>
            <th className="py-2 pr-4 font-semibold">Product Type</th>
            <th className="py-2 pr-4 font-semibold">Net Items Sold</th>
            {MONEY_COLUMNS.map((col) => (
              <th key={col.heading} className="py-2 pr-4 font-semibold">
                {col.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top font-extrabold text-(--analytics-t1)">
              Summary
            </td>
            <td className="py-2 pr-4 align-top" />
            <td className="py-2 pr-4 align-top" />
            <td className="py-2 pr-4 align-top tabular-nums">
              <div className="font-extrabold text-(--analytics-t1)">
                {formatCount(netItemsSoldCurrent)}
              </div>
              <div className="text-(--analytics-t2)">
                {formatCount(netItemsSoldPrevious)}
              </div>
              <div className="mt-1">
                <span className={trendBadgeClass(netItemsSoldChange.trend)}>
                  {trendArrow(netItemsSoldChange.trend)}{" "}
                  {Math.abs(netItemsSoldChange.changePercentage)}%
                </span>
              </div>
            </td>
            {MONEY_COLUMNS.map((col, i) => {
              const summary = moneySummaries[i];
              const isNetSales = col.heading === "Net Sales";
              return (
                <MoneyCellWithBadge
                  key={col.heading}
                  pair={summary}
                  change={isNetSales ? netSalesChange : null}
                />
              );
            })}
          </tr>
          {data.map((row) => (
            <tr
              key={row.productId}
              className="border-b border-(--analytics-border)"
            >
              <td className="py-2 pr-4 align-top text-(--analytics-t1)">
                {row.productTitle}
              </td>
              <td className="py-2 pr-4 align-top text-(--analytics-t2)">
                {row.productVendor}
              </td>
              <td className="py-2 pr-4 align-top text-(--analytics-t2)">
                {row.productType}
              </td>
              <td className="py-2 pr-4 align-top tabular-nums">
                <div className="font-semibold text-(--analytics-t1)">
                  {formatCount(row.netItemsSold.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {formatCount(row.netItemsSold.previous)}
                </div>
              </td>
              {MONEY_COLUMNS.map((col) => (
                <MoneyCell key={col.heading} pair={col.pick(row)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneyCellWithBadge({
  pair,
  change,
}: {
  pair: MoneyPair | null;
  change: ReturnType<typeof computeChange> | null;
}) {
  if (pair === null || change === null) {
    return (
      <td className="py-2 pr-4 align-top text-(--analytics-t2)">
        {UNAVAILABLE}
      </td>
    );
  }
  return (
    <td className="py-2 pr-4 align-top tabular-nums">
      <div className="font-extrabold text-(--analytics-t1)">
        {formatCurrency(pair.current)}
      </div>
      <div className="text-(--analytics-t2)">{formatCurrency(pair.previous)}</div>
      <div className="mt-1">
        <span className={trendBadgeClass(change.trend)}>
          {trendArrow(change.trend)} {Math.abs(change.changePercentage)}%
        </span>
      </div>
    </td>
  );
}
