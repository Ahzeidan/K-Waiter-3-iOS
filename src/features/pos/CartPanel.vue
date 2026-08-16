<script setup lang="ts">
import { computed } from 'vue';
import type { CartLine, OrderType } from '@/shared/domain';
import { lineTotal } from '@/app/stores/order';
import { ORDER_TYPE_LABELS } from '@/app/settings/defaults';
import { money } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';

const props = withDefaults(defineProps<{ lines: CartLine[]; subtotal: number; note: string; saving: boolean; persistedAt: string | null; submitting: boolean; quickPay: boolean; quickCash: boolean; quickKnet: boolean; showKitchen: boolean; orderType: OrderType; allowedOrderTypes: Record<OrderType, boolean>; closable?: boolean }>(), { closable: false });
const emit = defineEmits<{ quantity: [lineId: string, delta: number]; remove: [lineId: string]; edit: [line: CartLine]; note: [value: string]; orderType: [type: OrderType]; submit: []; kitchen: []; pay: []; quickCash: []; quickKnet: []; close: [] }>();
const orderTypeIcons: Record<OrderType, string> = { dine_in: 'dine-in', takeaway: 'takeaway', delivery: 'delivery', pickup: 'pickup' };
const visibleOrderTypes = computed(() => (Object.keys(props.allowedOrderTypes) as OrderType[]).filter(type => props.allowedOrderTypes[type]));
</script>

<template>
  <aside class="cart-panel">
    <header class="cart-head">
      <div><h2>الطلب الحالي</h2><small>{{ lines.length }} أصناف <template v-if="saving">· جارٍ حفظ المسودة</template></small></div>
      <span v-if="saving" class="badge warning">جاري الحفظ</span><span v-else-if="persistedAt" class="badge success">محفوظ</span>
      <button v-if="closable" class="icon-button cart-close" aria-label="إغلاق السلة" @click="emit('close')"><AppIcon name="close" /></button>
    </header>
    <section class="cart-order-type" aria-labelledby="cart-order-type-title">
      <div class="cart-order-type-head"><span id="cart-order-type-title">نوع الطلب</span><strong>{{ ORDER_TYPE_LABELS[orderType] }}</strong></div>
      <div class="cart-order-type-options" :class="`order-types-${visibleOrderTypes.length}`">
        <button v-for="type in visibleOrderTypes" :key="type" :class="{ active: orderType === type }" :aria-pressed="orderType === type" @click="emit('orderType', type)"><AppIcon :name="orderTypeIcons[type]" :size="17" /><span>{{ ORDER_TYPE_LABELS[type] }}</span></button>
      </div>
    </section>
    <div class="cart-lines">
      <article v-for="line in lines" :key="line.localId" class="cart-line">
        <div class="cart-line-main"><strong>{{ line.name }}</strong><small v-if="line.choices.length">{{ line.choices.map(item => item.name).join('، ') }}</small><small v-if="line.note">ملاحظة: {{ line.note }}</small><b>{{ money(lineTotal(line)) }}</b></div>
        <div class="quantity-control"><button :disabled="line.locked" :aria-label="`تقليل ${line.name}`" @click="emit('quantity', line.localId, -1)"><AppIcon name="minus" :size="16" /></button><strong>{{ line.quantity }}</strong><button :disabled="line.locked" :aria-label="`زيادة ${line.name}`" @click="emit('quantity', line.localId, 1)"><AppIcon name="plus" :size="16" /></button></div>
        <button class="line-edit" :disabled="line.locked" :aria-label="`تعديل ${line.name}`" @click="emit('edit', line)"><AppIcon name="edit" :size="17" /></button>
        <button class="line-remove" :disabled="line.locked" :aria-label="`حذف ${line.name}`" @click="emit('remove', line.localId)"><AppIcon name="trash" :size="17" /></button>
      </article>
      <div v-if="!lines.length" class="empty-state"><AppIcon class="empty-icon" name="cart" :size="42" /><strong>السلة فارغة</strong><p>اضغط على أي منتج لإضافته</p></div>
    </div>
    <footer class="cart-foot">
      <details class="cart-note-disclosure"><summary><AppIcon name="edit" :size="17" /> ملاحظة الطلب</summary><label class="field cart-note"><textarea :value="note" rows="2" placeholder="ملاحظة عامة للمطبخ أو الكاشير" @input="emit('note', ($event.target as HTMLTextAreaElement).value)"></textarea></label></details>
      <div class="cart-total"><span>الإجمالي</span><strong>{{ money(subtotal) }}</strong></div>
      <section v-if="quickPay && (quickCash || quickKnet)" class="quick-payment-section">
        <h3>تحصيل سريع</h3>
        <div class="quick-payment-actions"><button v-if="quickCash" class="btn quick-cash" :disabled="!lines.length || submitting" @click="emit('quickCash')"><AppIcon name="cash" :size="22" /><span><strong>نقدي سريع</strong><small>حفظ الطلب + دفع</small></span></button><button v-if="quickKnet" class="btn quick-knet" :disabled="!lines.length || submitting" @click="emit('quickKnet')"><AppIcon name="card" :size="22" /><span><strong>كي نت سريع</strong><small>حفظ الطلب + دفع</small></span></button></div>
      </section>
      <button v-if="quickPay" class="btn btn-secondary btn-block detailed-payment" :disabled="!lines.length || submitting" @click="emit('pay')"><AppIcon name="sliders" :size="19" />الدفع بالتفصيل أو التقسيم</button>
      <div class="cart-actions"><button class="btn btn-secondary" :disabled="!lines.length || submitting" @click="emit('submit')"><AppIcon name="save" :size="19" />{{ submitting ? 'جاري الحفظ…' : 'حفظ فقط' }}</button><button v-if="showKitchen" class="btn btn-primary" :disabled="!lines.length || submitting" @click="emit('kitchen')"><AppIcon name="chef" :size="19" />إرسال للمطبخ</button></div>
    </footer>
  </aside>
</template>
