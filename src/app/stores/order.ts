import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { localDatabase } from '@/app/services/local-database';
import { waiterApi } from '@/app/services/waiter-api';
import { useSettingsStore } from '@/app/stores/settings';
import { createId, createIdempotencyKey } from '@/shared/ids';
import { plainClone } from '@/shared/clone';
import type { CartChoice, CartLine, OrderDetail, OrderDraft, OrderType, Product, SyncOperation } from '@/shared/domain';
import { belongsToActiveScope, getActiveDataScope, scopedKey } from '@/app/services/data-scope';

const SAVE_DELAY_MS = 350;

export function createEmptyDraft(type: OrderType = 'delivery'): OrderDraft {
  const localId = createId('order');
  return {
    scope: getActiveDataScope(),
    localId,
    idempotencyKey: createIdempotencyKey('order-create', localId),
    revision: 1,
    type,
    tableId: null,
    customerId: null,
    addressId: null,
    pickupWaiterId: null,
    guests: 1,
    note: '',
    lines: [],
    syncState: 'local',
    updatedAt: new Date().toISOString(),
  };
}

export function lineTotal(line: CartLine): number {
  const choices = line.choices.reduce((sum, choice) => sum + choice.price, 0);
  return (line.unitPrice + choices) * line.quantity;
}

export function choicesSignature(choices: CartChoice[]): string {
  return choices
    .map(choice => choice.clientKey
      || `${choice.kind ?? 'choice'}:${choice.groupId ?? 0}:${choice.variationId ?? choice.id}:${choice.id}`)
    .sort()
    .join(',');
}

export function switchDraftType(current: OrderDraft, type: OrderType): OrderDraft {
  if (current.type === type) return current;
  const next: OrderDraft = {
    ...current,
    type,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    syncState: current.serverId ? 'pending' : 'local',
  };
  if (type !== 'dine_in') next.tableId = null;
  if (!['delivery', 'pickup'].includes(type)) {
    next.customerId = null;
    next.addressId = null;
    delete next.customerSnapshot;
    delete next.addressSnapshot;
    next.pickupWaiterId = null;
  }
  if (type !== 'delivery') {
    next.addressId = null;
    delete next.addressSnapshot;
  }
  if (type !== 'pickup') next.pickupWaiterId = null;
  return next;
}

