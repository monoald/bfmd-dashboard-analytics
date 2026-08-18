import { AnalyticsNav } from "@/components/analytics/AnalyticsNav";

export default function AnalyticsSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-(--analytics-bg)">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-(--analytics-border) bg-(--analytics-surface) p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-(--analytics-accent) bg-(--analytics-accent-dim) text-[11px] font-extrabold tracking-[-0.5px] text-(--analytics-accent)">
            BF
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-(--analytics-t1)">
              Analytics
            </div>
            <div className="text-[11px] text-(--analytics-t2)">
              Black Forest Supplements
            </div>
          </div>
        </div>
        <AnalyticsNav />
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
