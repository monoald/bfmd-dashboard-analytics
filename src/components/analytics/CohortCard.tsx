import Link from "next/link";
import { getCustomerCohortAnalysisCard } from "@/lib/analytics/actions";
import { CardError } from "./CardError";
import { CustomerCohortTable } from "./CustomerCohortTable";

export interface CohortCardProps {
  variant: "preview" | "full";
  // Only used (and required) for variant "preview", to link to the full
  // report while preserving the current date-range query string. Cohort
  // analysis itself doesn't depend on the range, but the link target does.
  rangeQuery?: string;
}

export async function CohortCard({ variant, rangeQuery }: CohortCardProps) {
  const result = await getCustomerCohortAnalysisCard();

  if (result instanceof Error) {
    return (
      <CardError title="Customer cohort analysis" message={result.message} />
    );
  }

  const table = <CustomerCohortTable rows={result} variant={variant} />;

  if (variant === "preview") {
    return (
      <Link
        href={`/reports/customer-cohort-analysis?${rangeQuery}`}
        className="block"
      >
        {table}
      </Link>
    );
  }

  return table;
}
