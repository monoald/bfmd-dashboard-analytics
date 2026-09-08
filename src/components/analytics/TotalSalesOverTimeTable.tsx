import type { SalesOverTimeBreakdownRow } from "@/lib/analytics/types";
import { formatCurrency } from "@/lib/analytics/format";
import { CARD_CLASS } from "./theme";

export interface TotalSalesOverTimeTableProps {
  data: SalesOverTimeBreakdownRow[];
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// The summary row shows just the date ("Sep 2, 2026"), not each row's full
// date+time label ("Sep 2, 2026, 12:00 AM") — strips the time suffix when
// present; a no-op for day/week-interval labels, which never have one.
function dateOnly(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M$/, "");
}

interface ColumnSummary {
  heading: string;
  bold?: boolean;
  current: number;
  previous: number;
  row: (r: SalesOverTimeBreakdownRow) => { current: number; previous: number };
}

export function TotalSalesOverTimeTable({
  data,
}: TotalSalesOverTimeTableProps) {
  if (data.length === 0) return null;

  function columnTotal(
    pick: (r: SalesOverTimeBreakdownRow) => { current: number; previous: number },
  ) {
    return {
      current: sum(data.map((r) => pick(r).current)),
      previous: sum(data.map((r) => pick(r).previous)),
    };
  }

  const orders = columnTotal((r) => r.orders);
  const grossSales = columnTotal((r) => r.grossSales);
  const discounts = columnTotal((r) => r.discounts);
  const salesReversals = columnTotal((r) => r.salesReversals);
  const netSales = columnTotal((r) => r.netSales);
  const shippingCharges = columnTotal((r) => r.shippingCharges);
  const duties = columnTotal((r) => r.duties);
  const additionalFees = columnTotal((r) => r.additionalFees);
  const taxes = columnTotal((r) => r.taxes);
  const totalSales = columnTotal((r) => r.totalSales);

  const columns: ColumnSummary[] = [
    { heading: "Orders", ...orders, row: (r) => r.orders },
    { heading: "Gross sales", ...grossSales, row: (r) => r.grossSales },
    { heading: "Discounts", ...discounts, row: (r) => r.discounts },
    {
      heading: "Sales reversals",
      ...salesReversals,
      row: (r) => r.salesReversals,
    },
    { heading: "Net sales", ...netSales, row: (r) => r.netSales },
    {
      heading: "Shipping charges",
      ...shippingCharges,
      row: (r) => r.shippingCharges,
    },
    { heading: "Duties", ...duties, row: (r) => r.duties },
    {
      heading: "Additional fees",
      ...additionalFees,
      row: (r) => r.additionalFees,
    },
    { heading: "Taxes", ...taxes, row: (r) => r.taxes },
    {
      heading: "Total sales",
      bold: true,
      ...totalSales,
      row: (r) => r.totalSales,
    },
  ];

  function format(heading: string, value: number): string {
    return heading === "Orders" ? value.toLocaleString() : formatCurrency(value);
  }

  // WC returns intervals in descending order (most recent first — same
  // convention salesOverTime/aovOverTime/revenueBreakdownOverTime already
  // rely on), so the period's actual start date is the *last* row, not the
  // first.
  const periodStart = data[data.length - 1];
  const currentLabel = dateOnly(periodStart.currentDateLabel);
  const previousLabel = dateOnly(periodStart.previousDateLabel);

  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table className="w-full min-w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-(--analytics-border) text-(--analytics-t2)">
            <th className="py-2 pr-4 font-semibold">Date</th>
            {columns.map((col) => (
              <th
                key={col.heading}
                className={`py-2 pr-4 font-semibold ${col.bold ? "text-(--analytics-t1)" : ""}`}
              >
                {col.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-(--analytics-border)">
            <td className="py-2 pr-4 align-top">
              <div className="font-extrabold text-(--analytics-t1)">
                {currentLabel}
              </div>
              <div className="text-(--analytics-t2)">{previousLabel}</div>
            </td>
            {columns.map((col) => (
              <td
                key={col.heading}
                className="py-2 pr-4 align-top tabular-nums"
              >
                <div className="font-extrabold text-(--analytics-t1)">
                  {format(col.heading, col.current)}
                </div>
                <div className="text-(--analytics-t2)">
                  {format(col.heading, col.previous)}
                </div>
              </td>
            ))}
          </tr>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-(--analytics-border)">
              <td className="py-2 pr-4 align-top">
                <div className="text-(--analytics-t1)">
                  {r.currentDateLabel}
                </div>
                <div className="text-(--analytics-t2)">
                  {r.previousDateLabel}
                </div>
              </td>
              {columns.map((col) => {
                const { current, previous } = col.row(r);
                return (
                  <td
                    key={col.heading}
                    className="py-2 pr-4 align-top tabular-nums"
                  >
                    <div className="font-semibold text-(--analytics-t1)">
                      {format(col.heading, current)}
                    </div>
                    <div className="text-(--analytics-t2)">
                      {format(col.heading, previous)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