export const useOrderStore = defineStore('order', () => {
  const deviceSettings = useSettingsStore();
  const draft = shallowRef<OrderDraft>(createEmptyDraft());
  const hydrated = ref(false);
  const saving = ref(false);
  const submitting = ref(false);
  const error = ref('');
  const persistedAt = ref<string | null>(null);
  let saveTimer: number | null = null;
  let draftEpoch = 0;

  const activeDraftKey = () => scopedKey('active-pos-draft-id');

  function cancelScheduledSave(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  async function rememberActiveDraft(localId: string): Promise<void> {
    await localDatabase.put('keyvalue', activeDraftKey(), localId);
  }

  const itemCount = computed(() => draft.value.lines.reduce((sum, line) => sum + line.quantity, 0));
  const subtotal = computed(() => draft.value.lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const contextComplete = computed(() => {
    if (draft.value.type === 'dine_in') return Boolean(draft.value.tableId);
    if (draft.value.type === 'delivery') return Boolean(draft.value.customerId && draft.value.addressId);
    if (draft.value.type === 'pickup') return Boolean(draft.value.customerId && draft.value.pickupWaiterId);
    return true;
  });

  function touch(mutator: (next: OrderDraft) => void): void {
    const next: OrderDraft = { ...draft.value, lines: draft.value.lines.slice() };
    mutator(next);
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    next.syncState = next.serverId ? 'pending' : 'local';
    draft.value = next;
    schedulePersist();
  }

  // Deliberately synchronous: no storage serialization and no network call runs
  // inside the tap that switches an order type, even with a large cart.
  function setType(type: OrderType): void {
    if (draft.value.type === type) return;
    draft.value = switchDraftType(draft.value, type);
    schedulePersist();
  }

  function addProduct(product: Product, choices: CartChoice[] = [], quantity = 1, note = ''): void {
    if (!product.available) return;
    const signature = choicesSignature(choices);
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const existing = draft.value.lines.find(line =>
      (line.catalogProductId ?? line.productId) === product.id && !line.note && !note && choicesSignature(line.choices) === signature,
    );
    touch(next => {
      if (existing) {
        next.lines = next.lines.map(line => line.localId === existing.localId
          ? { ...line, quantity: line.quantity + safeQuantity }
          : line);
      } else {
        next.lines.push({
          localId: createId('line'),
          catalogProductId: product.id,
          productId: product.serverProductId ?? product.id,
          categoryId: product.categoryId,
          ...(product.menuItemId === undefined ? {} : { menuItemId: product.menuItemId }),
          ...(product.variationId === undefined ? {} : { variationId: product.variationId }),
          name: product.name,
          quantity: safeQuantity,
          unitPrice: product.price,
          choices: plainClone(choices),
          note,
        });
      }
    });
  }

  function changeQuantity(lineId: string, delta: number): void {
    const line = draft.value.lines.find(item => item.localId === lineId);
    if (!line || line.locked) return;
    touch(next => {
      next.lines = next.lines
        .map(item => item.localId === lineId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
        .filter(item => item.quantity > 0);
    });
  }

  function removeLine(lineId: string): void {
    touch(next => { next.lines = next.lines.filter(line => line.localId !== lineId || line.locked); });
  }

  function updateLine(lineId: string, patch: Partial<Pick<CartLine, 'note' | 'seat' | 'course' | 'choices' | 'quantity'>>): void {
    const target = draft.value.lines.find(line => line.localId === lineId);
    if (!target || target.locked) return;
    touch(next => { next.lines = next.lines.map(line => line.localId === lineId ? { ...line, ...patch } : line); });
  }

  function setContext(context: Partial<Pick<OrderDraft, 'tableId' | 'customerId' | 'addressId' | 'customerSnapshot' | 'addressSnapshot' | 'pickupWaiterId' | 'guests' | 'note'>>): void {
    touch(next => Object.assign(next, context));
  }

  function schedulePersist(): void {
    if (!deviceSettings.settings.pos.autosaveDraft) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { void persist(); }, SAVE_DELAY_MS);
  }

  async function persist(): Promise<void> {
    cancelScheduledSave();
    saving.value = true;
    const epoch = draftEpoch;
    const snapshot = plainClone(draft.value);
    try {
      await localDatabase.put('drafts', snapshot.localId, snapshot);
      if (epoch !== draftEpoch) {
        // A completed order must never be written back by an older autosave
        // that happened to finish after the cart was reset.
        await localDatabase.delete('drafts', snapshot.localId);
        return;
      }
      await rememberActiveDraft(snapshot.localId);
      persistedAt.value = new Date().toISOString();
    }
    finally { saving.value = false; }
  }

  async function hydrate(): Promise<void> {
    const activeId = await localDatabase.get<string>('keyvalue', activeDraftKey());
    if (activeId) {
      const active = await localDatabase.get<OrderDraft>('drafts', activeId);
      if (active && belongsToActiveScope(active)) {
        draftEpoch += 1;
        draft.value = active;
      }
      // If an active pointer exists but its draft was already completed, keep
      // the fresh empty draft. Never revive an unrelated older basket.
      hydrated.value = true;
      return;
    }
    const drafts = (await localDatabase.list<OrderDraft>('drafts')).filter(belongsToActiveScope);
    const current = drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (current) {
      draftEpoch += 1;
      draft.value = current;
      await rememberActiveDraft(current.localId);
    }
    hydrated.value = true;
  }

  async function loadLocalDraft(localId: string): Promise<boolean> {
    const saved = await localDatabase.get<OrderDraft>('drafts', localId);
    if (!saved || !belongsToActiveScope(saved)) return false;
    draftEpoch += 1;
    draft.value = saved;
    await rememberActiveDraft(saved.localId);
    hydrated.value = true;
    return true;
  }

  async function loadServerOrder(orderId: number): Promise<OrderDetail> {
    const detail = await waiterApi.order(orderId);
    draftEpoch += 1;
    draft.value = {
      scope: getActiveDataScope(),
      localId: createId(`order-${detail.id}`),
      serverId: detail.id,
      idempotencyKey: createIdempotencyKey('order-update', detail.id),
      revision: 1,
      type: detail.type,
      tableId: detail.tableId,
      customerId: detail.customerId,
      addressId: detail.addressId,
      ...(detail.customer ? { customerSnapshot: detail.customer } : {}),
      ...(detail.address ? { addressSnapshot: detail.address } : {}),
      pickupWaiterId: detail.pickupWaiterId,
      guests: 1,
      note: detail.note,
      lines: detail.lines,
      syncState: 'synced',
      updatedAt: new Date().toISOString(),
      serverUpdatedAt: detail.serverUpdatedAt,
    };
    await persist();
    return detail;
  }

  function validationMessage(): string {
    if (!draft.value.lines.length) return 'أضف منتجًا واحدًا على الأقل';
    if (draft.value.type === 'dine_in' && !draft.value.tableId) return 'اختر الطاولة';
    if (draft.value.type === 'delivery' && !draft.value.customerId) return 'اختر العميل';
    if (draft.value.type === 'delivery' && !draft.value.addressId) return 'اختر عنوان التوصيل';
    if (draft.value.type === 'pickup' && !draft.value.customerId) return 'اختر العميل';
    if (draft.value.type === 'pickup' && !draft.value.pickupWaiterId) return 'اختر مسؤول الاستلام';
    return '';
  }

  async function queueForSync(source: OrderDraft = draft.value, fixedKey?: string): Promise<void> {
    if (!deviceSettings.settings.sync.offlineOrders) throw new Error('إنشاء الطلبات دون إنترنت متوقف من إعدادات هذا التابلت');
    const queued = await localDatabase.list<SyncOperation>('syncQueue');
    const hasSameRevision = queued.some(item => item.aggregateId === source.localId && item.revision === source.revision);
    if (hasSameRevision) return;
    const hasCreate = queued.some(item => item.aggregateId === source.localId && item.kind === 'order.create');
    const kind: SyncOperation['kind'] = source.serverId || hasCreate ? 'order.update' : 'order.create';
    const operationKey = kind === 'order.create'
      ? source.idempotencyKey
      : fixedKey ?? createIdempotencyKey('order-update', `${source.serverId ?? source.localId}-${source.revision}`);
    const operation: SyncOperation = {
      scope: getActiveDataScope(),
      id: createId('sync'),
      kind,
      aggregateId: source.localId,
      idempotencyKey: operationKey,
      revision: source.revision,
      payload: { ...plainClone(source), idempotencyKey: operationKey },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
    };
    await localDatabase.put('syncQueue', operation.id, operation);
    draft.value = { ...draft.value, syncState: 'pending' };
    await persist();
    window.dispatchEvent(new CustomEvent('kwaiter:table-local-change', { detail: { tableId: source.tableId, localId: source.localId } }));
  }

  async function submit(online: boolean): Promise<{ queued: boolean; localOrderId: string; orderId?: number; invoiceNo?: string }> {
    const validation = validationMessage();
    if (validation) throw new Error(validation);
    if (submitting.value) throw new Error('الطلب قيد الحفظ بالفعل');
    submitting.value = true;
    error.value = '';
    await persist();
    let attemptedDraft: OrderDraft = draft.value;
    try {
      if (!online) {
        await queueForSync();
        return { queued: true, localOrderId: draft.value.localId };
      }
      attemptedDraft = draft.value.serverId
        ? {
            ...draft.value,
            idempotencyKey: createIdempotencyKey('order-update', `${draft.value.serverId}-${draft.value.revision}`),
          }
        : draft.value;
      const response = attemptedDraft.serverId
        ? await waiterApi.updateOrder(attemptedDraft.serverId, attemptedDraft)
        : await waiterApi.createOrder(attemptedDraft);
      draft.value = { ...draft.value, serverId: response.id, syncState: 'synced', serverUpdatedAt: response.updatedAt };
      await persist();
      window.dispatchEvent(new CustomEvent('kwaiter:table-local-change', { detail: { tableId: draft.value.tableId, localId: draft.value.localId } }));
      const invoiceNo = 'invoiceNo' in response ? String(response.invoiceNo || '') : '';
      return {
        queued: false,
        localOrderId: draft.value.localId,
        orderId: response.id,
        ...(invoiceNo ? { invoiceNo } : {}),
      };
    } catch (reason) {
      if (reason instanceof Error && /network|اتصال|مهلة/.test(reason.message)) {
        await queueForSync(attemptedDraft, attemptedDraft.idempotencyKey);
        return { queued: true, localOrderId: attemptedDraft.localId };
      }
      error.value = reason instanceof Error ? reason.message : 'تعذر حفظ الطلب';
      throw reason;
    } finally {
      submitting.value = false;
    }
  }

  async function newOrder(type: OrderType = draft.value.type): Promise<void> {
    const oldId = draft.value.localId;
    const oldTableId = draft.value.tableId;
    cancelScheduledSave();
    draftEpoch += 1;
    const next = createEmptyDraft(type);
    draft.value = next;
    persistedAt.value = null;
    await Promise.all([
      localDatabase.put('drafts', next.localId, plainClone(next)),
      rememberActiveDraft(next.localId),
      localDatabase.delete('drafts', oldId),
    ]);
    window.dispatchEvent(new CustomEvent('kwaiter:table-local-change', { detail: { tableId: oldTableId, localId: oldId } }));
  }

  async function completeDraft(localId: string, type: OrderType): Promise<void> {
    if (draft.value.localId !== localId) {
      await localDatabase.delete('drafts', localId);
      return;
    }
    const oldTableId = draft.value.tableId;
    cancelScheduledSave();
    draftEpoch += 1;
    const next = createEmptyDraft(type);
    // Reset Pinia first so the cart disappears in the same rendered frame.
    draft.value = next;
    persistedAt.value = null;
    await Promise.all([
      localDatabase.put('drafts', next.localId, plainClone(next)),
      rememberActiveDraft(next.localId),
      localDatabase.delete('drafts', localId),
    ]);
    window.dispatchEvent(new CustomEvent('kwaiter:table-local-change', { detail: { tableId: oldTableId, localId } }));
  }

  async function completePaidDraft(localId: string, _serverId: number, type: OrderType): Promise<boolean> {
    await completeDraft(localId, type);
    return true;
  }

  window.addEventListener('pagehide', () => { void persist(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persist();
  });
  window.addEventListener('kwaiter:order-synced', event => {
    const detail = (event as CustomEvent<{
      localId: string;
      serverId: number;
      serverUpdatedAt: string;
      syncState?: OrderDraft['syncState'];
    }>).detail;
    if (!detail || detail.localId !== draft.value.localId) return;
    draft.value = {
      ...draft.value,
      serverId: detail.serverId,
      serverUpdatedAt: detail.serverUpdatedAt,
      syncState: detail.syncState ?? 'synced',
    };
  });
  window.addEventListener('kwaiter:order-reloaded', event => {
    const localId = (event as CustomEvent<{ localId: string }>).detail?.localId;
    if (localId === draft.value.localId) void hydrate();
  });

  return {
    draft, hydrated, saving, submitting, error, persistedAt, itemCount, subtotal, contextComplete,
    setType, addProduct, changeQuantity, removeLine, updateLine, setContext,
    persist, hydrate, loadLocalDraft, loadServerOrder, validationMessage, submit, newOrder, completeDraft, completePaidDraft,
  };
});
