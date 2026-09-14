import { CARD_CLASS } from "../theme";
import { Skeleton } from "./Skeleton";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 6, columns = 2 }: TableSkeletonProps) {
  return (
    <div className={`${CARD_CLASS} overflow-hidden`}>
      <div className="mb-3 flex gap-4 border-b border-(--analytics-border) pb-2.5">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 w-16 flex-1" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: columns }, (_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
