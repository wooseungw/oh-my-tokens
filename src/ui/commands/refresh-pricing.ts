import { loadPricingCatalog } from "../../analytics/pricing-catalog";

export async function runRefreshPricing(): Promise<string> {
  try {
    const catalog = await loadPricingCatalog({ refresh: true });
    const providerCount = Object.keys(catalog.providers).length;
    let modelCount = 0;
    for (const provider of Object.values(catalog.providers)) {
      modelCount += Object.keys(provider.models).length;
    }
    return [
      "✓ pricing catalog refreshed",
      `  source: ${catalog.source}`,
      `  fetched_at: ${catalog.fetched_at}`,
      `  providers: ${providerCount}`,
      `  models: ${modelCount}`,
    ].join("\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `✗ pricing catalog refresh failed: ${message}`;
  }
}
