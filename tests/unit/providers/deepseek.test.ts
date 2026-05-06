import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDeepSeekQuota } from "../../../src/providers/deepseek";

describe("fetchDeepSeekQuota", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns null when authToken is empty", async () => {
    const result = await fetchDeepSeekQuota("");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a credits quota when the balance endpoint responds", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "USD",
              total_balance: "6.30",
              granted_balance: "10.00",
              topped_up_balance: "0.00",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchDeepSeekQuota("ds-live");
    expect(result).not.toBeNull();
    expect(result?.provider).toBe("deepseek");
    expect(result?.unit).toBe("credits");
    expect(result?.limit).toBeCloseTo(10, 9);
    expect(result?.used).toBeCloseTo(3.7, 9);
    expect(result?.windows?.weekly?.percentRemaining).toBeCloseTo(63, 1);
  });

  it("returns null on non-OK response", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401 }));
    expect(await fetchDeepSeekQuota("bad")).toBeNull();
  });

  it("returns null when balance_infos is empty", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ balance_infos: [] }), { status: 200 }),
    );
    expect(await fetchDeepSeekQuota("ok")).toBeNull();
  });
});
