import { CARD_CLASS } from "../theme";
import { Skeleton } from "./Skeleton";

export interface ListSkeletonProps {
  rows?: number;
}

export function ListSkeleton({ rows = 5 }: ListSkeletonProps) {
  return (
    <div className={CARD_CLASS}>
      <Skeleton className="mb-3.5 h-2.5 w-32" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
