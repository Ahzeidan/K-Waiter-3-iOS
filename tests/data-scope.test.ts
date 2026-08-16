import { describe, expect, it } from 'vitest';
import { belongsToActiveScope, getActiveDataScope, scopedKey, setActiveDataScope } from '@/app/services/data-scope';
import { createEmptyDraft } from '@/app/stores/order';

describe('local data isolation', () => {
  it('separates drafts, receipts and queues by business, location and user', () => {
    setActiveDataScope({ id: 7, businessId: 5, locationId: 2 });
    const firstScope = getActiveDataScope();
    const firstDraft = createEmptyDraft();
    const firstKey = scopedKey('menu');

    setActiveDataScope({ id: 8, businessId: 5, locationId: 2 });
    expect(getActiveDataScope()).not.toBe(firstScope);
    expect(scopedKey('menu')).not.toBe(firstKey);
    expect(belongsToActiveScope(firstDraft)).toBe(false);
    setActiveDataScope(null);
  });
});
