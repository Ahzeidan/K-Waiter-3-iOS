<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { waiterApi } from '@/app/services/waiter-api';
import { printOrderBill } from '@/app/services/printing';
import { useSettingsStore } from '@/app/stores/settings';
import { useAuthStore } from '@/app/stores/auth';
import { useConnectivityStore } from '@/app/stores/connectivity';
import type { OrderDetail, OrderDraft, OrderSummary, PaymentChangePayload, ShiftState, SyncOperation } from '@/shared/domain';
import { createIdempotencyKey } from '@/shared/ids';
import { directPrintQueue, isDirectPrintingMode } from '@/app/services/direct-printing';
import { localDatabase } from '@/app/services/local-database';
import { belongsToActiveScope } from '@/app/services/data-scope';
import { lineTotal } from '@/app/stores/order';
import { formatTime, matchesSearch, money } from '@/shared/format';
import { ORDER_TYPE_LABELS } from '@/app/settings/defaults';
import { enabledPaymentOptions, shiftPaymentOptions } from '@/shared/payment-methods';
import PaymentChangeModal from '@/features/orders/PaymentChangeModal.vue';

const router = useRouter();
const settings = useSettingsStore();
const auth = useAuthStore();
const connectivity = useConnectivityStore();
const orders = ref<OrderSummary[]>([]);
const filter = ref<'all' | 'due' | 'paid'>('all');
const search = ref('');
const loading = ref(true);
const error = ref('');
const message = ref('');
const printingOrderId = ref<number | null>(null);
const detail = ref<OrderDetail | null>(null);
const detailLoading = ref(false);
const paymentChangeOrder = ref<OrderDetail | null>(null);
const paymentShift = ref<ShiftState | null>(null);
const paymentChangeBusy = ref(false);
const paymentChangeError = ref('');
const localDrafts = ref<Array<{ draft: OrderDraft; paymentPending: boolean }>>([]);
let refreshTimer: number | null = null;
const printLabels: Record<string, string> = { not_requested: 'لم تُطلب الطباعة', queued: 'في طابور الطباعة', printing: 'تُطبع الآن', printed: 'تمت الطباعة', failed: 'فشلت الطباعة', uncertain: 'الطباعة غير مؤكدة' };
const visible = computed(() => orders.value.filter(order =>
  (filter.value === 'all' || (filter.value === 'paid' ? order.paymentStatus === 'paid' : order.paymentStatus !== 'paid'))
  && matchesSearch(search.value, order.invoiceNo, order.customerName, order.customerMobile, order.addressLabel, order.tableName, order.status),
));
const paymentChangeOptions = computed(() => enabledPaymentOptions(shiftPaymentOptions(paymentShift.value, settings.settings), settings.settings));

