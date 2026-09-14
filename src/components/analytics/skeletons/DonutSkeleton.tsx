import { CARD_CLASS } from "../theme";
import { Skeleton } from "./Skeleton";

export interface DonutSkeletonProps {
  size?: number;
}

export function DonutSkeleton({ size = 140 }: DonutSkeletonProps) {
  return (
    <div className={`${CARD_CLASS} flex h-full flex-col`}>
      <Skeleton className="mb-3.5 h-2.5 w-32" />
      <div className="flex flex-1 items-center gap-6">
        <Skeleton
          className="shrink-0 rounded-full"
          style={{ width: size, height: size }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
