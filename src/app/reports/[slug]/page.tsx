import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getDashboardData } from "@/lib/analytics/actions";
import {
  buildRangeQueryParams,
  resolveRangeSelection,
} from "@/lib/analytics/date-range";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import { sparklineToSeries } from "@/lib/analytics/normalize";
import {
  getReportConfig,
  SHOW_CUSTOMER_COHORT_ANALYSIS,
  SHOW_SALES_BY_CHANNEL,
  type ReportConfig,
} from "@/lib/analytics/report-config";
import type { DashboardPayload, DateRangeKey } from "@/lib/analytics/types";
import { CardError } from "@/components/analytics/CardError";
import {
  RangeTransitionProvider,
  RangeTransitionSwap,
} from "@/components/analytics/RangeTransition";
import { CohortCard } from "@/components/analytics/CohortCard";
import { ReportSkeleton } from "@/components/analytics/skeletons/ReportSkeleton";
import { ConversionRateOverTimeTable } from "@/components/analytics/ConversionRateOverTimeTable";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { GrossSalesOverTimeTable } from "@/components/analytics/GrossSalesOverTimeTable";
import { OrdersOverTimeTable } from "@/components/analytics/OrdersOverTimeTable";
import { RankedList } from "@/components/analytics/RankedList";
import { ReturningCustomerRateOverTimeTable } from "@/components/analytics/ReturningCustomerRateOverTimeTable";
import { RevenueBreakdownTable } from "@/components/analytics/RevenueBreakdownTable";
import { SalesByProductTable } from "@/components/analytics/SalesByProductTable";
import { SessionsByDeviceTable } from "@/components/analytics/SessionsByDeviceTable";
import { SessionsByLocationTable } from "@/components/analytics/SessionsByLocationTable";
import { SessionsOverTimeTable } from "@/components/analytics/SessionsOverTimeTable";
import { SocialReferrerRevenueTable } from "@/components/analytics/SocialReferrerRevenueTable";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { TotalSalesBreakdownTable } from "@/components/analytics/TotalSalesBreakdownTable";
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
        <div className="grid gap-3">
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
          <GrossSalesOverTimeTable data={data.charts.salesOverTimeBreakdown} />
        </div>
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
        <div className="grid gap-3">
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
          <ReturningCustomerRateOverTimeTable
            data={data.charts.returningCustomerRateBreakdown}
            summary={data.charts.returningCustomerRateSummary}
          />
        </div>
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
        <div className="grid gap-3">
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
          <OrdersOverTimeTable data={data.charts.ordersOverTimeBreakdown} />
        </div>
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
      if (
        data.errors.sessionsOverTime ||
        data.errors.sessionsOverTimeBreakdown
      ) {
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
      const headline = data.summaryCards.sessionsOverTime;
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
          <SessionsOverTimeTable
            data={data.charts.sessionsOverTimeBreakdown}
            summary={data.charts.sessionsOverTimeSummary}
          />
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
        <div className="grid gap-3">
          <RankedList
            title={config.title}
            variant="breakdown"
            items={data.charts.salesBreakdown.map((line) => ({
              name: line.label,
              value: line.value,
            }))}
            formatValue={formatCurrency}
          />
          <TotalSalesBreakdownTable data={data.charts.salesOverTimeBreakdown} />
        </div>
      );
    }

    case "total-sales-by-sales-channel": {
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

    // Handled directly in ReportPage, before ReportContent/renderReport are
    // invoked — cohort analysis doesn't depend on the dashboard's date
    // range, so it bypasses this range-dependent
    // getDashboardData/renderReport path entirely (see the ReportPage
    // component below). This case exists only to keep the switch
    // exhaustive over ReportSlug.
    case "customer-cohort-analysis": {
      throw new Error(
        "customer-cohort-analysis is handled directly in ReportPage before renderReport is called — this case should be unreachable",
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
        <div className="grid gap-3">
          <RankedList
            title={config.title}
            items={data.charts.salesByProduct}
            formatValue={formatCurrency}
          />
          <SalesByProductTable data={data.charts.salesByProductBreakdown} />
        </div>
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
        <div className="grid gap-3">
          <DonutBreakdown
            title={config.title}
            data={data.charts.sessionsByDevice}
            size={REPORT_DONUT_SIZE}
          />
          <SessionsByDeviceTable
            data={data.charts.sessionsByDeviceBreakdown}
            summary={data.charts.sessionsOverTimeSummary}
          />
        </div>
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
        <div className="grid gap-3">
          <RankedList
            title={config.title}
            items={data.charts.sessionsByLocation}
          />
          <SessionsByLocationTable
            data={data.charts.sessionsByLocationBreakdown}
            summary={data.charts.sessionsOverTimeSummary}
          />
        </div>
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
        <div className="grid gap-3">
          <RankedList
            title={config.title}
            items={data.charts.totalSalesBySocialReferrer}
            formatValue={formatCurrency}
          />
          <SocialReferrerRevenueTable
            data={data.charts.totalSalesBySocialReferrer}
          />
        </div>
      );
    }

    case "conversion-rate-breakdown": {
      if (
        data.errors.conversionFunnel ||
        data.errors.conversionRate ||
        data.errors.conversionRateOverTimeBreakdown
      ) {
        return (
          <CardError
            title={config.title}
            message={
              data.errors.conversionFunnel ??
              data.errors.conversionRate ??
              data.errors.conversionRateOverTimeBreakdown!
            }
          />
        );
      }
      return (
        <div className="grid gap-3">
          <FunnelChart
            title={config.title}
            steps={data.charts.conversionFunnel}
            height={REPORT_FUNNEL_HEIGHT}
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
  const rangeQuery = buildRangeQueryParams(rangeKey, customRange);

  return (
    <RangeTransitionProvider>
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
              {/* Rendered even for the cohort report, where changing the range
                  has no visible effect — cohort analysis doesn't depend on the
                  date range at all. Intentional, not a bug. */}
              <DashboardDateFilter />
              <ThemeToggle />
            </div>
          </div>

          <div
            className={`grid ${config.shape === "donut" ? "max-w-xl" : "w-full"}`}
          >
            {config.slug === "customer-cohort-analysis" ? (
              SHOW_CUSTOMER_COHORT_ANALYSIS ? (
                <Suspense fallback={<ReportSkeleton shape={config.shape} />}>
                  <CohortCard variant="full" />
                </Suspense>
              ) : (
                <CardError
                  title={config.title}
                  message="This report is temporarily disabled while its data is being verified."
                />
              )
            ) : (
              // RangeTransitionSwap covers the range-change case (see the
              // matching comment in the dashboard page); Suspense still
              // covers the first-load case.
              <RangeTransitionSwap
                fallback={<ReportSkeleton shape={config.shape} />}
              >
                <Suspense fallback={<ReportSkeleton shape={config.shape} />}>
                  <ReportContent
                    key={rangeQuery}
                    config={config}
                    rangeKey={rangeKey}
                    customRange={customRange ?? undefined}
                  />
                </Suspense>
              </RangeTransitionSwap>
            )}
          </div>
        </div>
      </div>
    </RangeTransitionProvider>
  );
}

async function ReportContent({
  config,
  rangeKey,
  customRange,
}: {
  config: ReportConfig;
  rangeKey: DateRangeKey;
  customRange?: { start: Date; end: Date };
}) {
  const data = await getDashboardData(rangeKey, customRange);
  return renderReport(config, data);
}
