<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { waiterApi } from '@/app/services/waiter-api';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSettingsStore } from '@/app/stores/settings';
import { useTablesStore } from '@/app/stores/tables';
import { TABLE_STATUS_ICONS, TABLE_STATUS_LABELS, type TableFilter } from '@/features/tables/table-state';
import type { CartLine, RestaurantTable } from '@/shared/domain';
import { formatTime, money } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const settings = useSettingsStore();
const connectivity = useConnectivityStore();
const tableStore = useTablesStore();
const filter = ref<TableFilter>('all');
const action = ref<'transfer' | 'merge' | 'split' | null>(null);
const source = ref<RestaurantTable | null>(null);
const targetId = ref<number | null>(null);
const orderLines = ref<CartLine[]>([]);
const selectedLines = ref<number[]>([]);
const actionBusy = ref(false);
const error = ref('');
const message = ref('');
const selectedId = ref<number | null>(null);
let refreshTimer: number | null = null;
let lastTableTapId: number | null = null;
let lastTableTapAt = 0;

const tables = computed(() => tableStore.tables);
const offlineView = computed(() => !connectivity.online || tableStore.stale);
const displayedError = computed(() => error.value || tableStore.error);
const visible = computed(() => {
  if (filter.value === 'all') return tables.value;
  if (filter.value === 'has_call') return tables.value.filter(table => table.hasCall);
  return tables.value.filter(table => table.status === filter.value);
});
const filters = computed<Array<{ id: TableFilter; label: string; count: number }>>(() => [
  { id: 'all', label: 'الكل', count: tables.value.length },
  { id: 'available', label: 'متاحة', count: tables.value.filter(table => table.status === 'available').length },
  { id: 'occupied', label: 'مشغولة', count: tables.value.filter(table => table.status === 'occupied').length },
  { id: 'pending_confirmation', label: 'بانتظار التأكيد', count: tables.value.filter(table => table.status === 'pending_confirmation').length },
  { id: 'reserved', label: 'محجوزة', count: tables.value.filter(table => table.status === 'reserved').length },
  { id: 'has_call', label: 'نداء جارسون', count: tables.value.filter(table => table.hasCall).length },
]);
const lastUpdated = computed(() => tableStore.cachedAt
  ? new Intl.DateTimeFormat('ar-KW', { hour: '2-digit', minute: '2-digit' }).format(new Date(tableStore.cachedAt))
  : 'غير متوفر');
const selectedTable = computed(() => tables.value.find(table => table.id === selectedId.value) ?? visible.value[0] ?? null);

watch(visible, next => {
  if (!next.some(table => table.id === selectedId.value)) selectedId.value = next[0]?.id ?? null;
}, { immediate: true });

async function load(): Promise<void> {
  error.value = '';
  await tableStore.refresh(true);
}

function open(table: RestaurantTable): void {
  error.value = '';
  if (table.localOrderId) { void router.push(`/pos?localOrder=${encodeURIComponent(table.localOrderId)}`); return; }
  if (table.orderId) {
    if (!connectivity.online) {
      error.value = `تفاصيل طلب الطاولة ${table.name} غير محفوظة على هذا التابلت وتحتاج اتصالًا لفتحها`;
      return;
    }
    void router.push(`/pos?order=${table.orderId}`);
    return;
  }
  if (table.status !== 'available') {
    error.value = `الطاولة ${table.name} ${TABLE_STATUS_LABELS[table.status]} ولا يمكن بدء طلب عليها`;
    return;
  }
  void router.push(`/pos?table=${table.id}&type=dine_in`);
}

function handleTableTap(table: RestaurantTable): void {
  const now = Date.now();
  const isDoubleTap = lastTableTapId === table.id && now - lastTableTapAt <= 450;
  selectedId.value = table.id;
  lastTableTapId = isDoubleTap ? null : table.id;
  lastTableTapAt = isDoubleTap ? 0 : now;
  if (isDoubleTap) open(table);
}

