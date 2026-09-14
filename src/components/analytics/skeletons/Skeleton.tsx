import type { CSSProperties } from "react";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-(--analytics-border) ${className}`}
      style={style}
    />
  );
}
