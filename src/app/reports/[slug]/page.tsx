import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDashboardData } from "@/lib/analytics/actions";
import {
  buildRangeQueryParams,
  resolveRangeSelection,
} from "@/lib/analytics/date-range";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import {
  computeChange,
  sparklineToSeries,
  sumSeries,
} from "@/lib/analytics/normalize";
import {
  getReportConfig,
  SHOW_SALES_BY_CHANNEL,
  type ReportConfig,
} from "@/lib/analytics/report-config";
import type { DashboardPayload } from "@/lib/analytics/types";
import { CardError } from "@/components/analytics/CardError";
import { ConversionRateOverTimeTable } from "@/components/analytics/ConversionRateOverTimeTable";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { RankedList } from "@/components/analytics/RankedList";
import { RevenueBreakdownTable } from "@/components/analytics/RevenueBreakdownTable";
import { SessionsOverTimeTable } from "@/components/analytics/SessionsOverTimeTable";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { TotalSalesOverTimeTable } from "@/components/analytics/TotalSalesOverTimeTable";

const REPORT_CHART_HEIGHT = 420;
const REPORT_FUNNEL_HEIGHT = 260;
const REPORT_DONUT_SIZE = 220;

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
          height={REPORT_CHART_HEIGHT}
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
          height={REPORT_CHART_HEIGHT}
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
          height={REPORT_CHART_HEIGHT}
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
          height={REPORT_CHART_HEIGHT}
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
            height={REPORT_CHART_HEIGHT}
            headline={{
              value: formatCurrency(data.summaryCards.grossSales.value),
              changePercentage: data.summaryCards.grossSales.changePercentage,
              trend: data.summaryCards.grossSales.trend,
            }}
          />
          <TotalSalesOverTimeTable data={data.charts.salesOverTimeBreakdown} />
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
      const headline = data.summaryCards.averageOrderValue;
      return (
        <div className="grid gap-3">
          <TimeSeriesChart
            title={config.title}
            data={series}
            formatValue="currency"
            variant="hero"
            height={REPORT_CHART_HEIGHT}
            headline={{
              value: formatCurrency(headline.value),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <RevenueBreakdownTable data={data.charts.revenueBreakdownOverTime} />
        </div>
      );
    }

    case "sessions-over-time": {
      if (data.errors.sessionsOverTime || data.errors.sessionsOverTimeBreakdown) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.sessionsOverTime ??
              data.errors.sessionsOverTimeBreakdown!
            }
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
            height={REPORT_CHART_HEIGHT}
            headline={{
              value: headline.value.toLocaleString(),
              changePercentage: headline.changePercentage,
              trend: headline.trend,
            }}
          />
          <SessionsOverTimeTable data={data.charts.sessionsOverTimeBreakdown} />
        </div>
      );
    }

    case "conversion-rate-over-time": {
      if (
        data.errors.conversionRateOverTime ||
        data.errors.conversionRate ||
        data.errors.conversionRateOverTimeBreakdown
      ) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.conversionRateOverTime ??
              data.errors.conversionRate ??
              data.errors.conversionRateOverTimeBreakdown!
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
            height={REPORT_CHART_HEIGHT}
            headline={{
              value: formatPercent(data.summaryCards.conversionRate.value),
              changePercentage:
                data.summaryCards.conversionRate.changePercentage,
              trend: data.summaryCards.conversionRate.trend,
            }}
          />
          <ConversionRateOverTimeTable
            data={data.charts.conversionRateOverTimeBreakdown}
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
      // See SHOW_SALES_BY_CHANNEL's comment in report-config.ts: this
      // metric currently counts cancelled/failed/pending orders as sales,
      // unlike every other revenue card. Gated here too so navigating
      // directly to this URL can't surface the known-wrong numbers.
      if (!SHOW_SALES_BY_CHANNEL) {
        return (
          <CardError
            title={config.title}
            message="This report is temporarily disabled while its data source is being corrected."
          />
        );
      }
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
          size={REPORT_DONUT_SIZE}
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
          size={REPORT_DONUT_SIZE}
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
          height={REPORT_FUNNEL_HEIGHT}
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
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const { range, start, end } = await searchParams;
  const { rangeKey, customRange } = resolveRangeSelection(range, start, end);
  const data = await getDashboardData(rangeKey, customRange ?? undefined);
  const rangeQuery = buildRangeQueryParams(rangeKey, customRange);

  return (
    <div className="min-h-screen bg-(--analytics-bg) p-6">
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-between border-b border-(--analytics-border) pb-4">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/?${rangeQuery}`}
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

        <div
          className={`grid ${config.shape === "donut" ? "max-w-xl" : "w-full"}`}
        >
          {renderReport(config, data)}
        </div>
      </div>
    </div>
  );
}
