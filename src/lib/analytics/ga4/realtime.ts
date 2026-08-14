import { runGa4RealtimeReport } from "./client";

export async function getLiveVisitorCount(): Promise<number> {
  const rows = await runGa4RealtimeReport({ metrics: ["activeUsers"] });
  return rows[0]?.metricValues[0] ?? 0;
}
