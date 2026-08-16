import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LocalPrintJob, OrderDraft, ReceiptSnapshot, SyncOperation } from '@/shared/domain';

interface KWaiterSchema extends DBSchema {
  keyvalue: { key: string; value: unknown };
  drafts: { key: string; value: OrderDraft; indexes: { 'by-updated': string } };
  syncQueue: { key: string; value: SyncOperation; indexes: { 'by-status': string; 'by-next-attempt': number } };
  cache: { key: string; value: { key: string; value: unknown; savedAt: number } };
  receipts: { key: string; value: ReceiptSnapshot };
  printJobs: { key: string; value: LocalPrintJob; indexes: { 'by-status': string; 'by-next-attempt': number } };
}

interface NativeDatabasePlugin {
  get(options: { store: string; key: string }): Promise<{ value: string | null }>;
  put(options: { store: string; key: string; value: string }): Promise<void>;
  delete(options: { store: string; key: string }): Promise<void>;
  list(options: { store: string }): Promise<{ values: string[] }>;
  clear(options: { store: string }): Promise<void>;
}

const nativeDb = registerPlugin<NativeDatabasePlugin>('KemetDatabase');
let dbPromise: Promise<IDBPDatabase<KWaiterSchema>> | null = null;
let nativeAvailabilityPromise: Promise<boolean> | null = null;
type StoreName = 'keyvalue' | 'drafts' | 'syncQueue' | 'cache' | 'receipts' | 'printJobs';

function webDb(): Promise<IDBPDatabase<KWaiterSchema>> {
  dbPromise ??= openDB<KWaiterSchema>('k-waiter-3', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('keyvalue');
        const drafts = db.createObjectStore('drafts', { keyPath: 'localId' });
        drafts.createIndex('by-updated', 'updatedAt');
        const queue = db.createObjectStore('syncQueue', { keyPath: 'id' });
        queue.createIndex('by-status', 'status');
        queue.createIndex('by-next-attempt', 'nextAttemptAt');
        db.createObjectStore('cache', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('receipts', { keyPath: 'key' });
        const printJobs = db.createObjectStore('printJobs', { keyPath: 'id' });
        printJobs.createIndex('by-status', 'status');
        printJobs.createIndex('by-next-attempt', 'nextAttemptAt');
      }
    },
  });
  return dbPromise;
}

async function nativeAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  nativeAvailabilityPromise ??= nativeDb.list({ store: 'keyvalue' })
    .then(() => true)
    .catch(() => false);
  return nativeAvailabilityPromise;
}

async function getValue<T>(store: StoreName, key: string): Promise<T | undefined> {
  if (await nativeAvailable()) {
    const value = (await nativeDb.get({ store, key })).value;
    return value ? JSON.parse(value) as T : undefined;
  }
  const db = await webDb();
  if (store === 'keyvalue') return db.get('keyvalue', key) as Promise<T | undefined>;
  if (store === 'drafts') return db.get('drafts', key) as Promise<T | undefined>;
  if (store === 'syncQueue') return db.get('syncQueue', key) as Promise<T | undefined>;
  if (store === 'cache') return db.get('cache', key) as Promise<T | undefined>;
  if (store === 'receipts') return db.get('receipts', key) as Promise<T | undefined>;
  return db.get('printJobs', key) as Promise<T | undefined>;
}

async function putValue(store: StoreName, key: string, value: unknown): Promise<void> {
  if (await nativeAvailable()) {
    await nativeDb.put({ store, key, value: JSON.stringify(value) });
    return;
  }
  const db = await webDb();
  if (store === 'keyvalue') await db.put('keyvalue', value, key);
  else if (store === 'drafts') await db.put('drafts', value as OrderDraft);
  else if (store === 'syncQueue') await db.put('syncQueue', value as SyncOperation);
  else if (store === 'cache') await db.put('cache', value as { key: string; value: unknown; savedAt: number });
  else if (store === 'receipts') await db.put('receipts', value as ReceiptSnapshot);
  else await db.put('printJobs', value as LocalPrintJob);
}

async function listValues<T>(store: StoreName): Promise<T[]> {
  if (await nativeAvailable()) {
    const values = (await nativeDb.list({ store })).values;
    return values.map(value => JSON.parse(value) as T);
  }
  const db = await webDb();
  if (store === 'keyvalue') return db.getAll('keyvalue') as Promise<T[]>;
  if (store === 'drafts') return db.getAll('drafts') as Promise<T[]>;
  if (store === 'syncQueue') return db.getAll('syncQueue') as Promise<T[]>;
  if (store === 'cache') return db.getAll('cache') as Promise<T[]>;
  if (store === 'receipts') return db.getAll('receipts') as Promise<T[]>;
  return db.getAll('printJobs') as Promise<T[]>;
}

export const localDatabase = {
  get: getValue,
  put: putValue,
  list: listValues,

  async delete(store: StoreName, key: string): Promise<void> {
    if (await nativeAvailable()) { await nativeDb.delete({ store, key }); return; }
    const db = await webDb();
    if (store === 'keyvalue') await db.delete('keyvalue', key);
    else if (store === 'drafts') await db.delete('drafts', key);
    else if (store === 'syncQueue') await db.delete('syncQueue', key);
    else if (store === 'cache') await db.delete('cache', key);
    else if (store === 'receipts') await db.delete('receipts', key);
    else await db.delete('printJobs', key);
  },

  async clear(store: StoreName): Promise<void> {
    if (await nativeAvailable()) { await nativeDb.clear({ store }); return; }
    const db = await webDb();
    if (store === 'keyvalue') await db.clear('keyvalue');
    else if (store === 'drafts') await db.clear('drafts');
    else if (store === 'syncQueue') await db.clear('syncQueue');
    else if (store === 'cache') await db.clear('cache');
    else if (store === 'receipts') await db.clear('receipts');
    else await db.clear('printJobs');
  },

  async cacheGet<T>(key: string, maxAgeMs: number): Promise<T | null> {
    const record = await getValue<{ key: string; value: T; savedAt: number }>('cache', key);
    if (!record || Date.now() - record.savedAt > maxAgeMs) return null;
    return record.value;
  },

  async cachePeek<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
    const record = await getValue<{ key: string; value: T; savedAt: number }>('cache', key);
    return record ? { value: record.value, savedAt: record.savedAt } : null;
  },

  async cachePut(key: string, value: unknown): Promise<void> {
    await putValue('cache', key, { key, value, savedAt: Date.now() });
  },
};
