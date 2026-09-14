import type { ReportShape } from "@/lib/analytics/report-config";
import { ChartSkeleton } from "./ChartSkeleton";
import { DonutSkeleton } from "./DonutSkeleton";
import { ListSkeleton } from "./ListSkeleton";
import { TableSkeleton } from "./TableSkeleton";

// Mirrors the chart/funnel/donut sizing used by the real report page
// (src/app/reports/[slug]/page.tsx) so the fallback doesn't visibly resize
// once real content streams in.
const REPORT_CHART_HEIGHT = 420;
const REPORT_FUNNEL_HEIGHT = 260;
const REPORT_DONUT_SIZE = 220;

export interface ReportSkeletonProps {
  shape: ReportShape;
}

// Approximates each shape's typical layout (most report pages pair a
// chart/list with a breakdown table) rather than replicating the full
// slug-by-slug switch in reports/[slug]/page.tsx's renderReport — a couple
// of single-component report pages will briefly show an extra table
// placeholder, which is an acceptable trade-off for a fallback shown only
// while data streams in.
export function ReportSkeleton({ shape }: ReportSkeletonProps) {
  switch (shape) {
    case "line-simple":
    case "line-comparison":
      return (
        <div className="grid gap-3">
          <ChartSkeleton height={REPORT_CHART_HEIGHT} />
          <TableSkeleton />
        </div>
      );
    case "donut":
      return (
        <div className="grid gap-3">
          <DonutSkeleton size={REPORT_DONUT_SIZE} />
          <TableSkeleton />
        </div>
      );
    case "ranked":
    case "list":
      return (
        <div className="grid gap-3">
          <ListSkeleton />
          <TableSkeleton />
        </div>
      );
    case "funnel":
      return (
        <div className="grid gap-3">
          <ChartSkeleton height={REPORT_FUNNEL_HEIGHT} />
          <TableSkeleton />
        </div>
      );
    case "cohort-grid":
      return <TableSkeleton rows={8} columns={6} />;
  }
}
