import { describe, expect, it } from 'vitest';
import { createEmptyDraft } from '@/app/stores/order';
import { routedCategories } from '@/app/services/kot-routing';
import type { KotRoutingSnapshot } from '@/shared/domain';

const routing: KotRoutingSnapshot = {
  version: 'test',
  routes: [
    { id: 1, name: 'المشروبات', orderType: 'all', printScope: 'categories', categoryIds: [2], copies: 1, sortOrder: 1, printer: { id: 11, name: 'بار', ipAddress: '192.168.1.20', port: 9100, paperWidth: 80 } },
    { id: 2, name: 'المطبخ', orderType: 'all', printScope: 'categories', categoryIds: [3], copies: 1, sortOrder: 2, printer: { id: 12, name: 'مطبخ', ipAddress: '192.168.1.21', port: 9100, paperWidth: 80 } },
  ],
};

describe('offline KOT routing', () => {
  it('routes each cart line to the printer assigned to its category', () => {
    const draft = createEmptyDraft('takeaway');
    draft.lines = [
      { localId: 'drink', productId: 1, categoryId: 2, name: 'عصير', quantity: 1, unitPrice: 1, choices: [], note: '' },
      { localId: 'food', productId: 2, categoryId: 3, name: 'برجر', quantity: 1, unitPrice: 2, choices: [], note: '' },
    ];
    expect(routedCategories(draft, routing)).toEqual(new Map([[11, ['عصير']], [12, ['برجر']]]));
  });

  it('does not apply a route restricted to another order type', () => {
    const draft = createEmptyDraft('delivery');
    draft.lines = [{ localId: 'drink', productId: 1, categoryId: 2, name: 'عصير', quantity: 1, unitPrice: 1, choices: [], note: '' }];
    const restricted: KotRoutingSnapshot = { ...routing, routes: [{ ...routing.routes[0]!, orderType: 'dine_in' }] };
    expect(routedCategories(draft, restricted).size).toBe(0);
  });
});
