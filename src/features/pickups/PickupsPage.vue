<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { waiterApi } from '@/app/services/waiter-api';
import { useAuthStore } from '@/app/stores/auth';
import { useSettingsStore } from '@/app/stores/settings';
import type { OrderDetail, OrderSummary } from '@/shared/domain';
import { formatTime, matchesSearch, money } from '@/shared/format';
import { printOrderBill } from '@/app/services/printing';

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();
const orders = ref<OrderSummary[]>([]);
const loading = ref(true);
const filter = ref<'active' | 'ready' | 'done'>('active');
const search = ref('');
const error = ref('');
let refreshTimer: number | null = null;
const detail = ref<OrderDetail | null>(null);
const printingId = ref<number | null>(null);
const pickups = computed(() => orders.value.filter(order => order.type === 'pickup').filter(order => matchesSearch(search.value, order.invoiceNo, order.customerName, order.customerMobile)).filter(order => {
  if (filter.value === 'done') return order.paymentStatus === 'paid';
  if (filter.value === 'ready') return order.status.includes('جاهز') && order.paymentStatus !== 'paid';
  return order.paymentStatus !== 'paid';
}));

async function load(): Promise<void> { loading.value = true; error.value = ''; try { orders.value = await waiterApi.orders(); } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر تحميل طلبات الاستلام'; } finally { loading.value = false; } }
onMounted(() => { void load(); refreshTimer = window.setInterval(() => { if (!document.hidden) void load(); }, settings.settings.sync.intervalSeconds * 1000); });
onUnmounted(() => { if (refreshTimer !== null) window.clearInterval(refreshTimer); });
async function preview(id: number): Promise<void> { try { detail.value = await waiterApi.order(id); } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر فتح الطلب'; } }
async function print(id: number): Promise<void> { printingId.value = id; try { await printOrderBill(id, settings.settings); } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذرت الطباعة'; } finally { printingId.value = null; } }
</script>

<template>
  <div class="page stack">
    <div class="page-head"><div><h1>طلبات الاستلام</h1><p>من الطلب الجديد حتى التسليم والتحصيل</p></div><button class="btn btn-primary" @click="router.push('/pos?type=pickup')">＋ طلب استلام</button></div>
    <div class="orders-toolbar"><label class="catalog-search grow"><span>⌕</span><input v-model="search" placeholder="رقم الطلب أو اسم العميل أو الهاتف…" /><button v-if="search" @click="search=''">×</button></label><div class="chip-row"><button class="chip" :class="{active:filter==='active'}" @click="filter='active'">الحالية</button><button class="chip" :class="{active:filter==='ready'}" @click="filter='ready'">جاهزة</button><button class="chip" :class="{active:filter==='done'}" @click="filter='done'">تم التسليم</button></div><button class="btn btn-secondary" @click="load">↻</button></div>
    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="loading" class="empty-state">جاري التحميل…</div>
    <div v-else class="pickup-board">
      <article v-for="order in pickups" :key="order.id" class="pickup-card">
        <div class="pickup-number">{{ order.invoiceNo }}</div><div class="grow"><h2>{{ order.customerName || 'عميل الاستلام' }}</h2><strong v-if="order.customerMobile" class="customer-phone">☎ {{ order.customerMobile }}</strong><p v-if="order.addressLabel">{{ order.addressLabel }}</p><p>{{ order.status }} · {{ formatTime(order.createdAt) }}</p></div><strong>{{ money(order.total) }}</strong>
        <div class="row"><button class="btn btn-secondary" @click="preview(order.id)">تفاصيل</button><button v-if="order.canEdit !== false && auth.permissions.can_sell" class="btn btn-secondary" @click="router.push(`/pos?order=${order.id}`)">تعديل</button><button v-if="order.paymentStatus !== 'paid' && auth.permissions.can_pay && settings.settings.screens.payment" class="btn btn-primary" @click="router.push(`/payment/${order.id}?total=${order.total}`)">تحصيل وتسليم</button><button v-if="order.canPrint !== false && auth.permissions.can_print && settings.settings.printing.enabled" class="btn btn-soft" :disabled="printingId !== null" @click="print(order.id)">طباعة</button><span v-if="order.paymentStatus === 'paid'" class="badge success">تم التسليم</span><span v-else-if="!auth.permissions.can_pay" class="badge warning">بانتظار الكاشير</span></div>
      </article>
      <div v-if="!pickups.length" class="empty-state card"><span class="empty-icon">▤</span>لا توجد طلبات في هذه الحالة</div>
    </div>
    <Teleport to="body"><div v-if="detail" class="modal-backdrop" @click.self="detail=null"><section class="modal"><header class="modal-head"><div class="grow"><h2>{{ detail.invoiceNo }} — {{ detail.customerName }}</h2><small>{{ detail.customerMobile }}</small></div><button class="icon-button" @click="detail=null">×</button></header><div class="modal-body stack"><p v-if="detail.address">{{ [detail.address.label, detail.address.area, detail.address.street, detail.address.building].filter(Boolean).join('، ') }}</p><article v-for="line in detail.lines" :key="line.localId" class="list-card"><div class="main"><h3>{{ line.quantity }} × {{ line.name }}</h3><p>{{ line.choices.map(choice => choice.name).join('، ') }}</p><small v-if="line.note">{{ line.note }}</small></div></article><div class="cart-total"><span>الإجمالي</span><strong>{{ money(detail.total) }}</strong></div></div></section></div></Teleport>
  </div>
</template>
