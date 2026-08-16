import { describe, expect, it } from 'vitest';
import { formatTime, matchesSearch, normalizeSearch } from '@/shared/format';

describe('Arabic search', () => {
  it('normalizes Arabic alef variants and diacritics', () => {
    expect(normalizeSearch('أَحْمَد')).toBe('احمد');
    expect(matchesSearch('احمد', 'أحمد محمد')).toBe(true);
  });

  it('matches any part of the customer phone number', () => {
    expect(matchesSearch('0002', 'سارة أحمد', '50000002')).toBe(true);
  });

  it('parses legacy Laravel timestamps safely for Safari-compatible display', () => {
    expect(formatTime('2026-08-14 17:44')).not.toBe('—');
  });
});
