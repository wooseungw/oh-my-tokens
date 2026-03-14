import { describe, expect, it } from 'vitest';
import { computeTotalTokens } from '../../src/analytics/token-math';

describe('computeTotalTokens', () => {
  it('sums inp + out + think + cache_r + cache_w', () => {
    expect(computeTotalTokens({ inp: 100, out: 200, think: 50, chat: 0, code: 0, cache_r: 30, cache_w: 20 })).toBe(400);
  });
  it('excludes chat and code from total', () => {
    expect(computeTotalTokens({ inp: 0, out: 0, think: 0, chat: 999, code: 888, cache_r: 0, cache_w: 0 })).toBe(0);
  });
  it('handles all zeros', () => {
    expect(computeTotalTokens({ inp: 0, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 })).toBe(0);
  });
});
