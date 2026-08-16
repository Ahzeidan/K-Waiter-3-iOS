import { describe, expect, it } from 'vitest';
import { createEmptyDraft } from '@/app/stores/order';
import { applyLocalTableState, normalizeRestaurantTable } from '@/features/tables/table-state';
import type { RestaurantTable, SyncOperation } from '@/shared/domain';

const baseTables: RestaurantTable[] = [
  { id: 1, name: 'T1', status: 'available' },
  { id: 2, name: 'T2', status: 'occupied', orderId: 20 },
];

function operation(kind: SyncOperation['kind'], aggregateId: string, payload: unknown, status: SyncOperation['status'] = 'pending'): SyncOperation {
  return {
    scope: 'anonymous', id: `${kind}-${aggregateId}`, kind, aggregateId, idempotencyKey: 'key',
    revision: 1, payload, status, attempts: 0, nextAttemptAt: 0, createdAt: Date.now(),
  };
}

describe('table offline state', () => {
  it('keeps waiter calls separate from the occupied state', () => {
    const table = normalizeRestaurantTable({ id: 3, name: 'T3', status: 'needs_service', orderId: 30 });
    expect(table.status).toBe('occupied');
    expect(table.hasCall).toBe(true);
  });

  it('preserves the pending-confirmation state', () => {
    expect(normalizeRestaurantTable({ id: 7, name: 'T7', status: 'to_confirm', orderId: 70 }).status)
      .toBe('pending_confirmation');
  });

  it('marks a locally queued dine-in order as occupied', () => {
    const draft = createEmptyDraft('dine_in');
    draft.tableId = 1;
    draft.lines = [{ localId: 'line', productId: 1, name: 'قهوة', quantity: 1, unitPrice: 1, choices: [], note: '' }];
    draft.syncState = 'pending';
    const result = applyLocalTableState(baseTables, [draft], [operation('order.create', draft.localId, draft)]);
    expect(result[0]).toMatchObject({ status: 'occupied', localOrderId: draft.localId, localSyncState: 'pending' });
  });

  it('releases a table locally after an offline payment while keeping the sync badge', () => {
    const draft = createEmptyDraft('dine_in');
    draft.tableId = 2;
    draft.serverId = 20;
    draft.lines = [{ localId: 'line', productId: 1, name: 'قهوة', quantity: 1, unitPrice: 1, choices: [], note: '' }];
    const result = applyLocalTableState(baseTables, [draft], [
      operation('order.update', draft.localId, draft),
      operation('payment.create', draft.localId, { localOrderId: draft.localId }),
    ]);
    expect(result[1]).toMatchObject({ status: 'available', orderId: null, localSyncState: 'pending' });
  });
});
