import type { ProviderQuota } from "../enrichment/providers";

let _liveQuotas: Map<string, ProviderQuota> = new Map();

export function setLiveQuotas(quotas: ProviderQuota[]): void {
  _liveQuotas = new Map(quotas.map((q) => [q.provider, q]));
}

export function getLiveQuota(provider: string): ProviderQuota | undefined {
  return _liveQuotas.get(provider);
}

export function getLiveProviders(): string[] {
  return Array.from(_liveQuotas.keys());
}

export function clearLiveQuotas(): void {
  _liveQuotas.clear();
}
