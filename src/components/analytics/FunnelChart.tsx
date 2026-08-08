import type { FunnelStep } from "@/lib/analytics/types";
import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface FunnelChartProps {
  title: string;
  steps: FunnelStep[];
}

export function FunnelChart({ title, steps }: FunnelChartProps) {
  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-4`}>{title}</p>
      <div className="flex flex-col gap-1.5">
        {steps.map((step, index) => (
          <div key={step.step}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-(--analytics-t2)">{step.step}</span>
              <span className="font-semibold tabular-nums text-(--analytics-t1)">
                {step.sessions.toLocaleString()}{" "}
                <span className="font-normal text-(--analytics-t2)">
                  {step.percentage}%
                </span>
              </span>
            </div>
            <div className="h-0.75 overflow-hidden rounded-full bg-(--analytics-border)">
              <div
                className="h-full rounded-full bg-(--analytics-accent)"
                style={{
                  width: `${step.percentage}%`,
                  opacity: 1 - index * 0.2,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
