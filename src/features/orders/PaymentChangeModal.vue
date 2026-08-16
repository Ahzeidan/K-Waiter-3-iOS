<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { OrderDetail, PaymentChangePayload, PaymentMethodOption } from '@/shared/domain';
import { money } from '@/shared/format';
import { paymentMethodIcon } from '@/shared/payment-methods';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ order: OrderDetail; options: PaymentMethodOption[]; allowSplit: boolean; busy: boolean; error?: string }>();
const emit = defineEmits<{ close: []; confirm: [payload: PaymentChangePayload] }>();
const mode = ref<'single' | 'amount' | 'items'>('single');
const method = ref('');
const allocations = reactive<Record<string, number>>({});
const itemMethods = reactive<Record<number, string>>({});
const reasonPreset = ref('تصحيح اختيار طريقة الدفع');
const reasonNote = ref('');
const localError = ref('');

const reason = computed(() => [reasonPreset.value, reasonNote.value.trim()].filter(Boolean).join(' — '));
const allocated = computed(() => props.options.reduce((sum, option) => sum + Number(allocations[option.id] || 0), 0));
const serverLines = computed(() => props.order.lines.filter(line => line.serverId));
const canItemSplit = computed(() => props.allowSplit && serverLines.value.length > 0);

watch(() => props.options, options => {
  method.value = options[0]?.id ?? '';
  for (const option of options) if (allocations[option.id] === undefined) allocations[option.id] = 0;
  for (const line of serverLines.value) if (line.serverId && !itemMethods[line.serverId]) itemMethods[line.serverId] = options[0]?.id ?? '';
}, { immediate: true });

function submit(): void {
  localError.value = '';
  if (!reason.value) { localError.value = 'اكتب سبب التغيير لحفظه في سجل المراجعة.'; return; }
  if (mode.value === 'single') {
    if (!method.value) { localError.value = 'اختر طريقة الدفع الجديدة.'; return; }
    emit('confirm', { method: method.value, reason: reason.value });
    return;
  }
  if (mode.value === 'amount') {
    const payments = props.options.map(option => ({ method: option.id, amount: Number(allocations[option.id] || 0) })).filter(part => part.amount > 0);
    if (payments.length < 2 || Math.abs(allocated.value - props.order.total) > 0.0005) { localError.value = 'وزّع إجمالي الفاتورة كاملًا على طريقتين على الأقل.'; return; }
    emit('confirm', { split_mode: 'amount', payments, reason: reason.value });
    return;
  }
  const grouped = new Map<string, Array<{ line_id: number; quantity: number }>>();
  for (const line of serverLines.value) {
    const itemMethod = line.serverId ? itemMethods[line.serverId] : '';
    if (!line.serverId || !itemMethod) { localError.value = 'اختر طريقة دفع لكل صنف.'; return; }
    const items = grouped.get(itemMethod) ?? [];
    items.push({ line_id: line.serverId, quantity: line.quantity });
    grouped.set(itemMethod, items);
  }
  if (grouped.size < 2) { localError.value = 'قسّم الأصناف على طريقتين على الأقل.'; return; }
  emit('confirm', { split_mode: 'items', item_groups: Array.from(grouped, ([groupMethod, items]) => ({ method: groupMethod, items })), reason: reason.value });
}
</script>

<template>
  <div class="modal-backdrop payment-change-backdrop" @click.self="emit('close')">
    <section class="modal payment-change-modal" role="dialog" aria-modal="true" aria-labelledby="payment-change-title">
      <header class="modal-head payment-change-head"><div class="grow"><span class="eyebrow">الطلب {{ order.invoiceNo }}</span><h2 id="payment-change-title">تغيير طريقة الدفع</h2><small>الحالية: {{ order.paymentMethod || 'غير محددة' }} · {{ money(order.total) }}</small></div><button class="icon-button" aria-label="إغلاق" @click="emit('close')">×</button></header>
      <div class="payment-change-tabs">
        <button :class="{ active: mode === 'single' }" @click="mode = 'single'">طريقة واحدة</button>
        <button v-if="allowSplit" :class="{ active: mode === 'amount' }" @click="mode = 'amount'">تقسيم بالمبلغ</button>
        <button v-if="canItemSplit" :class="{ active: mode === 'items' }" @click="mode = 'items'">تقسيم بالأصناف</button>
      </div>
      <div class="modal-body payment-change-body stack">
        <div v-if="mode === 'single'" class="payment-methods payment-change-methods"><button v-for="item in options" :key="item.id" class="payment-method" :class="{ active: method === item.id }" @click="method = item.id"><AppIcon :name="paymentMethodIcon(item.id)" :size="23" /><strong>{{ item.label }}</strong><i>{{ method === item.id ? '✓' : '' }}</i></button></div>
        <template v-else-if="mode === 'amount'">
          <div class="payment-allocation-grid"><label v-for="item in options" :key="item.id" class="field"><span><AppIcon :name="paymentMethodIcon(item.id)" :size="16" /> {{ item.label }}</span><input v-model.number="allocations[item.id]" type="number" min="0" step="0.001" inputmode="decimal" /></label></div>
          <div class="change-box" :class="{ invalid: Math.abs(allocated-order.total) > .0005 }"><span>الموزع</span><strong>{{ money(allocated) }} / {{ money(order.total) }}</strong></div>
        </template>
        <template v-else>
          <div class="payment-item-list"><label v-for="line in serverLines" :key="line.localId" class="payment-item-row"><span><strong>{{ line.quantity }} × {{ line.name }}</strong><small>{{ money(line.unitPrice * line.quantity) }}</small></span><select v-if="line.serverId" v-model="itemMethods[line.serverId]"><option v-for="item in options" :key="item.id" :value="item.id">{{ item.label }}</option></select></label></div>
        </template>
        <div class="payment-change-reason">
          <label class="field"><span>سبب التغيير *</span><select v-model="reasonPreset"><option>تصحيح اختيار طريقة الدفع</option><option>طلب العميل</option><option>تصحيح تسوية الكاشير</option><option>خطأ في التقسيم السابق</option><option value="">سبب آخر</option></select></label>
          <label class="field"><span>ملاحظة إضافية</span><input v-model="reasonNote" maxlength="500" placeholder="اختياري، أو مطلوب عند اختيار سبب آخر" /></label>
        </div>
        <p v-if="localError || error" class="error-text">{{ localError || error }}</p>
        <div class="managed-note">هذه العملية تحتاج اتصالًا مباشرًا، وتُحفظ باسم المستخدم والسبب في سجل التدقيق.</div>
      </div>
      <footer class="modal-foot row"><button class="btn btn-secondary" :disabled="busy" @click="emit('close')">إلغاء</button><button class="btn btn-primary grow" :disabled="busy || !options.length" @click="submit">{{ busy ? 'جاري الحفظ…' : 'تأكيد تغيير الدفع' }}</button></footer>
    </section>
  </div>
</template>
