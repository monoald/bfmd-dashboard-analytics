import { getDashboardData } from "@/lib/analytics/actions";
import { computeChange } from "@/lib/analytics/normalize";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { RankedList } from "@/components/analytics/RankedList";
import { CardError } from "@/components/analytics/CardError";
import { CHIP_CLASS } from "@/components/analytics/theme";
import type { DateRangeKey, TimeSeriesData } from "@/lib/analytics/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function sumSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.reduce((total, point) => total + point[key], 0);
}

function averageSeries(
  series: TimeSeriesData[],
  key: "currentPeriod" | "previousPeriod",
): number {
  return series.length === 0 ? 0 : sumSeries(series, key) / series.length;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const VALID_RANGES: DateRangeKey[] = ["today", "7d", "30d"];
  const rangeKey = VALID_RANGES.includes(range as DateRangeKey)
    ? (range as DateRangeKey)
    : "today";
  const data = await getDashboardData(rangeKey);

  const sessionsHeadline = computeChange(
    sumSeries(data.charts.sessionsOverTime, "currentPeriod"),
    sumSeries(data.charts.sessionsOverTime, "previousPeriod"),
  );
  const aovHeadline = computeChange(
    averageSeries(data.charts.aovOverTime, "currentPeriod"),
    averageSeries(data.charts.aovOverTime, "previousPeriod"),
  );

  return (
    <div className="min-h-screen bg-(--analytics-bg) p-6 ">
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-between border-b border-(--analytics-border) pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-(--analytics-accent) bg-(--analytics-accent-dim) text-[11px] font-extrabold tracking-[-0.5px] text-(--analytics-accent)">
              BF
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Analytics</div>
              <div className="text-[11px] text-(--analytics-t2)">
                Black Forest Supplements
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DashboardDateFilter />
            <span
              className={`${CHIP_CLASS} border-(--analytics-up) bg-(--analytics-up-dim) text-(--analytics-up)`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-(--analytics-up)" />
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {data.errors.grossSales ? (
            <CardError title="Gross sales" message={data.errors.grossSales} />
          ) : (
            <SummaryMetricCard
              title="Gross sales"
              value={formatCurrency(data.summaryCards.grossSales.value)}
              changePercentage={data.summaryCards.grossSales.changePercentage}
              trend={data.summaryCards.grossSales.trend}
              sparklineData={data.summaryCards.grossSales.sparkline ?? []}
            />
          )}
          {data.errors.returningCustomerRate ? (
            <CardError
              title="Returning customer rate"
              message={data.errors.returningCustomerRate}
            />
          ) : (
            <SummaryMetricCard
              title="Returning customer rate"
              value={formatPercent(
                data.summaryCards.returningCustomerRate.value,
              )}
              changePercentage={
                data.summaryCards.returningCustomerRate.changePercentage
              }
              trend={data.summaryCards.returningCustomerRate.trend}
              sparklineData={
                data.summaryCards.returningCustomerRate.sparkline ?? []
              }
            />
          )}
          {data.errors.ordersFulfilled ? (
            <CardError
              title="Orders fulfilled"
              message={data.errors.ordersFulfilled}
            />
          ) : (
            <SummaryMetricCard
              title="Orders fulfilled"
              value={data.summaryCards.ordersFulfilled.value.toLocaleString()}
              changePercentage={
                data.summaryCards.ordersFulfilled.changePercentage
              }
              trend={data.summaryCards.ordersFulfilled.trend}
              sparklineData={data.summaryCards.ordersFulfilled.sparkline ?? []}
            />
          )}
          {data.errors.orders ? (
            <CardError title="Orders" message={data.errors.orders} />
          ) : (
            <SummaryMetricCard
              title="Orders"
              value={data.summaryCards.orders.value.toLocaleString()}
              changePercentage={data.summaryCards.orders.changePercentage}
              trend={data.summaryCards.orders.trend}
              sparklineData={data.summaryCards.orders.sparkline ?? []}
            />
          )}
        </div>

        {data.errors.salesOverTime ? (
          <CardError
            title="Total sales over time"
            message={data.errors.salesOverTime}
          />
        ) : (
          <TimeSeriesChart
            title="Total sales over time"
            data={data.charts.salesOverTime}
            formatValue="currency"
            variant="hero"
            headline={{
              value: formatCurrency(data.summaryCards.grossSales.value),
              changePercentage: data.summaryCards.grossSales.changePercentage,
              trend: data.summaryCards.grossSales.trend,
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.errors.sessionsOverTime ? (
            <CardError
              title="Sessions over time"
              message={data.errors.sessionsOverTime}
            />
          ) : (
            <TimeSeriesChart
              title="Sessions over time"
              data={data.charts.sessionsOverTime}
              headline={{
                value: sessionsHeadline.value.toLocaleString(),
                changePercentage: sessionsHeadline.changePercentage,
                trend: sessionsHeadline.trend,
              }}
            />
          )}
          {data.errors.conversionRateOverTime ? (
            <CardError
              title="Conversion rate over time"
              message={data.errors.conversionRateOverTime}
            />
          ) : (
            <TimeSeriesChart
              title="Conversion rate over time"
              data={data.charts.conversionRateOverTime}
              formatValue="percent"
              headline={{
                value: formatPercent(data.summaryCards.conversionRate.value),
                changePercentage:
                  data.summaryCards.conversionRate.changePercentage,
                trend: data.summaryCards.conversionRate.trend,
              }}
            />
          )}
          {data.errors.aovOverTime ? (
            <CardError
              title="Average order value over time"
              message={data.errors.aovOverTime}
            />
          ) : (
            <TimeSeriesChart
              title="Average order value over time"
              data={data.charts.aovOverTime}
              formatValue="currency"
              headline={{
                value: formatCurrency(aovHeadline.value),
                changePercentage: aovHeadline.changePercentage,
                trend: aovHeadline.trend,
              }}
            />
          )}
          {data.errors.conversionFunnel ? (
            <CardError
              title="Conversion rate breakdown"
              message={data.errors.conversionFunnel}
            />
          ) : (
            <FunnelChart
              title="Conversion rate breakdown"
              steps={data.charts.conversionFunnel}
            />
          )}
          {data.errors.sessionsByDevice ? (
            <CardError
              title="Sessions by device type"
              message={data.errors.sessionsByDevice}
            />
          ) : (
            <DonutBreakdown
              title="Sessions by device type"
              data={data.charts.sessionsByDevice}
            />
          )}
          {data.errors.salesByChannel ? (
            <CardError
              title="Total sales by sales channel"
              message={data.errors.salesByChannel}
            />
          ) : (
            <DonutBreakdown
              title="Total sales by sales channel"
              data={data.charts.salesByChannel}
            />
          )}
          {data.errors.salesBreakdown ? (
            <CardError
              title="Total sales breakdown"
              message={data.errors.salesBreakdown}
            />
          ) : (
            <RankedList
              title="Total sales breakdown"
              variant="breakdown"
              items={data.charts.salesBreakdown.map((line) => ({
                name: line.label,
                value: line.value,
              }))}
              formatValue={formatCurrency}
            />
          )}
          {data.errors.sessionsByLocation ? (
            <CardError
              title="Sessions by location"
              message={data.errors.sessionsByLocation}
            />
          ) : (
            <RankedList
              title="Sessions by location"
              items={data.charts.sessionsByLocation}
            />
          )}
          {data.errors.totalSalesBySocialReferrer ? (
            <CardError
              title="Total sales by social referrer"
              message={data.errors.totalSalesBySocialReferrer}
            />
          ) : (
            <RankedList
              title="Total sales by social referrer"
              items={data.charts.totalSalesBySocialReferrer}
              formatValue={formatCurrency}
            />
          )}
          {data.errors.salesByProduct ? (
            <CardError
              title="Total sales by product"
              message={data.errors.salesByProduct}
            />
          ) : (
            <RankedList
              title="Total sales by product"
              items={data.charts.salesByProduct}
              formatValue={formatCurrency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
