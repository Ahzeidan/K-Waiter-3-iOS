import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { localDatabase } from '@/app/services/local-database';
import { scopedKey, belongsToActiveScope, getActiveDataScope } from '@/app/services/data-scope';
import { waiterApi } from '@/app/services/waiter-api';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { applyLocalTableState } from '@/features/tables/table-state';
import type { OrderDraft, RestaurantTable, SyncOperation } from '@/shared/domain';

interface TableCacheSnapshot {
  tables: RestaurantTable[];
  savedAt: number;
}

export const useTablesStore = defineStore('tables', () => {
  const connectivity = useConnectivityStore();
  const serverTables = ref<RestaurantTable[]>([]);
  const localDrafts = ref<OrderDraft[]>([]);
  const localOperations = ref<SyncOperation[]>([]);
  const loading = ref(false);
  const ready = ref(false);
  const stale = ref(false);
  const cachedAt = ref<number | null>(null);
  const error = ref('');
  const activeScope = ref('');
  let refreshPromise: Promise<void> | null = null;
  let eventsBound = false;

  const tables = computed(() => applyLocalTableState(serverTables.value, localDrafts.value, localOperations.value));

  function ensureScope(): void {
    const scope = getActiveDataScope();
    if (activeScope.value === scope) return;
    activeScope.value = scope;
    serverTables.value = [];
    localDrafts.value = [];
    localOperations.value = [];
    ready.value = false;
    stale.value = false;
    cachedAt.value = null;
    error.value = '';
  }

  async function reloadLocal(): Promise<void> {
    ensureScope();
    const [drafts, operations] = await Promise.all([
      localDatabase.list<OrderDraft>('drafts'),
      localDatabase.list<SyncOperation>('syncQueue'),
    ]);
    localDrafts.value = drafts.filter(belongsToActiveScope);
    localOperations.value = operations.filter(belongsToActiveScope);
  }

  function bindEvents(): void {
    if (eventsBound) return;
    eventsBound = true;
    const localChange = (): void => { void reloadLocal(); };
    const syncedChange = (): void => {
      void reloadLocal();
      if (connectivity.online) void refresh(true);
    };
    window.addEventListener('kwaiter:table-local-change', localChange);
    window.addEventListener('kwaiter:order-synced', syncedChange);
    window.addEventListener('kwaiter:payment-synced', syncedChange);
    window.addEventListener('kwaiter:order-reloaded', localChange);
  }

  async function hydrate(): Promise<void> {
    ensureScope();
    bindEvents();
    const cached = await localDatabase.cachePeek<TableCacheSnapshot>(scopedKey('tables'));
    if (cached?.value.tables?.length) {
      serverTables.value = cached.value.tables;
      cachedAt.value = cached.value.savedAt || cached.savedAt;
      stale.value = true;
    }
    await reloadLocal();
    ready.value = true;
  }

  async function refresh(force = false): Promise<void> {
    ensureScope();
    if (!ready.value) await hydrate();
    if (!connectivity.online) {
      stale.value = serverTables.value.length > 0;
      return;
    }
    if (refreshPromise && !force) return refreshPromise;
    if (refreshPromise) return refreshPromise;

    loading.value = serverTables.value.length === 0;
    error.value = '';
    refreshPromise = (async () => {
      try {
        const next = await waiterApi.tables();
        const savedAt = Date.now();
        serverTables.value = next;
        cachedAt.value = savedAt;
        stale.value = false;
        await localDatabase.cachePut(scopedKey('tables'), { tables: next, savedAt } satisfies TableCacheSnapshot);
        await reloadLocal();
      } catch (reason) {
        stale.value = serverTables.value.length > 0;
        if (!serverTables.value.length) error.value = reason instanceof Error ? reason.message : 'تعذر تحميل الطاولات';
      } finally {
        loading.value = false;
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function load(): Promise<void> {
    ensureScope();
    if (!ready.value) await hydrate();
    else await reloadLocal();
    if (connectivity.online) await refresh();
  }

  function reset(): void {
    activeScope.value = '';
    ensureScope();
  }

  return { tables, loading, ready, stale, cachedAt, error, load, refresh, reloadLocal, reset };
});
