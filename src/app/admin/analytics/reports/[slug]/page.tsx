import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDashboardData } from "@/lib/analytics/actions";
import { resolveRangeKeyParam } from "@/lib/analytics/date-range";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import {
  averageSeries,
  computeChange,
  sparklineToSeries,
  sumSeries,
} from "@/lib/analytics/normalize";
import {
  getReportConfig,
  type ReportConfig,
} from "@/lib/analytics/report-config";
import type { DashboardPayload } from "@/lib/analytics/types";
import { CardError } from "@/components/analytics/CardError";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { RankedList } from "@/components/analytics/RankedList";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { TimeSeriesReportTable } from "@/components/analytics/TimeSeriesReportTable";

function renderReport(config: ReportConfig, data: DashboardPayload): ReactNode {
  switch (config.slug) {
    case "gross-sales": {
      if (data.errors.grossSales) {
        return (
          <CardError title={config.title} message={data.errors.grossSales} />
        );
      }
      const metric = data.summaryCards.grossSales;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          formatValue="currency"
          variant="hero"
          showComparison={false}
          headline={{
            value: formatCurrency(metric.value),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "returning-customer-rate": {
      if (data.errors.returningCustomerRate) {
        return (
          <CardError
            title={config.title}
            message={data.errors.returningCustomerRate}
          />
        );
      }
      const metric = data.summaryCards.returningCustomerRate;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          formatValue="percent"
          variant="hero"
          showComparison={false}
          headline={{
            value: formatPercent(metric.value),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "orders-fulfilled": {
      if (data.errors.ordersFulfilled) {
        return (
          <CardError
            title={config.title}
            message={data.errors.ordersFulfilled}
          />
        );
      }
      const metric = data.summaryCards.ordersFulfilled;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          variant="hero"
          showComparison={false}
          headline={{
            value: metric.value.toLocaleString(),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "orders": {
      if (data.errors.orders) {
        return <CardError title={config.title} message={data.errors.orders} />;
      }
      const metric = data.summaryCards.orders;
      return (
        <TimeSeriesChart
          title={config.title}
          data={sparklineToSeries(metric.sparkline ?? [])}
          variant="hero"
          showComparison={false}
          headline={{
            value: metric.value.toLocaleString(),
            changePercentage: metric.changePercentage,
            trend: metric.trend,
          }}
        />
      );
    }

    case "total-sales-over-time": {
      if (data.errors.salesOverTime) {
        return (
          <CardError title={config.title} message={data.errors.salesOverTime} />
        );
      }
      const series = data.charts.salesOverTime;
      return (
        <div className="grid gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="currency"
            variant="hero"
            headline={{
              value: formatCurrency(data.summaryCards.grossSales.value),
              changePercentage: data.summaryCards.grossSales.changePercentage,
              trend: data.summaryCards.grossSales.trend,
            }}
          />
          <TimeSeriesReportTable data={series} formatValue={formatCurrency} />
        </div>
      );
    }

    case "average-order-value-over-time": {
      if (data.errors.aovOverTime) {
        return (
          <CardError title={config.title} message={data.errors.aovOverTime} />
        );
      }
      const series = data.charts.aovOverTime;
      const headline = computeChange(
        averageSeries(series, "currentPeriod"),
        averageSeries(series, "previousPeriod"),
      );
      return (
        <div className="grid gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="currency"
            variant="hero"
            headline={{
              value: formatCurrency(headline.value),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <TimeSeriesReportTable
            data={series}
            formatValue={formatCurrency}
            aggregate="average"
          />
        </div>
      );
    }

    case "sessions-over-time": {
      if (data.errors.sessionsOverTime) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsOverTime}
          />
        );
      }
      const series = data.charts.sessionsOverTime;
      const headline = computeChange(
        sumSeries(series, "currentPeriod"),
        sumSeries(series, "previousPeriod"),
      );
      return (
        <div className="grid gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            variant="hero"
            headline={{
              value: headline.value.toLocaleString(),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <TimeSeriesReportTable
            data={series}
            formatValue={(v) => v.toLocaleString()}
          />
        </div>
      );
    }

    case "conversion-rate-over-time": {
      if (data.errors.conversionRateOverTime || data.errors.conversionRate) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.conversionRateOverTime ?? data.errors.conversionRate!
            }
          />
        );
      }
      const series = data.charts.conversionRateOverTime;
      return (
        <div className="grid gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="percent"
            variant="hero"
            headline={{
              value: formatPercent(data.summaryCards.conversionRate.value),
              changePercentage:
                data.summaryCards.conversionRate.changePercentage,
              trend: data.summaryCards.conversionRate.trend,
            }}
          />
          <TimeSeriesReportTable
            data={series}
            formatValue={formatPercent}
            aggregate="average"
          />
        </div>
      );
    }

    case "total-sales-breakdown": {
      if (data.errors.salesBreakdown) {
        return (
          <CardError
            title={config.title}
            message={data.errors.salesBreakdown}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          variant="breakdown"
          items={data.charts.salesBreakdown.map((line) => ({
            name: line.label,
            value: line.value,
          }))}
          formatValue={formatCurrency}
        />
      );
    }

    case "total-sales-by-sales-channel": {
      if (data.errors.salesByChannel) {
        return (
          <CardError
            title={config.title}
            message={data.errors.salesByChannel}
          />
        );
      }
      return (
        <DonutBreakdown
          title={config.title}
          data={data.charts.salesByChannel}
          formatValue="currency"
        />
      );
    }

    case "total-sales-by-product": {
      if (data.errors.salesByProduct) {
        return (
          <CardError
            title={config.title}
            message={data.errors.salesByProduct}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          items={data.charts.salesByProduct}
          formatValue={formatCurrency}
        />
      );
    }

    case "sessions-by-device-type": {
      if (data.errors.sessionsByDevice) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsByDevice}
          />
        );
      }
      return (
        <DonutBreakdown
          title={config.title}
          data={data.charts.sessionsByDevice}
        />
      );
    }

    case "sessions-by-location": {
      if (data.errors.sessionsByLocation) {
        return (
          <CardError
            title={config.title}
            message={data.errors.sessionsByLocation}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          items={data.charts.sessionsByLocation}
        />
      );
    }

    case "total-sales-by-social-referrer": {
      if (data.errors.totalSalesBySocialReferrer) {
        return (
          <CardError
            title={config.title}
            message={data.errors.totalSalesBySocialReferrer}
          />
        );
      }
      return (
        <RankedList
          title={config.title}
          items={data.charts.totalSalesBySocialReferrer}
          formatValue={formatCurrency}
        />
      );
    }

    case "conversion-rate-breakdown": {
      if (data.errors.conversionFunnel || data.errors.conversionRate) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.conversionFunnel ?? data.errors.conversionRate!
            }
          />
        );
      }
      return (
        <FunnelChart
          title={config.title}
          steps={data.charts.conversionFunnel}
          headline={{
            value: formatPercent(data.summaryCards.conversionRate.value),
            changePercentage: data.summaryCards.conversionRate.changePercentage,
            trend: data.summaryCards.conversionRate.trend,
          }}
        />
      );
    }

    default: {
      const _exhaustive: never = config.slug;
      return _exhaustive;
    }
  }
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const { range } = await searchParams;
  const rangeKey = resolveRangeKeyParam(range);
  const data = await getDashboardData(rangeKey);

  return (
    <div className="min-h-screen bg-(--analytics-bg) p-6">
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-between border-b border-(--analytics-border) pb-4">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/admin/analytics?range=${rangeKey}`}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-(--analytics-accent) bg-(--analytics-accent-dim) text-[11px] font-extrabold tracking-[-0.5px] text-(--analytics-accent)"
            >
              BF
            </Link>
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                {config.title}
              </h1>
              <div className="text-[11px] text-(--analytics-t2)">
                Black Forest Supplements
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DashboardDateFilter />
            <ThemeToggle />
          </div>
        </div>

        {/*
          `grid` (rather than the implicit `block`) is load-bearing here: the
          hero/comparison TimeSeriesChart cards size their Recharts
          ResponsiveContainer via `h-full` + `flex-1`, which only resolves to
          a definite height when an ancestor participates in a layout mode
          (grid or flex) that gives this wrapper itself a definite height.
          On the main dashboard that ancestor is the cards' CSS Grid; this
          page has no such grid, so without `display: grid` here the chart
          area renders at 0 height (verified in both dev and production
          builds) even though the headline and table below it render fine.

          The same reasoning is why each line-comparison case's inner
          chart+table stack below uses `grid gap-3` instead of
          `flex flex-col gap-3`: once this outer wrapper is a definite-height
          grid, a flex stack would let the chart card's `h-full` resolve as a
          percentage of the *whole stack's* height, so flexbox's shrink
          algorithm steals height from the table to satisfy it — and the
          table's `min-height: auto` computes to 0 because CARD_CLASS's
          overflow-x/y classes make it a scroll container, so the stolen
          height is just clipped off with no visible scrollbar (verified
          live: total-sales-over-time showed 5/7 rows with the bolded Total
          row cut off entirely). With the inner stack also as `grid gap-3`,
          each row (chart, table) is sized independently in the grid's auto
          rows instead of competing for a shared flex budget, so the chart
          still gets its own 100%-of-row height and the table renders at its
          full natural height with every row intact. Do not "simplify" any
          of these four inner wrappers back to flex — that silently
          reintroduces the clipped-table regression.
        */}
        {/*
          Every shape fills the full width except "donut": DonutBreakdown's
          chart is a fixed pixel size and its legend rows use flex-1 on the
          name column, so at full page width the fixed-size donut ends up
          dwarfed by a legend row stretched into a huge label-to-value gap.
          Capping its width keeps the donut proportional to its legend.
        */}
        <div
          className={`grid ${config.shape === "donut" ? "max-w-md" : "w-full"}`}
        >
          {renderReport(config, data)}
        </div>
      </div>
    </div>
  );
}
