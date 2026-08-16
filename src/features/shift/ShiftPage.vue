<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { waiterApi } from '@/app/services/waiter-api';
import { useAuthStore } from '@/app/stores/auth';
import type { ShiftState } from '@/shared/domain';
import { formatTime, money } from '@/shared/format';

const shift = ref<ShiftState | null>(null);
const auth = useAuthStore();
const amount = ref(0);
const terminalBatchNumber = ref('');
const notes = ref('');
const busy = ref(false);
const error = ref('');
const duration = computed(() => {
  if (!shift.value?.openedAt) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(shift.value.openedAt).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)} س ${minutes % 60} د`;
});
const canToggle = computed(() => shift.value?.active ? auth.permissions.can_close_shift : auth.permissions.can_open_shift);

async function load(): Promise<void> { shift.value = await waiterApi.shift().catch(reason => { error.value = reason.message; return null; }); }
async function toggle(): Promise<void> {
  busy.value = true; error.value = '';
  try { shift.value = shift.value?.active ? await waiterApi.closeShift(amount.value, terminalBatchNumber.value.trim(), notes.value.trim()) : await waiterApi.openShift(amount.value); amount.value = 0; terminalBatchNumber.value = ''; notes.value = ''; }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تحديث الوردية'; }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="page stack">
    <div class="page-head"><div><h1>الوردية</h1><p>التحصيل والملخص اليومي للجارسون</p></div><span class="badge" :class="shift?.active ? 'success' : 'danger'">{{ shift?.active ? 'مفتوحة' : 'مغلقة' }}</span></div>
    <section class="shift-hero card"><div><span class="muted">{{ shift?.active ? 'بدأت الساعة' : 'لا توجد وردية مفتوحة' }}</span><h2>{{ shift?.active ? formatTime(shift.openedAt) : 'ابدأ ورديتك' }}</h2><p v-if="shift?.active">مدة الوردية {{ duration }}</p></div><div class="shift-total"><span>إجمالي التحصيل</span><strong>{{ money(shift?.total || 0) }}</strong></div></section>
    <div class="metric-grid"><div class="metric-card"><span>عدد الطلبات</span><strong>{{ shift?.ordersCount || 0 }}</strong></div><div class="metric-card"><span>نقدي</span><strong>{{ money(shift?.cashTotal || 0) }}</strong></div><div class="metric-card"><span>كي نت</span><strong>{{ money(shift?.knetTotal || 0) }}</strong></div><div class="metric-card"><span>مستحق من العملاء</span><strong>{{ money(shift?.pendingFromCustomers || 0) }}</strong></div><div class="metric-card"><span>تحصيل فعلي</span><strong>{{ money(shift?.physicalTotal || 0) }}</strong></div><div class="metric-card"><span>مع السائقين</span><strong>{{ money(shift?.driversUnsettled || 0) }}</strong></div></div>
    <section v-if="shift?.recentOrders.length" class="card stack"><h2>طلبات الوردية</h2><article v-for="order in shift.recentOrders" :key="order.id" class="list-card"><div class="main"><h3>{{ order.invoiceNo }}</h3><p>{{ order.paymentMethod || 'غير محدد' }} · {{ order.createdAt }}</p></div><strong>{{ money(order.collected) }}</strong><span v-if="order.pending" class="badge warning">متبقي {{ money(order.pending) }}</span></article></section>
    <section class="card stack shift-action"><h2>{{ shift?.active ? 'إنهاء وتسوية الوردية' : 'فتح الوردية' }}</h2><template v-if="canToggle"><label class="field"><span>{{ shift?.active ? 'النقدي الفعلي عند الإغلاق' : 'رصيد افتتاحي' }}</span><input v-model.number="amount" type="number" min="0" step="0.001" /></label><label v-if="shift?.active" class="field"><span>رقم دفعة جهاز كي نت</span><input v-model="terminalBatchNumber" inputmode="numeric" /></label><label v-if="shift?.active" class="field"><span>ملاحظات التسوية</span><textarea v-model="notes" rows="3"></textarea></label><p v-if="error" class="error-text">{{ error }}</p><button class="btn" :class="shift?.active ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="toggle">{{ busy ? 'جاري الحفظ…' : shift?.active ? 'إغلاق الوردية' : 'فتح الوردية' }}</button></template><p v-else class="managed-note">الدور الحالي لا يملك صلاحية {{ shift?.active ? 'إغلاق' : 'فتح' }} الوردية.</p></section>
  </div>
</template>
