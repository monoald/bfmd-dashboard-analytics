import { CARD_CLASS } from "../theme";
import { Skeleton } from "./Skeleton";

export interface ChartSkeletonProps {
  height?: number;
}

export function ChartSkeleton({ height = 200 }: ChartSkeletonProps) {
  return (
    <div className={`${CARD_CLASS} flex h-full flex-col`}>
      <div className="mb-4 flex flex-col gap-2">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="min-h-0 flex-1" style={{ minHeight: height }} />
    </div>
  );
}
