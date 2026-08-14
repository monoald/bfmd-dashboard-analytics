import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface NewVsReturningBarProps {
  title: string;
  newCount: number;
  returningCount: number;
}

export function NewVsReturningBar({
  title,
  newCount,
  returningCount,
}: NewVsReturningBarProps) {
  const total = newCount + returningCount;
  const newPercent = total === 0 ? 0 : (newCount / total) * 100;
  const returningPercent = total === 0 ? 0 : (returningCount / total) * 100;

  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-3.5`}>{title}</p>
      <div className="mb-2 flex items-center gap-4 text-[12px]">
        <span className="flex items-center gap-1.5 text-(--analytics-t2)">
          <span className="h-2 w-2 rounded-full bg-(--analytics-accent)" />
          New
          <span className="font-bold text-(--analytics-t1)">{newCount}</span>
        </span>
        <span className="flex items-center gap-1.5 text-(--analytics-t2)">
          <span className="h-2 w-2 rounded-full bg-(--analytics-up)" />
          Returning
          <span className="font-bold text-(--analytics-t1)">
            {returningCount}
          </span>
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-(--analytics-border)">
        <div
          data-testid="new-segment"
          className="h-full bg-(--analytics-accent)"
          style={{ width: `${newPercent}%` }}
        />
        <div
          data-testid="returning-segment"
          className="h-full bg-(--analytics-up)"
          style={{ width: `${returningPercent}%` }}
        />
      </div>
    </div>
  );
}
