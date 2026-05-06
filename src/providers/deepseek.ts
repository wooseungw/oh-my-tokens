import type { ProviderQuota } from "../enrichment/providers";

const BALANCE_ENDPOINT = "https://api.deepseek.com/user/balance";

interface DeepSeekBalanceResponse {
  is_available?: boolean;
  balance_infos?: Array<{
    currency?: string;
    total_balance?: string;
    granted_balance?: string;
    topped_up_balance?: string;
  }>;
}

function parseCurrency(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function fetchDeepSeekQuota(authToken: string): Promise<ProviderQuota | null> {
  if (!authToken || authToken.length === 0) return null;

  try {
    const response = await fetch(BALANCE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as DeepSeekBalanceResponse;
    const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
    if (infos.length === 0) return null;

    const usd = infos.find((info) => info.currency === "USD") ?? infos[0];
    if (usd === undefined) return null;
    const total = parseCurrency(usd.total_balance) ?? 0;
    const granted = parseCurrency(usd.granted_balance) ?? 0;
    const toppedUp = parseCurrency(usd.topped_up_balance) ?? 0;
    const cap = granted + toppedUp;
    const remaining = total;

    if (cap <= 0) return null;

    const used = Math.max(0, cap - remaining);
    const percentRemaining = Math.max(0, Math.min(100, (remaining / cap) * 100));

    return {
      provider: "deepseek",
      used,
      limit: cap,
      unit: "credits",
      windows: {
        weekly: { percentRemaining },
      },
    };
  } catch {
    return null;
  }
}
