"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";

interface RangeTransitionValue {
  startTransition: TransitionStartFunction;
  isPending: boolean;
}

const RangeTransitionContext = createContext<RangeTransitionValue | null>(
  null,
);

// DashboardDateFilter/CustomDateRangePicker call this to wrap their
// router.push in a transition, so RangeTransitionSwap below (rendered
// elsewhere in the tree) knows a range change is in flight. Plain
// router.push on an already-rendered page leaves the stale data on screen
// until the new RSC payload resolves — React doesn't show a Suspense
// fallback for content that's already been revealed during a transition
// update — so useTransition's isPending is what drives the loading UI here.
export function useRangeTransition(): RangeTransitionValue {
  const ctx = useContext(RangeTransitionContext);
  if (!ctx) {
    throw new Error(
      "useRangeTransition must be used within a RangeTransitionProvider",
    );
  }
  return ctx;
}

export function RangeTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <RangeTransitionContext.Provider value={{ startTransition, isPending }}>
      {children}
    </RangeTransitionContext.Provider>
  );
}

export function RangeTransitionSwap({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const { isPending } = useRangeTransition();
  return <>{isPending ? fallback : children}</>;
}
