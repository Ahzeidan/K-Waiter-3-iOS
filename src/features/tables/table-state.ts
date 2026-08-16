import type { OrderDraft, RestaurantTable, SyncOperation } from '@/shared/domain';

export type TableFilter = 'all' | RestaurantTable['status'] | 'has_call';

export const TABLE_STATUS_LABELS: Record<RestaurantTable['status'], string> = {
  available: 'متاحة',
  occupied: 'مشغولة',
  pending_confirmation: 'بانتظار التأكيد',
  reserved: 'محجوزة',
};

export const TABLE_STATUS_ICONS: Record<RestaurantTable['status'], string> = {
  available: 'table-top',
  occupied: 'table-top',
  pending_confirmation: 'table-top',
  reserved: 'table-top',
};

type RawRestaurantTable = Omit<RestaurantTable, 'status'> & {
  status?: string;
  has_call?: boolean;
  hasCall?: boolean;
  to_confirm?: boolean;
  reservation_at?: string | null;
};

export function normalizeRestaurantTable(input: RawRestaurantTable): RestaurantTable {
  const rawStatus = String(input.status ?? 'available');
  const hasCall = Boolean(input.hasCall ?? input.has_call ?? ['needs_service', 'has_call'].includes(rawStatus));
  let status: RestaurantTable['status'];
  if (input.to_confirm || ['to_confirm', 'pending_confirmation'].includes(rawStatus)) status = 'pending_confirmation';
  else if (rawStatus === 'reserved') status = 'reserved';
  else if (rawStatus === 'occupied' || Boolean(input.orderId)) status = 'occupied';
  else status = 'available';

  return {
    ...input,
    status,
    hasCall,
    reservationAt: input.reservationAt ?? input.reservation_at ?? null,
  };
}

interface LocalTableCandidate {
  draft: OrderDraft;
  status?: 'pending' | 'review';
  changedAt: number;
  paidLocally: boolean;
}

function draftTime(draft: OrderDraft, fallback = 0): number {
  const timestamp = Date.parse(draft.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

/**
 * Applies local dine-in drafts and queued operations over the last server
 * snapshot. This keeps one tablet internally consistent while it is offline.
 */
export function applyLocalTableState(
  serverTables: RestaurantTable[],
  drafts: OrderDraft[],
  operations: SyncOperation[],
): RestaurantTable[] {
  const paidAggregates = new Set(operations
    .filter(operation => operation.kind === 'payment.create' && operation.status !== 'review')
    .map(operation => operation.aggregateId));
  const operationByAggregate = new Map<string, SyncOperation>();
  for (const operation of operations) {
    if (!['order.create', 'order.update'].includes(operation.kind)) continue;
    const previous = operationByAggregate.get(operation.aggregateId);
    if (!previous || previous.createdAt <= operation.createdAt) operationByAggregate.set(operation.aggregateId, operation);
  }

  const candidateByAggregate = new Map<string, LocalTableCandidate>();
  for (const draft of drafts) {
    if (draft.type !== 'dine_in' || !draft.tableId || !draft.lines.length) continue;
    const queued = operationByAggregate.get(draft.localId);
    candidateByAggregate.set(draft.localId, {
      draft,
      ...(queued?.status === 'review'
        ? { status: 'review' as const }
        : queued || draft.syncState !== 'synced'
          ? { status: 'pending' as const }
          : {}),
      changedAt: Math.max(draftTime(draft), queued?.createdAt ?? 0),
      paidLocally: paidAggregates.has(draft.localId),
    });
  }
  for (const operation of operationByAggregate.values()) {
    const payload = operation.payload as OrderDraft;
    if (payload.type !== 'dine_in' || !payload.tableId || !payload.lines?.length) continue;
    const previous = candidateByAggregate.get(operation.aggregateId);
    if (previous && previous.changedAt > operation.createdAt) continue;
    candidateByAggregate.set(operation.aggregateId, {
      draft: payload,
      status: operation.status === 'review' ? 'review' : 'pending',
      changedAt: Math.max(draftTime(payload), operation.createdAt),
      paidLocally: paidAggregates.has(operation.aggregateId),
    });
  }

  const candidateByTable = new Map<number, LocalTableCandidate>();
  for (const candidate of candidateByAggregate.values()) {
    const tableId = candidate.draft.tableId;
    if (!tableId) continue;
    const previous = candidateByTable.get(tableId);
    if (!previous || previous.changedAt <= candidate.changedAt) candidateByTable.set(tableId, candidate);
  }

  return serverTables.map(table => {
    const local = candidateByTable.get(table.id);
    if (!local) return table;
    if (local.paidLocally) {
      return {
        ...table,
        status: 'available',
        orderId: null,
        ...(local.status ? { localSyncState: local.status } : {}),
      };
    }
    return {
      ...table,
      status: local.draft.serverId && table.status === 'pending_confirmation' ? 'pending_confirmation' : 'occupied',
      orderId: local.draft.serverId ?? table.orderId ?? null,
      localOrderId: local.draft.localId,
      ...(local.status ? { localSyncState: local.status } : {}),
      ...(local.draft.guests || table.guests ? { guests: local.draft.guests || table.guests } : {}),
    };
  });
}