const targets = computed(() => tables.value.filter(table => {
  if (!source.value || table.id === source.value.id) return false;
  return action.value === 'merge' ? Boolean(table.orderId) : table.status === 'available' && !table.localSyncState;
}));

async function openAction(nextAction: 'transfer' | 'merge' | 'split', table: RestaurantTable): Promise<void> {
  if (!connectivity.online) { error.value = 'النقل والدمج والتقسيم تحتاج اتصالًا مباشرًا بالسيرفر لتجنب تعارض الطاولات'; return; }
  action.value = nextAction; source.value = table; targetId.value = null; selectedLines.value = []; orderLines.value = [];
  if (nextAction === 'split' && table.orderId) {
    try { orderLines.value = (await waiterApi.order(table.orderId)).lines.filter(line => line.serverId); }
    catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تحميل أصناف الطلب'; action.value = null; }
  }
}

async function runAction(): Promise<void> {
  if (!action.value || !source.value || !targetId.value || !source.value.orderId) return;
  if (!connectivity.online) { error.value = 'هذه العملية تحتاج اتصالًا بالسيرفر'; return; }
  if (action.value === 'split' && !selectedLines.value.length) { error.value = 'اختر صنفًا واحدًا على الأقل للتقسيم'; return; }
  actionBusy.value = true; error.value = '';
  try {
    if (action.value === 'transfer') await waiterApi.transferTable(source.value.orderId, targetId.value);
    else if (action.value === 'merge') await waiterApi.mergeTables(source.value.id, targetId.value);
    else await waiterApi.splitTable(source.value.orderId, targetId.value, selectedLines.value);
    message.value = action.value === 'transfer' ? 'تم نقل الطلب' : action.value === 'merge' ? 'تم دمج الطاولتين' : 'تم تقسيم الطلب';
    action.value = null; await tableStore.refresh(true);
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية'; }
  finally { actionBusy.value = false; }
}

async function acknowledge(table: RestaurantTable): Promise<void> {
  if (!connectivity.online) { error.value = 'استلام نداء الجارسون يحتاج اتصالًا بالسيرفر'; return; }
  try { await waiterApi.acknowledgeTableCall(table.id); await tableStore.refresh(true); }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر استلام النداء'; }
}

function tableDetail(table: RestaurantTable): string {
  if (table.status === 'reserved' && table.reservationAt) return `الحجز ${formatTime(table.reservationAt)}`;
  if (settings.settings.tables.showTimer && (table.displayTime || table.openedAt)) return table.displayTime || `منذ ${formatTime(table.openedAt)}`;
  return '';
}

function tableStateIcon(table: RestaurantTable): string {
  if (table.hasCall) return 'bell';
  if (table.status === 'pending_confirmation') return 'clock';
  if (table.status === 'reserved') return 'calendar';
  if (table.status === 'occupied') return 'users';
  return 'check';
}

function tableActionLabel(table: RestaurantTable): string {
  if (table.hasCall) return 'استلام النداء';
  if (table.status === 'available') return 'فتح الطاولة';
  if (table.status === 'pending_confirmation') return 'مراجعة الطلب';
  if (table.status === 'reserved') return 'تفاصيل الحجز';
  return 'فتح الطلب';
}

function runPrimaryAction(table: RestaurantTable): void {
  if (table.hasCall && settings.settings.tables.showCalls) { void acknowledge(table); return; }
  open(table);
}

onMounted(() => {
  void tableStore.load();
  refreshTimer = window.setInterval(() => {
    if (!document.hidden && !action.value && connectivity.online) void tableStore.refresh();
  }, settings.settings.sync.intervalSeconds * 1000);
});
onUnmounted(() => { if (refreshTimer !== null) window.clearInterval(refreshTimer); });
</script>

<template>
  <div class="page tables-page stack">
    <div class="page-head tables-head">
      <div><h1>الطاولات</h1><p>الحالة المباشرة والنداءات والطلبات المفتوحة</p></div>
      <button class="btn btn-secondary" :disabled="tableStore.loading || !connectivity.online" @click="load"><AppIcon name="sync" :size="17" /> {{ tableStore.loading ? 'جارٍ التحديث' : 'تحديث' }}</button>
    </div>

    <div v-if="offlineView && tables.length" class="tables-offline-banner" role="status">
      <AppIcon name="wifi-off" :size="20" />
      <span><strong>أوفلاين — آخر تحديث {{ lastUpdated }}</strong><small>الحالات محفوظة على التابلت وسيتم التحقق منها عند عودة الاتصال</small></span>
    </div>

    <nav class="table-filters" aria-label="فلترة الطاولات">
      <button v-for="item in filters" :key="item.id" class="table-filter" :class="[{ active: filter === item.id }, item.id]" :aria-pressed="filter === item.id" @click="filter = item.id">
        <span>{{ item.label }}</span><b>{{ item.count }}</b>
      </button>
    </nav>
    <p class="table-interaction-hint"><AppIcon name="table-top" :size="17" /> ضغطة للتحديد · ضغطتان للفتح السريع · ويمكن استخدام الزر الواضح داخل البطاقة</p>

    <p v-if="displayedError" class="error-text table-page-message">{{ displayedError }}</p>
    <p v-if="message" class="success-text table-page-message">{{ message }}</p>
    <div v-if="tableStore.loading && !tables.length" class="empty-state">جاري تحميل الطاولات…</div>
    <div v-else-if="!tables.length" class="empty-state tables-empty">
      <AppIcon name="tables" :size="44" />
      <strong>{{ offlineView ? 'لا توجد نسخة طاولات محفوظة' : 'لا توجد طاولات متاحة لهذا الفرع' }}</strong>
      <span v-if="offlineView">افتح شاشة الطاولات مرة واحدة أثناء الاتصال لحفظها على هذا التابلت.</span>
    </div>

    <div v-else class="tables-workspace">
      <div class="tables-grid">
        <article v-for="table in visible" :key="table.id" class="table-card" :class="[table.status, { selected: selectedTable?.id === table.id, 'has-call': table.hasCall, 'local-pending': table.localSyncState === 'pending', 'local-review': table.localSyncState === 'review' }]" role="button" tabindex="0" :aria-label="`${table.name} — ${TABLE_STATUS_LABELS[table.status]} — اضغط مرتين للفتح`" :aria-pressed="selectedTable?.id === table.id" @click="handleTableTap(table)" @keydown.enter="open(table)">
          <span class="table-status-pill"><AppIcon :name="tableStateIcon(table)" :size="13" />{{ table.hasCall ? 'تطلب جارسون' : TABLE_STATUS_LABELS[table.status] }}</span>
          <span v-if="table.hasCall" class="table-call-dot"><AppIcon name="bell" :size="16" /></span>
          <div class="table-visual"><AppIcon :name="TABLE_STATUS_ICONS[table.status]" :size="74" /><i v-if="table.status === 'occupied' && !table.hasCall"></i><span v-if="table.status === 'pending_confirmation'"><AppIcon name="clock" :size="17" /></span><span v-else-if="table.status === 'reserved'"><AppIcon name="calendar" :size="17" /></span></div>
          <strong>{{ table.name }}</strong>
          <div class="table-card-facts">
            <b v-if="settings.settings.tables.showTotal && table.total !== null && table.total !== undefined">{{ money(table.total) }}</b>
            <small v-if="tableDetail(table)">{{ tableDetail(table) }}<template v-if="table.guests"> · {{ table.guests }} ضيوف</template></small>
            <small v-else-if="table.guests">{{ table.guests }} ضيوف</small>
          </div>
          <span v-if="table.localSyncState" class="table-local-badge" :class="table.localSyncState">{{ table.localSyncState === 'review' ? 'يحتاج مراجعة' : 'محلي' }}</span>
          <button class="table-card-action" :disabled="table.hasCall && !connectivity.online" @click.stop="runPrimaryAction(table)">{{ tableActionLabel(table) }}</button>
        </article>
      </div>

      <aside v-if="selectedTable" class="table-selection-panel" :class="selectedTable.status">
        <header><span>الطاولة</span><strong>{{ selectedTable.name }}</strong><small>{{ selectedTable.hasCall ? 'تطلب جارسون' : TABLE_STATUS_LABELS[selectedTable.status] }}</small></header>
        <button class="table-panel-primary" @click="open(selectedTable)"><AppIcon :name="selectedTable.status === 'available' ? 'plus' : 'receipt'" :size="19" />{{ selectedTable.status === 'available' ? 'طلب جديد' : 'فتح الطلب' }}</button>
        <template v-if="selectedTable.orderId">
          <button v-if="settings.settings.tables.allowTransfer" :disabled="!connectivity.online" @click="openAction('transfer', selectedTable)"><AppIcon name="transfer" :size="19" />نقل</button>
          <button v-if="settings.settings.tables.allowMerge" :disabled="!connectivity.online" @click="openAction('merge', selectedTable)"><AppIcon name="merge" :size="19" />دمج</button>
          <button v-if="settings.settings.tables.allowSplit" :disabled="!connectivity.online" @click="openAction('split', selectedTable)"><AppIcon name="split" :size="19" />تقسيم</button>
        </template>
        <button v-if="selectedTable.hasCall && settings.settings.tables.showCalls" class="table-panel-call" :disabled="!connectivity.online" @click="acknowledge(selectedTable)"><AppIcon name="bell" :size="19" />استلام النداء</button>
        <div v-if="offlineView" class="table-panel-offline"><AppIcon name="wifi-off" :size="16" />العمليات المحفوظة فقط متاحة أوفلاين</div>
      </aside>
    </div>

    <div v-if="tables.length" class="table-legend" aria-label="دليل حالات الطاولات">
      <span v-for="status in (['available','occupied','pending_confirmation','reserved'] as const)" :key="status" :class="status"><i></i>{{ TABLE_STATUS_LABELS[status] }}</span>
      <span class="has_call"><i></i>نداء جارسون</span>
      <small>الحالات الأوفلاين حسب آخر تحديث وسيتم التحقق عند عودة الاتصال</small>
    </div>

    <Teleport to="body"><div v-if="action && source" class="modal-backdrop" @click.self="action = null"><section class="modal table-action-modal"><header class="modal-head"><div class="grow"><h2>{{ action === 'transfer' ? 'نقل الطلب' : action === 'merge' ? 'دمج الطاولات' : 'تقسيم الطلب' }}</h2><small class="muted">من الطاولة {{ source.name }}</small></div><button class="icon-button" @click="action = null">×</button></header><div class="modal-body stack"><label class="field"><span>إلى الطاولة *</span><select v-model.number="targetId"><option :value="null">اختر الطاولة</option><option v-for="table in targets" :key="table.id" :value="table.id">{{ table.name }}</option></select></label><template v-if="action === 'split'"><h3>اختر الأصناف المطلوب نقلها</h3><label v-for="line in orderLines" :key="line.localId" class="switch-row"><span><strong>{{ line.name }}</strong><small class="muted">الكمية {{ line.quantity }}</small></span><input v-if="line.serverId" v-model="selectedLines" type="checkbox" :value="line.serverId" /></label></template><p v-if="error" class="error-text">{{ error }}</p></div><footer class="modal-foot row"><button class="btn btn-secondary" @click="action = null">إلغاء</button><button class="btn btn-primary" :disabled="actionBusy || !targetId" @click="runAction">{{ actionBusy ? 'جاري التنفيذ…' : 'تأكيد العملية' }}</button></footer></section></div></Teleport>
  </div>
</template>
