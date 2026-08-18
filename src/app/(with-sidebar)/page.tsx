import Link from "next/link";
import { getDashboardData } from "@/lib/analytics/actions";
import {
  computeChange,
  averageSeries,
  sumSeries,
} from "@/lib/analytics/normalize";
import { formatCurrency, formatPercent } from "@/lib/analytics/format";
import {
  buildRangeQueryParams,
  resolveRangeSelection,
} from "@/lib/analytics/date-range";
import { DashboardDateFilter } from "@/components/analytics/DashboardDateFilter";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { TimeSeriesChart } from "@/components/analytics/TimeSeriesChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { DonutBreakdown } from "@/components/analytics/DonutBreakdown";
import { RankedList } from "@/components/analytics/RankedList";
import { CardError } from "@/components/analytics/CardError";
import { CHIP_CLASS } from "@/components/analytics/theme";

// On hold until we implement a correct data source for it — hidden from the
// dashboard for now, not removed.
const SHOW_SALES_BY_CHANNEL = false;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { range, start, end } = await searchParams;
  const { rangeKey, customRange } = resolveRangeSelection(range, start, end);
  const data = await getDashboardData(rangeKey, customRange ?? undefined);
  const rangeQuery = buildRangeQueryParams(rangeKey, customRange);

  const sessionsHeadline = computeChange(
    sumSeries(data.charts.sessionsOverTime, "currentPeriod"),
    sumSeries(data.charts.sessionsOverTime, "previousPeriod"),
  );
  const aovHeadline = computeChange(
    averageSeries(data.charts.aovOverTime, "currentPeriod"),
    averageSeries(data.charts.aovOverTime, "previousPeriod"),
  );

  return (
    <div className="p-6">
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-end gap-1.5 border-b border-(--analytics-border) pb-4">
          <DashboardDateFilter />
          <ThemeToggle />
          <span
            className={`${CHIP_CLASS} border-(--analytics-up) bg-(--analytics-up-dim) text-(--analytics-up)`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-(--analytics-up)" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {data.errors.grossSales ? (
            <CardError title="Gross sales" message={data.errors.grossSales} />
          ) : (
            <Link
              href={`/reports/gross-sales?${rangeQuery}`}
              className="block h-full"
            >
              <SummaryMetricCard
                title="Gross sales"
                value={formatCurrency(data.summaryCards.grossSales.value)}
                changePercentage={data.summaryCards.grossSales.changePercentage}
                trend={data.summaryCards.grossSales.trend}
                sparklineData={data.summaryCards.grossSales.sparkline ?? []}
              />
            </Link>
          )}
          {data.errors.returningCustomerRate ? (
            <CardError
              title="Returning customer rate"
              message={data.errors.returningCustomerRate}
            />
          ) : (
            <Link
              href={`/reports/returning-customer-rate?${rangeQuery}`}
              className="block h-full"
            >
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
            </Link>
          )}
          {data.errors.ordersFulfilled ? (
            <CardError
              title="Orders fulfilled"
              message={data.errors.ordersFulfilled}
            />
          ) : (
            <Link
              href={`/reports/orders-fulfilled?${rangeQuery}`}
              className="block h-full"
            >
              <SummaryMetricCard
                title="Orders fulfilled"
                value={data.summaryCards.ordersFulfilled.value.toLocaleString()}
                changePercentage={
                  data.summaryCards.ordersFulfilled.changePercentage
                }
                trend={data.summaryCards.ordersFulfilled.trend}
                sparklineData={
                  data.summaryCards.ordersFulfilled.sparkline ?? []
                }
              />
            </Link>
          )}
          {data.errors.orders ? (
            <CardError title="Orders" message={data.errors.orders} />
          ) : (
            <Link
              href={`/reports/orders?${rangeQuery}`}
              className="block h-full"
            >
              <SummaryMetricCard
                title="Orders"
                value={data.summaryCards.orders.value.toLocaleString()}
                changePercentage={data.summaryCards.orders.changePercentage}
                trend={data.summaryCards.orders.trend}
                sparklineData={data.summaryCards.orders.sparkline ?? []}
              />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          {data.errors.salesOverTime ? (
            <CardError
              title="Total sales over time"
              message={data.errors.salesOverTime}
            />
          ) : (
            <Link
              href={`/reports/total-sales-over-time?${rangeQuery}`}
              className="block h-full"
            >
              <TimeSeriesChart
                title="Total sales over time"
                data={data.charts.salesOverTime}
                formatValue="currency"
                variant="hero"
                headline={{
                  value: formatCurrency(data.summaryCards.grossSales.value),
                  changePercentage:
                    data.summaryCards.grossSales.changePercentage,
                  trend: data.summaryCards.grossSales.trend,
                }}
              />
            </Link>
          )}
          {data.errors.salesBreakdown ? (
            <CardError
              title="Total sales breakdown"
              message={data.errors.salesBreakdown}
            />
          ) : (
            <Link
              href={`/reports/total-sales-breakdown?${rangeQuery}`}
              className="block h-full"
            >
              <RankedList
                title="Total sales breakdown"
                variant="breakdown"
                items={data.charts.salesBreakdown.map((line) => ({
                  name: line.label,
                  value: line.value,
                }))}
                formatValue={formatCurrency}
              />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SHOW_SALES_BY_CHANNEL &&
            (data.errors.salesByChannel ? (
              <CardError
                title="Total sales by sales channel"
                message={data.errors.salesByChannel}
              />
            ) : (
              <Link
                href={`/reports/total-sales-by-sales-channel?${rangeQuery}`}
                className="block h-full"
              >
                <DonutBreakdown
                  title="Total sales by sales channel"
                  data={data.charts.salesByChannel}
                  formatValue="currency"
                />
              </Link>
            ))}
          {data.errors.aovOverTime ? (
            <CardError
              title="Average order value over time"
              message={data.errors.aovOverTime}
            />
          ) : (
            <Link
              href={`/reports/average-order-value-over-time?${rangeQuery}`}
              className="block h-full"
            >
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
            </Link>
          )}
          {data.errors.salesByProduct ? (
            <CardError
              title="Total sales by product"
              message={data.errors.salesByProduct}
            />
          ) : (
            <Link
              href={`/reports/total-sales-by-product?${rangeQuery}`}
              className="block h-full"
            >
              <RankedList
                title="Total sales by product"
                items={data.charts.salesByProduct}
                formatValue={formatCurrency}
              />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.errors.sessionsOverTime ? (
            <CardError
              title="Sessions over time"
              message={data.errors.sessionsOverTime}
            />
          ) : (
            <Link
              href={`/reports/sessions-over-time?${rangeQuery}`}
              className="block h-full"
            >
              <TimeSeriesChart
                title="Sessions over time"
                data={data.charts.sessionsOverTime}
                headline={{
                  value: sessionsHeadline.value.toLocaleString(),
                  changePercentage: sessionsHeadline.changePercentage,
                  trend: sessionsHeadline.trend,
                }}
              />
            </Link>
          )}
          {data.errors.conversionRateOverTime || data.errors.conversionRate ? (
            <CardError
              title="Conversion rate over time"
              message={
                data.errors.conversionRateOverTime ??
                data.errors.conversionRate!
              }
            />
          ) : (
            <Link
              href={`/reports/conversion-rate-over-time?${rangeQuery}`}
              className="block h-full"
            >
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
            </Link>
          )}
          {data.errors.conversionFunnel || data.errors.conversionRate ? (
            <CardError
              title="Conversion rate breakdown"
              message={
                data.errors.conversionFunnel ?? data.errors.conversionRate!
              }
            />
          ) : (
            <Link
              href={`/reports/conversion-rate-breakdown?${rangeQuery}`}
              className="block h-full"
            >
              <FunnelChart
                title="Conversion rate breakdown"
                steps={data.charts.conversionFunnel}
                headline={{
                  value: formatPercent(data.summaryCards.conversionRate.value),
                  changePercentage:
                    data.summaryCards.conversionRate.changePercentage,
                  trend: data.summaryCards.conversionRate.trend,
                }}
              />
            </Link>
          )}
          {data.errors.sessionsByDevice ? (
            <CardError
              title="Sessions by device type"
              message={data.errors.sessionsByDevice}
            />
          ) : (
            <Link
              href={`/reports/sessions-by-device-type?${rangeQuery}`}
              className="block h-full"
            >
              <DonutBreakdown
                title="Sessions by device type"
                data={data.charts.sessionsByDevice}
              />
            </Link>
          )}
          {data.errors.sessionsByLocation ? (
            <CardError
              title="Sessions by location"
              message={data.errors.sessionsByLocation}
            />
          ) : (
            <Link
              href={`/reports/sessions-by-location?${rangeQuery}`}
              className="block h-full"
            >
              <RankedList
                title="Sessions by location"
                items={data.charts.sessionsByLocation}
              />
            </Link>
          )}
          {data.errors.totalSalesBySocialReferrer ? (
            <CardError
              title="Total sales by social referrer"
              message={data.errors.totalSalesBySocialReferrer}
            />
          ) : (
            <Link
              href={`/reports/total-sales-by-social-referrer?${rangeQuery}`}
              className="block h-full"
            >
              <RankedList
                title="Total sales by social referrer"
                items={data.charts.totalSalesBySocialReferrer}
                formatValue={formatCurrency}
              />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
