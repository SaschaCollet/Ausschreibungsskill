import { describe, it, expect } from 'vitest';
import { applyHardFilters } from './index.js';
import type { RawNotice } from '../fetcher/types.js';

function makeNotice(overrides: Partial<RawNotice> = {}): RawNotice {
  return {
    ND: 'test-001',
    'notice-type': 'cn-standard',
    ...overrides,
  };
}

const futureDeadline = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
const pastDeadline = new Date(Date.now() - 1 * 86400 * 1000).toISOString();

describe('applyHardFilters — notice type', () => {
  it('keeps cn-standard notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'cn-standard', 'deadline-receipt-tender-date-lot': [futureDeadline] })]);
    expect(kept).toHaveLength(1);
  });

  it('keeps cn-social notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'cn-social', 'deadline-receipt-tender-date-lot': [futureDeadline] })]);
    expect(kept).toHaveLength(1);
  });

  it('keeps cn-desg notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'cn-desg', 'deadline-receipt-tender-date-lot': [futureDeadline] })]);
    expect(kept).toHaveLength(1);
  });

  it('drops can-standard (contract award) notices', () => {
    const { kept, dropped } = applyHardFilters([makeNotice({ 'notice-type': 'can-standard' })]);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toContain('can-standard');
  });

  it('drops can-social notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'can-social' })]);
    expect(kept).toHaveLength(0);
  });

  it('drops pin-standard (prior info) notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'pin-standard' })]);
    expect(kept).toHaveLength(0);
  });

  it('drops corr (corrigendum) notices', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': 'corr' })]);
    expect(kept).toHaveLength(0);
  });

  it('drops notices with unknown/missing notice-type', () => {
    const { kept } = applyHardFilters([makeNotice({ 'notice-type': undefined })]);
    expect(kept).toHaveLength(0);
  });
});

describe('applyHardFilters — deadline', () => {
  it('drops cn-standard with expired deadline (D-05)', () => {
    const { kept, dropped } = applyHardFilters([
      makeNotice({ 'notice-type': 'cn-standard', 'deadline-receipt-tender-date-lot': [pastDeadline] })
    ]);
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toContain('deadline');
  });

  it('keeps cn-standard with future deadline', () => {
    const { kept } = applyHardFilters([
      makeNotice({ 'notice-type': 'cn-standard', 'deadline-receipt-tender-date-lot': [futureDeadline] })
    ]);
    expect(kept).toHaveLength(1);
  });

  it('keeps cn-standard with no deadline field (no silent drop)', () => {
    const { kept } = applyHardFilters([
      makeNotice({ 'notice-type': 'cn-standard' })
    ]);
    expect(kept).toHaveLength(1);
  });

  it('keeps cn-standard with empty deadline array (no silent drop)', () => {
    const { kept } = applyHardFilters([
      makeNotice({ 'notice-type': 'cn-standard', 'deadline-receipt-tender-date-lot': [] })
    ]);
    expect(kept).toHaveLength(1);
  });
});

describe('applyHardFilters — mixed batch', () => {
  it('correctly partitions a mixed batch', () => {
    const notices: RawNotice[] = [
      makeNotice({ ND: 'a', 'notice-type': 'cn-standard', 'deadline-receipt-tender-date-lot': [futureDeadline] }),
      makeNotice({ ND: 'b', 'notice-type': 'can-standard' }),
      makeNotice({ ND: 'c', 'notice-type': 'cn-social', 'deadline-receipt-tender-date-lot': [pastDeadline] }),
    ];
    const { kept, dropped } = applyHardFilters(notices);
    expect(kept).toHaveLength(1);
    expect(kept[0].ND).toBe('a');
    expect(dropped).toHaveLength(2);
  });
});