async function load(): Promise<void> {
  loading.value = true; error.value = '';
  try {
    const [remote, drafts, queue] = await Promise.all([
      waiterApi.orders().catch(() => [] as OrderSummary[]),
      localDatabase.list<OrderDraft>('drafts'),
      localDatabase.list<SyncOperation>('syncQueue'),
    ]);
    orders.value = remote;
    const scopedQueue = queue.filter(belongsToActiveScope);
    localDrafts.value = drafts.filter(belongsToActiveScope).filter(draft => !draft.serverId && draft.lines.length).map(draft => ({ draft, paymentPending: scopedQueue.some(operation => operation.kind === 'payment.create' && operation.aggregateId === draft.localId) }));
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تحميل الطلبات'; }
  finally { loading.value = false; }
}
onMounted(() => {
  void load();
  refreshTimer = window.setInterval(() => { if (!document.hidden) void load(); }, settings.settings.sync.intervalSeconds * 1000);
});
onUnmounted(() => { if (refreshTimer !== null) window.clearInterval(refreshTimer); });

async function preview(orderId: number): Promise<void> {
  detailLoading.value = true; error.value = '';
  try { detail.value = await waiterApi.order(orderId); }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر فتح تفاصيل الطلب'; }
  finally { detailLoading.value = false; }
}

async function reprintKot(orderId: number): Promise<void> {
  const reason = window.prompt('اكتب سبب إعادة طباعة المطبخ', 'إعادة طباعة بطلب الجارسون')?.trim();
  if (!reason) return;
  try { const direct = isDirectPrintingMode(settings.settings.printing.mode); const result = await waiterApi.reprintKot(orderId, reason, createIdempotencyKey('reprint-kot', orderId), direct); if (direct && result.jobData?.length) await directPrintQueue.enqueueServerJobs(result.jobData); message.value = 'تم إرسال KOT لإعادة الطباعة'; await load(); }
  catch (reasonValue) { error.value = reasonValue instanceof Error ? reasonValue.message : 'تعذرت إعادة طباعة KOT'; }
}

async function requestPayment(orderId: number): Promise<void> {
  try { await waiterApi.requestPayment(orderId, createIdempotencyKey('request-payment', orderId)); message.value = 'تم إرسال طلب الدفع للكاشير'; }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر إرسال طلب الدفع'; }
}

async function openPaymentChange(orderId: number): Promise<void> {
  if (!connectivity.online) { error.value = 'تغيير طريقة الدفع يحتاج اتصالًا مباشرًا بالسيرفر.'; return; }
  paymentChangeError.value = '';
  try {
    const [order, nextShift] = await Promise.all([waiterApi.order(orderId), waiterApi.shift()]);
    paymentChangeOrder.value = order;
    paymentShift.value = nextShift;
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تحميل بيانات تغيير الدفع'; }
}

async function changePayment(payload: PaymentChangePayload): Promise<void> {
  if (!paymentChangeOrder.value || paymentChangeBusy.value) return;
  paymentChangeBusy.value = true; paymentChangeError.value = '';
  try {
    await waiterApi.changePayment(paymentChangeOrder.value.id, payload, createIdempotencyKey('change-payment', paymentChangeOrder.value.id));
    paymentChangeOrder.value = null;
    message.value = 'تم تغيير وتوثيق طريقة الدفع بنجاح';
    await load();
  } catch (reason) { paymentChangeError.value = reason instanceof Error ? reason.message : 'تعذر تغيير طريقة الدفع'; }
  finally { paymentChangeBusy.value = false; }
}

async function printBill(orderId: number): Promise<void> {
  if (printingOrderId.value !== null) return;
  printingOrderId.value = orderId; error.value = ''; message.value = '';
  try {
    const result = await printOrderBill(orderId, settings.settings);
    message.value = result.queued ? 'الطابعة غير متاحة؛ الفاتورة محفوظة في طابور الطباعة' : result.local ? 'تمت طباعة الفاتورة مباشرة' : result.jobs ? 'تم إرسال الفاتورة للطباعة' : 'اكتملت الطباعة';
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذرت الطباعة'; }
  finally { printingOrderId.value = null; }
}
</script>

<template>
  <div class="page stack">
    <div class="page-head"><div><h1>الطلبات</h1><p>الطلبات الحالية والمدفوعة وحالة المزامنة</p></div><button class="btn btn-primary" @click="router.push('/pos')">＋ طلب جديد</button></div>
    <div class="orders-toolbar"><label class="catalog-search grow"><span>⌕</span><input v-model="search" placeholder="رقم الطلب أو العميل أو الطاولة…" /></label><div class="chip-row"><button v-for="item in [{id:'all',label:'الكل'},{id:'due',label:'مستحقة'},{id:'paid',label:'مدفوعة'}]" :key="item.id" class="chip" :class="{ active: filter === item.id }" @click="filter = item.id as typeof filter">{{ item.label }}</button></div><button class="btn btn-secondary" @click="load">↻</button></div>
    <p v-if="error" class="error-text">{{ error }}</p><p v-if="message" class="success-text">{{ message }}</p>
    <section v-if="localDrafts.length" class="card stack"><h2>طلبات أوفلاين تنتظر المزامنة</h2><article v-for="item in localDrafts" :key="item.draft.localId" class="list-card"><span class="avatar">↻</span><div class="main"><h3>{{ item.draft.customerSnapshot?.name || ORDER_TYPE_LABELS[item.draft.type] }}</h3><p>{{ item.draft.customerSnapshot?.mobile }} · {{ item.draft.lines.length }} أصناف</p></div><span class="badge warning">{{ item.paymentPending ? 'طلب ودفع معلقان' : 'طلب معلق' }}</span><strong>{{ money(item.draft.lines.reduce((sum,line) => sum + lineTotal(line), 0)) }}</strong></article></section>
    <div v-if="loading" class="empty-state">جاري تحميل الطلبات…</div>
    <div v-else class="orders-grid">
      <article v-for="order in visible" :key="order.id" class="order-card">
        <header><div><span class="badge">{{ ORDER_TYPE_LABELS[order.type] }}</span><h2>{{ order.invoiceNo }}</h2></div><span class="badge" :class="order.paymentStatus === 'paid' ? 'success' : 'warning'">{{ order.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق' }}</span></header>
        <p>{{ order.customerName || order.tableName || 'طلب مباشر' }} <template v-if="order.customerMobile">· {{ order.customerMobile }}</template></p><small v-if="order.addressLabel">{{ order.addressLabel }}</small><small>{{ order.status }} · {{ formatTime(order.createdAt) }}</small>
        <div class="print-status" :class="`print-${order.printState || 'not_requested'}`"><strong>{{ printLabels[order.printState || 'not_requested'] || order.printState }}</strong><small v-if="order.printRequestedCopies">{{ order.printConfirmedCopies || 0 }} / {{ order.printRequestedCopies }} نسخة مؤكدة</small></div>
        <strong class="order-total">{{ money(order.total) }}</strong>
        <footer><button class="btn btn-secondary" @click="preview(order.id)">معاينة الطلب</button><button v-if="order.canEdit !== false && auth.permissions.can_sell && settings.settings.screens.pos" class="btn btn-secondary" @click="router.push(`/pos?order=${order.id}`)">عرض وتعديل</button><button v-if="order.paymentStatus !== 'paid' && order.canPay !== false && auth.permissions.can_pay && settings.settings.screens.payment" class="btn btn-primary" @click="router.push(`/payment/${order.id}?total=${order.total}`)">الدفع</button><button v-if="order.paymentStatus !== 'paid'" class="btn btn-soft" @click="requestPayment(order.id)">طلب دفع</button><button v-if="auth.permissions.can_print" class="btn btn-soft" @click="reprintKot(order.id)">إعادة KOT</button><button v-if="order.paymentStatus === 'paid' && order.canPrint !== false && auth.permissions.can_print && settings.settings.printing.enabled" class="btn btn-soft" :disabled="printingOrderId !== null" @click="printBill(order.id)">{{ printingOrderId === order.id ? 'جاري الطباعة…' : 'إعادة الفاتورة' }}</button><button v-if="order.paymentStatus === 'paid' && order.canChangePayment && auth.permissions.can_change_payment" class="btn btn-secondary" @click="openPaymentChange(order.id)">تغيير الدفع</button></footer>
      </article>
      <div v-if="!visible.length" class="empty-state card"><span class="empty-icon">☷</span>لا توجد طلبات مطابقة</div>
    </div>
    <Teleport to="body"><div v-if="detail || detailLoading" class="modal-backdrop" @click.self="detail=null"><section class="modal"><header class="modal-head"><div class="grow"><h2>تفاصيل {{ detail?.invoiceNo }}</h2><small>{{ detail?.customerName }} {{ detail?.customerMobile }}</small></div><button class="icon-button" @click="detail=null">×</button></header><div class="modal-body stack"><div v-if="detailLoading" class="empty-state">جاري التحميل…</div><template v-else-if="detail"><p v-if="detail.address">{{ [detail.address.label, detail.address.area, detail.address.street, detail.address.building].filter(Boolean).join('، ') }}</p><article v-for="line in detail.lines" :key="line.localId" class="list-card"><div class="main"><h3>{{ line.quantity }} × {{ line.name }}</h3><p>{{ line.choices.map(choice => choice.name).join('، ') }}</p><small v-if="line.note">{{ line.note }}</small></div><strong>{{ money(line.unitPrice * line.quantity) }}</strong></article><div class="cart-total"><span>الإجمالي</span><strong>{{ money(detail.total) }}</strong></div></template></div></section></div></Teleport>
    <Teleport to="body"><PaymentChangeModal v-if="paymentChangeOrder" :order="paymentChangeOrder" :options="paymentChangeOptions" :allow-split="Boolean(paymentShift?.allowSplitPayment && settings.settings.payment.allowSplit)" :busy="paymentChangeBusy" :error="paymentChangeError" @close="paymentChangeOrder = null" @confirm="changePayment" /></Teleport>
  </div>
</template>
