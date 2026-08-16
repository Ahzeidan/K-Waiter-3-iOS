<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { waiterApi } from '@/app/services/waiter-api';
import { useOrderStore } from '@/app/stores/order';
import { useTablesStore } from '@/app/stores/tables';
import { TABLE_STATUS_LABELS } from '@/features/tables/table-state';
import AppIcon from '@/components/AppIcon.vue';
import type { Customer, CustomerAddress, PickupWaiter } from '@/shared/domain';

const props = defineProps<{ customer: Customer | null; address: CustomerAddress | null }>();
const emit = defineEmits<{ customer: [] }>();
const order = useOrderStore();
const tableStore = useTablesStore();
const editorOpen = ref(false);
const tables = computed(() => tableStore.tables);
const waiters = ref<PickupWaiter[]>([]);
const loading = ref(false);

const table = computed(() => tables.value.find(item => item.id === order.draft.tableId) ?? null);
const pickupWaiter = computed(() => waiters.value.find(item => item.id === order.draft.pickupWaiterId) ?? null);
const primary = computed(() => {
  if (order.draft.type === 'dine_in') return table.value?.name || 'اختر الطاولة';
  if (order.draft.type === 'delivery' || order.draft.type === 'pickup') return props.customer?.name || 'اختر العميل';
  return '';
});
const primaryDetail = computed(() => {
  if (order.draft.type === 'dine_in') return table.value ? `${order.draft.guests} ضيوف` : 'مطلوب قبل الحفظ';
  return props.customer?.mobile || 'ابحث بالاسم أو الهاتف';
});
const secondary = computed(() => {
  if (order.draft.type === 'delivery') return props.address?.label || 'اختر عنوان التوصيل';
  if (order.draft.type === 'pickup') return pickupWaiter.value?.name || 'اختر مسؤول الاستلام';
  if (order.draft.type === 'dine_in') return table.value ? 'الطاولة مختارة' : 'عرض الطاولات';
  return '';
});
const secondaryDetail = computed(() => {
  if (order.draft.type === 'delivery') {
    if (!props.address) return 'مطلوب قبل الحفظ';
    return [props.address.area, props.address.block ? `قطعة ${props.address.block}` : ''].filter(Boolean).join('، ');
  }
  if (order.draft.type === 'pickup') return pickupWaiter.value ? 'مسؤول الطلب' : 'مطلوب قبل الحفظ';
  if (order.draft.type === 'dine_in') return table.value ? TABLE_STATUS_LABELS[table.value.status] : '';
  return '';
});
const primaryIcon = computed(() => order.draft.type === 'dine_in' ? 'tables' : 'user');
const secondaryIcon = computed(() => order.draft.type === 'delivery' ? 'pin' : order.draft.type === 'pickup' ? 'pickup' : 'dine-in');

watch(() => order.draft.type, () => { editorOpen.value = false; });

onMounted(async () => {
  loading.value = true;
  await Promise.allSettled([
    tableStore.load(),
    waiterApi.pickupWaiters().then(value => { waiters.value = value; }),
  ]);
  loading.value = false;
});

function openEditor(): void {
  if (order.draft.type === 'delivery') { emit('customer'); return; }
  editorOpen.value = true;
}
function openCustomerPicker(): void {
  editorOpen.value = false;
  emit('customer');
}
function setTable(value: string): void { order.setContext({ tableId: Number(value) || null }); }
function setWaiter(value: string): void { order.setContext({ pickupWaiterId: Number(value) || null }); }
function tableDisabled(tableId: number): boolean {
  const item = tables.value.find(table => table.id === tableId);
  if (!item || item.status === 'available') return false;
  return item.localOrderId !== order.draft.localId && item.orderId !== order.draft.serverId;
}
</script>

<template>
  <section v-if="order.draft.type !== 'takeaway'" class="order-context compact-order-context" :class="{ complete: order.contextComplete }">
    <button class="context-summary" :aria-label="`تعديل بيانات الطلب: ${primary}، ${secondary}`" @click="openEditor">
      <span class="context-fact"><AppIcon :name="primaryIcon" :size="19" /><span><strong>{{ primary }}</strong><small>{{ primaryDetail }}</small></span></span>
      <span class="context-divider"></span>
      <span class="context-fact"><AppIcon :name="secondaryIcon" :size="19" /><span><strong>{{ secondary }}</strong><small>{{ secondaryDetail }}</small></span></span>
      <span class="context-edit"><AppIcon name="edit" :size="17" /><span>تعديل</span></span>
      <AppIcon name="chevron-down" :size="18" />
    </button>
  </section>

  <Teleport to="body">
    <div v-if="editorOpen" class="modal-backdrop context-sheet-backdrop" @click.self="editorOpen = false">
      <section class="context-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="context-title">
        <header class="context-editor-head"><div><h2 id="context-title">{{ order.draft.type === 'dine_in' ? 'اختيار الطاولة' : 'بيانات الاستلام' }}</h2><small>{{ order.draft.type === 'dine_in' ? 'اختر الطاولة وعدد الضيوف' : 'اختر العميل ومسؤول الاستلام' }}</small></div><button class="icon-button" aria-label="إغلاق" @click="editorOpen = false"><AppIcon name="close" /></button></header>
        <div class="context-editor-body">
          <template v-if="order.draft.type === 'dine_in'">
            <label class="field grow"><span>الطاولة *</span><select :value="order.draft.tableId || ''" @change="setTable(($event.target as HTMLSelectElement).value)"><option value="">اختر الطاولة</option><option v-for="item in tables" :key="item.id" :value="item.id" :disabled="tableDisabled(item.id)">{{ item.name }} — {{ TABLE_STATUS_LABELS[item.status] }}{{ item.localSyncState ? ' — تغيير محلي' : '' }}</option></select></label>
            <label class="field context-small"><span>عدد الضيوف</span><input :value="order.draft.guests" type="number" min="1" max="99" @change="order.setContext({ guests: Number(($event.target as HTMLInputElement).value) || 1 })" /></label>
            <small v-if="tableStore.stale" class="offline-context-note">الطاولات حسب آخر تحديث محفوظ على التابلت</small>
          </template>
          <template v-else>
            <button class="customer-context-button grow" @click="openCustomerPicker"><AppIcon name="user" :size="22" /><span class="grow"><strong>{{ customer?.name || 'بحث واختيار العميل' }}</strong><small>{{ customer?.mobile || 'بالاسم أو رقم الهاتف' }}</small></span><AppIcon name="edit" :size="18" /></button>
            <label class="field context-waiter"><span>مسؤول الاستلام *</span><select :value="order.draft.pickupWaiterId || ''" @change="setWaiter(($event.target as HTMLSelectElement).value)"><option value="">اختر المسؤول</option><option v-for="waiter in waiters" :key="waiter.id" :value="waiter.id">{{ waiter.name }}</option></select></label>
          </template>
          <small v-if="loading" class="muted">جاري تحميل الخيارات…</small>
        </div>
        <footer><button class="btn btn-primary" :disabled="!order.contextComplete" @click="editorOpen = false">تم</button></footer>
      </section>
    </div>
  </Teleport>
</template>
