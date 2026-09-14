import { CARD_CLASS } from "../theme";
import { Skeleton } from "./Skeleton";

export function SummaryCardSkeleton() {
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-2.5`}>
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-6.5 w-24" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
