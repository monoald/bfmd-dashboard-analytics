"use client";

import { useEffect, useState } from "react";
import { fetchLiveVisitorCount } from "@/lib/analytics/actions";
import { CARD_CLASS, KPI_VALUE_CLASS, LABEL_CLASS } from "./theme";

const POLL_INTERVAL_MS = 15_000;

export interface LiveVisitorsTileProps {
  initialCount: number;
}

export function LiveVisitorsTile({ initialCount }: LiveVisitorsTileProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveVisitorCount()
        .then(setCount)
        .catch(() => {
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={CARD_CLASS}>
      <p className={LABEL_CLASS}>Visitors right now</p>
      <p className={KPI_VALUE_CLASS}>{count.toLocaleString()}</p>
    </div>
  );
}
