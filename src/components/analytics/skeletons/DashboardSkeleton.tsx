import {
  SHOW_CUSTOMER_COHORT_ANALYSIS,
  SHOW_SALES_BY_CHANNEL,
} from "@/lib/analytics/report-config";
import { ChartSkeleton } from "./ChartSkeleton";
import { DonutSkeleton } from "./DonutSkeleton";
import { ListSkeleton } from "./ListSkeleton";
import { SummaryCardSkeleton } from "./SummaryCardSkeleton";
import { TableSkeleton } from "./TableSkeleton";

// Mirrors the grid structure of src/app/(with-sidebar)/page.tsx (minus the
// header, which lives outside the Suspense boundary) so the fallback holds
// the same layout as the real content once it streams in.
export function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <ChartSkeleton />
        <ListSkeleton />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SHOW_SALES_BY_CHANNEL && <DonutSkeleton />}
        <ChartSkeleton />
        <ListSkeleton />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
        <DonutSkeleton />
        <ListSkeleton />
        <ListSkeleton />
      </div>

      {SHOW_CUSTOMER_COHORT_ANALYSIS && <TableSkeleton rows={4} columns={4} />}
    </>
  );
}
