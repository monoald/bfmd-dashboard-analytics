import { computeChange } from "@/lib/analytics/normalize";
import type { FunnelStep } from "@/lib/analytics/types";
import {
  CARD_CLASS,
  HERO_VALUE_CLASS,
  LABEL_CLASS,
  trendArrow,
  trendBadgeClass,
} from "./theme";

export interface FunnelHeadline {
  value: string;
  changePercentage: number;
  trend: "up" | "down";
}

export interface FunnelChartProps {
  title: string;
  steps: FunnelStep[];
  headline?: FunnelHeadline;
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 130;
// Portion of each column's width spent on the sloped connector to its
// neighbor, rather than the flat "plateau" aligned under its label.
const RAMP_FRACTION = 0.22;

function stepHeight(step: FunnelStep): number {
  const clamped = Math.max(0, Math.min(100, step.percentage));
  return CHART_HEIGHT - (clamped / 100) * CHART_HEIGHT;
}

function buildTopEdgePoints(steps: FunnelStep[]): [number, number][] {
  const segmentWidth = CHART_WIDTH / steps.length;
  const rampHalf = (segmentWidth * RAMP_FRACTION) / 2;
  const heights = steps.map(stepHeight);

  const points: [number, number][] = [[0, heights[0]]];
  for (let i = 0; i < steps.length - 1; i++) {
    const boundary = (i + 1) * segmentWidth;
    points.push([boundary - rampHalf, heights[i]]);
    points.push([boundary + rampHalf, heights[i + 1]]);
  }
  points.push([CHART_WIDTH, heights[heights.length - 1]]);
  return points;
}

function toPointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function buildFunnelPoints(steps: FunnelStep[]): string {
  return toPointsAttr([
    ...buildTopEdgePoints(steps),
    [CHART_WIDTH, CHART_HEIGHT],
    [0, CHART_HEIGHT],
  ]);
}

function FunnelSvg({ steps }: { steps: FunnelStep[] }) {
  const segmentWidth = CHART_WIDTH / steps.length;
  const rampHalf = (segmentWidth * RAMP_FRACTION) / 2;
  const heights = steps.map(stepHeight);

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-[130px] w-full"
    >
      <polygon
        points={buildFunnelPoints(steps)}
        fill="color-mix(in srgb, var(--analytics-accent), black 30%)"
      />
      <polyline
        points={toPointsAttr(buildTopEdgePoints(steps))}
        fill="none"
        stroke="color-mix(in srgb, var(--analytics-accent), white 35%)"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {steps.slice(0, -1).map((step, i) => {
        const boundary = (i + 1) * segmentWidth;
        const points = [
          [boundary - rampHalf, heights[i]],
          [boundary + rampHalf, heights[i + 1]],
          [boundary + rampHalf, CHART_HEIGHT],
          [boundary - rampHalf, CHART_HEIGHT],
        ]
          .map(([x, y]) => `${x},${y}`)
          .join(" ");
        return (
          <polygon
            key={step.step}
            points={points}
            fill="color-mix(in srgb, var(--analytics-accent), white 45%)"
          />
        );
      })}
    </svg>
  );
}

export function FunnelChart({ title, steps, headline }: FunnelChartProps) {
  return (
    <div className={CARD_CLASS}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className={`${LABEL_CLASS} mb-1.5`}>{title}</p>
          {headline && (
            <div className="flex items-center gap-2">
              <p className={HERO_VALUE_CLASS}>{headline.value}</p>
              <span className={trendBadgeClass(headline.trend)}>
                {trendArrow(headline.trend)}{" "}
                {Math.abs(headline.changePercentage)}%
              </span>
            </div>
          )}
        </div>
        <span
          title="Based on GA4 session counts — treat as an estimate."
          className="mt-0.5 shrink-0 text-(--analytics-t2)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </span>
      </div>

      <div
        className="mb-3 grid divide-x divide-(--analytics-border)"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((step, i) => {
          const change =
            step.previousSessions !== undefined
              ? computeChange(step.sessions, step.previousSessions)
              : null;
          return (
            <div key={step.step} className={i === 0 ? "pr-2" : "px-2"}>
              <p className="truncate text-[11px] text-(--analytics-t2)">
                {step.step}
              </p>
              <p className="text-[15px] font-bold tabular-nums text-(--analytics-t1)">
                {step.percentage}%
              </p>
              <p className="text-[12px] font-semibold tabular-nums text-(--analytics-t1)">
                {step.sessions.toLocaleString()}
              </p>
              {change && (
                <p className="text-[11px] tabular-nums text-(--analytics-t2)">
                  {trendArrow(change.trend)} {Math.abs(change.changePercentage)}
                  %
                </p>
              )}
            </div>
          );
        })}
      </div>

      <FunnelSvg steps={steps} />
    </div>
  );
}
