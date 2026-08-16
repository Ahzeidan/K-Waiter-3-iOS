import { localDatabase } from '@/app/services/local-database';
import { createIdempotencyKey } from '@/shared/ids';
import { scopedKey } from '@/app/services/data-scope';

type OperationKind = 'payment' | 'print';
interface PendingOperationKey { key: string; createdAt: number }

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const storageKey = (kind: OperationKind, aggregateId: number) => scopedKey(`operation-key:${kind}:${aggregateId}`);

async function get(kind: OperationKind, aggregateId: number): Promise<string> {
  const name = storageKey(kind, aggregateId);
  const saved = await localDatabase.get<PendingOperationKey>('keyvalue', name);
  if (saved && Date.now() - saved.createdAt < MAX_AGE_MS) return saved.key;
  const key = createIdempotencyKey(kind, aggregateId);
  await localDatabase.put('keyvalue', name, { key, createdAt: Date.now() } satisfies PendingOperationKey);
  return key;
}

async function complete(kind: OperationKind, aggregateId: number): Promise<void> {
  await localDatabase.delete('keyvalue', storageKey(kind, aggregateId));
}

export const operationKeys = { get, complete };
