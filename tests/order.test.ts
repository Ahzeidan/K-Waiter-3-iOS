import { describe, expect, it } from 'vitest';
import { choicesSignature, createEmptyDraft, lineTotal, switchDraftType } from '@/app/stores/order';
import { sameProductChoice } from '@/features/pos/choice-utils';
import type { CartLine } from '@/shared/domain';

describe('order domain', () => {
  it('calculates quantity and choices without rounding the stored values', () => {
    const line: CartLine = {
      localId: 'line-1', productId: 1, name: 'برجر', quantity: 2, unitPrice: 2.5,
      choices: [{ id: 1, name: 'جبن', price: 0.25 }], note: '',
    };
    expect(lineTotal(line)).toBe(5.5);
  });

  it('switches order type without cloning or serializing cart lines', () => {
    const draft = createEmptyDraft('delivery');
    draft.customerId = 12;
    draft.addressId = 44;
    draft.lines = Array.from({ length: 10_000 }, (_, index) => ({
      localId: `line-${index}`, productId: index, name: `P${index}`, quantity: 1,
      unitPrice: 1, choices: [], note: '',
    }));
    const beforeLines = draft.lines;
    const started = performance.now();
    const next = switchDraftType(draft, 'pickup');
    const elapsed = performance.now() - started;
    expect(next.lines).toBe(beforeLines);
    expect(next.customerId).toBe(12);
    expect(next.addressId).toBeNull();
    expect(next.type).toBe('pickup');
    expect(elapsed).toBeLessThan(100);
  });

  it('clears customer context when switching to takeaway', () => {
    const draft = {
      ...createEmptyDraft('pickup'),
      customerId: 1,
      pickupWaiterId: 2,
      customerSnapshot: { id: 1, name: 'عميل', mobile: '50000000' },
    };
    const next = switchDraftType(draft, 'takeaway');
    expect(next.customerId).toBeNull();
    expect(next.pickupWaiterId).toBeNull();
    expect(next.customerSnapshot).toBeUndefined();
  });

  it('does not confuse equal choice ids from different groups', () => {
    const first = { id: 1, name: 'صغير', price: 0, kind: 'option' as const, groupId: 10 };
    const second = { id: 1, name: 'بدون بصل', price: 0, kind: 'option' as const, groupId: 20 };
    expect(choicesSignature([first])).not.toBe(choicesSignature([second]));
  });

  it('matches saved modifier and combo choices even when old orders omit client group ids', () => {
    expect(sameProductChoice(
      { id: 2101, variationId: 2101, name: 'جبن', price: 0, kind: 'modifier' },
      { id: 2101, variationId: 2101, name: 'جبن', price: 0.25, kind: 'modifier', groupId: 21 },
    )).toBe(true);
    expect(sameProductChoice(
      { id: 3101, variationId: 3101, name: 'سفن أب', price: 0, kind: 'combo', groupName: 'مشروب' },
      { id: 3101, variationId: 3101, name: 'سفن أب', price: 0, kind: 'combo', groupName: 'مشروب' },
    )).toBe(true);
    expect(sameProductChoice(
      { id: 3101, variationId: 3101, name: 'سفن أب', price: 0, kind: 'combo', groupName: 'مشروب' },
      { id: 3101, variationId: 3101, name: 'سفن أب', price: 0, kind: 'combo', groupName: 'جانبي' },
    )).toBe(false);
  });
});
