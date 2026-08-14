import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (client) return client;

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GA4 environment variables (GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)",
    );
  }

  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  });
  return client;
}

export interface Ga4ReportRow {
  dimensionValues: string[];
  metricValues: number[];
}

export interface Ga4ReportParams {
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  dimensionFilter?: {
    fieldName: string;
    value: string;
  };
}

export async function runGa4Report(
  params: Ga4ReportParams,
): Promise<Ga4ReportRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("Missing GA4 environment variable GA4_PROPERTY_ID");
  }

  const [response] = await getClient().runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions: params.dimensions.map((name) => ({ name })),
    metrics: params.metrics.map((name) => ({ name })),
    dimensionFilter: params.dimensionFilter
      ? {
          filter: {
            fieldName: params.dimensionFilter.fieldName,
            stringFilter: { value: params.dimensionFilter.value },
          },
        }
      : undefined,
  });

  return (response.rows ?? []).map((row) => ({
    dimensionValues: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metricValues: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
}

export interface Ga4RealtimeReportParams {
  metrics: string[];
}

export async function runGa4RealtimeReport(
  params: Ga4RealtimeReportParams,
): Promise<Ga4ReportRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("Missing GA4 environment variable GA4_PROPERTY_ID");
  }

  const [response] = await getClient().runRealtimeReport({
    property: `properties/${propertyId}`,
    metrics: params.metrics.map((name) => ({ name })),
  });

  return (response.rows ?? []).map((row) => ({
    dimensionValues: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metricValues: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
}

export function resetGa4ClientForTests(): void {
  client = null;
}
