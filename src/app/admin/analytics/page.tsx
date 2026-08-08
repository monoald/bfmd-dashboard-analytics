import { getDashboardData } from "@/lib/analytics/actions";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { RankedList } from "@/components/analytics/RankedList";
import { CardError } from "@/components/analytics/CardError";
import type { DateRangeKey } from "@/lib/analytics/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
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

  return (
    <div className="min-h-screen bg-[#F6F6F7] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <DashboardDateFilter />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
        {data.errors.conversionRate ? (
          <CardError
            title="Conversion rate"
            message={data.errors.conversionRate}
          />
        ) : (
          <SummaryMetricCard
            title="Conversion rate"
            value={formatPercent(data.summaryCards.conversionRate.value)}
            changePercentage={data.summaryCards.conversionRate.changePercentage}
            trend={data.summaryCards.conversionRate.trend}
            sparklineData={data.summaryCards.conversionRate.sparkline ?? []}
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
        {data.errors.returningCustomerRate ? (
          <CardError
            title="Returning customer rate"
            message={data.errors.returningCustomerRate}
          />
        ) : (
          <SummaryMetricCard
            title="Returning customer rate"
            value={formatPercent(data.summaryCards.returningCustomerRate.value)}
            changePercentage={
              data.summaryCards.returningCustomerRate.changePercentage
            }
            trend={data.summaryCards.returningCustomerRate.trend}
            sparklineData={
              data.summaryCards.returningCustomerRate.sparkline ?? []
            }
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.errors.sessionsOverTime ? (
          <CardError
            title="Sessions over time"
            message={data.errors.sessionsOverTime}
          />
        ) : (
          <TimeSeriesChart
            title="Sessions over time"
            data={data.charts.sessionsOverTime}
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
            items={data.charts.salesBreakdown.map((line) => ({
              name: line.label,
              value: line.value,
            }))}
            formatValue={formatCurrency}
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
  );
}
