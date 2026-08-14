import { getLiveViewData } from "@/lib/analytics/actions";
import { formatCurrency } from "@/lib/analytics/format";
import { LiveVisitorsTile } from "@/components/analytics/LiveVisitorsTile";
import { LiveViewAutoRefresh } from "@/components/analytics/LiveViewAutoRefresh";
import { SummaryMetricCard } from "@/components/analytics/SummaryMetricCard";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { RankedList } from "@/components/analytics/RankedList";
import { NewVsReturningBar } from "@/components/analytics/NewVsReturningBar";
import { CardError } from "@/components/analytics/CardError";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { CHIP_CLASS } from "@/components/analytics/theme";

export const dynamic = "force-dynamic";

const REFRESH_INTERVAL_MS = 60_000;

export default async function LiveViewPage() {
  const data = await getLiveViewData();

  return (
    <div className="min-h-screen bg-(--analytics-bg) p-6">
      <LiveViewAutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
      <div className="md:w-[90%] mx-auto text-[13px] text-(--analytics-t1) space-y-3.5">
        <div className="flex items-center justify-between border-b border-(--analytics-border) pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-(--analytics-accent) bg-(--analytics-accent-dim) text-[11px] font-extrabold tracking-[-0.5px] text-(--analytics-accent)">
              BF
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Live View</div>
              <div className="text-[11px] text-(--analytics-t2)">
                Black Forest Supplements — since midnight
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <span
              className={`${CHIP_CLASS} border-(--analytics-up) bg-(--analytics-up-dim) text-(--analytics-up)`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-(--analytics-up)" />
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <LiveVisitorsTile initialCount={data.visitorsRightNow} />
          {data.errors.totalSales ? (
            <CardError title="Total sales" message={data.errors.totalSales} />
          ) : (
            <SummaryMetricCard
              title="Total sales"
              value={formatCurrency(data.summaryCards.totalSales.value)}
              changePercentage={data.summaryCards.totalSales.changePercentage}
              trend={data.summaryCards.totalSales.trend}
              sparklineData={data.summaryCards.totalSales.sparkline ?? []}
            />
          )}
          {data.errors.sessions ? (
            <CardError title="Sessions" message={data.errors.sessions} />
          ) : (
            <SummaryMetricCard
              title="Sessions"
              value={data.summaryCards.sessions.value.toLocaleString()}
              changePercentage={data.summaryCards.sessions.changePercentage}
              trend={data.summaryCards.sessions.trend}
              sparklineData={data.summaryCards.sessions.sparkline ?? []}
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          {data.errors.customerBehavior ? (
            <CardError
              title="Customer behavior"
              message={data.errors.customerBehavior}
            />
          ) : (
            <FunnelChart
              title="Customer behavior"
              steps={data.customerBehavior}
            />
          )}
          {data.errors.newVsReturning ? (
            <CardError
              title="New vs returning customers"
              message={data.errors.newVsReturning}
            />
          ) : (
            <NewVsReturningBar
              title="New vs returning customers"
              newCount={data.newVsReturning.new}
              returningCount={data.newVsReturning.returning}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.errors.sessionsByLocation ? (
            <CardError
              title="Sessions by location"
              message={data.errors.sessionsByLocation}
            />
          ) : (
            <RankedList
              title="Sessions by location"
              items={data.sessionsByLocation}
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
              items={data.salesByProduct}
              formatValue={formatCurrency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
