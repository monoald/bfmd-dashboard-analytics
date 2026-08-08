import type { FunnelStep } from "@/lib/analytics/types";

export interface FunnelChartProps {
  title: string;
  steps: FunnelStep[];
}

export function FunnelChart({ title, steps }: FunnelChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-4">{title}</p>
      <div className="flex gap-4">
        {steps.map((step) => (
          <div key={step.step} className="flex-1">
            <p className="text-xs text-gray-500">{step.step}</p>
            <p className="text-2xl font-semibold">{step.percentage}%</p>
            <p className="text-xs text-gray-400">{step.sessions.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
