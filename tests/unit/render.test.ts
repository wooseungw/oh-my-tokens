import { describe, expect, it } from 'vitest';
import { BAR_WIDTH, buildBar, buildProviderSectionHeader, formatUsageLine, SECTION_RULE } from '../../src/ui/render';

describe('buildBar', () => {
  it('fills 8 of 16 at 50% (default width)', () => {
    expect(buildBar(50)).toBe('████████░░░░░░░░');
  });
  it('fills 4 of 8 at 50% (width=8)', () => {
    expect(buildBar(50, 8)).toBe('████░░░░');
  });
  it('clamps at 0%', () => {
    expect(buildBar(-10)).toBe('░'.repeat(BAR_WIDTH));
  });
  it('clamps at 100%', () => {
    expect(buildBar(110)).toBe('█'.repeat(BAR_WIDTH));
  });
});

describe('buildProviderSectionHeader', () => {
  it('includes name in header', () => {
    expect(buildProviderSectionHeader('anthropic')).toContain('anthropic');
  });
  it('includes tokLabel when provided', () => {
    expect(buildProviderSectionHeader('openai', '1.2M')).toContain('1.2M');
  });
});

describe('SECTION_RULE', () => {
  it('exists and is a non-empty string', () => {
    expect(typeof SECTION_RULE).toBe('string');
    expect(SECTION_RULE.length).toBeGreaterThan(0);
  });
});
