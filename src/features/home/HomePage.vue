<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSettingsStore } from '@/app/stores/settings';
import { useSyncStore } from '@/app/stores/sync';
import { waiterApi } from '@/app/services/waiter-api';
import type { OrderSummary, RestaurantTable, ShiftState } from '@/shared/domain';
import { money, formatTime } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();
const connectivity = useConnectivityStore();
const sync = useSyncStore();
const orders = ref<OrderSummary[]>([]);
const shift = ref<ShiftState | null>(null);
const tables = ref<RestaurantTable[]>([]);
const printerOnline = ref<boolean | null>(null);
const recentOrders = computed(() => orders.value.slice(0, 5));
const occupiedTables = computed(() => tables.value.filter(table => table.status !== 'available').length);
const openPickups = computed(() => orders.value.filter(order => order.type === 'pickup' && order.paymentStatus !== 'paid').length);

const quickActions = computed(() => [
  { show: settings.settings.screens.pos && auth.permissions.can_sell, to: '/pos', icon: 'plus', title: 'طلب جديد', text: 'ابدأ طلب توصيل أو استلام بسرعة' },
  { show: settings.settings.screens.pickups && auth.permissions.can_pickup, to: '/pickups', icon: 'pickup', title: 'طلبات الاستلام', text: 'تابع التجهيز والتسليم والدفع' },
  { show: settings.settings.screens.tables && auth.permissions.can_tables, to: '/tables', icon: 'table-top', title: 'الطاولات', text: 'الحالة والنداءات ونقل الطلب' },
  { show: settings.settings.screens.customers && auth.permissions.can_manage_customers, to: '/customers', icon: 'users', title: 'العملاء', text: 'بحث وإضافة وتعديل العناوين' },
].filter(item => item.show));

onMounted(async () => {
  await Promise.allSettled([
    connectivity.check(),
    waiterApi.orders().then(data => { orders.value = data; }),
    auth.permissions.can_tables ? waiterApi.tables().then(data => { tables.value = data; }) : Promise.resolve(),
    auth.permissions.can_print ? waiterApi.printers().then(data => { printerOnline.value = data.some(printer => printer.active); }).catch(() => { printerOnline.value = false; }) : Promise.resolve(),
    waiterApi.shift().then(data => { shift.value = data; }),
  ]);
});
</script>

<template>
  <div class="page stack">
    <div class="page-head">
      <div><h1>أهلًا {{ auth.user?.name?.split(' ')[0] }}</h1><p>{{ auth.business?.name }} — {{ auth.location?.name }}</p></div>
      <button v-if="settings.settings.screens.pos && auth.permissions.can_sell" class="btn btn-primary" @click="router.push('/pos')">＋ طلب جديد</button>
    </div>

    <section class="metric-grid">
      <div class="metric-card"><span class="muted">حالة الاتصال</span><strong :class="connectivity.online ? 'success-text' : 'error-text'">{{ connectivity.online ? 'متصل' : 'أوفلاين' }}</strong><small>آخر فحص الآن</small></div>
      <div class="metric-card"><span class="muted">الوردية</span><strong>{{ shift?.active ? 'مفتوحة' : 'مغلقة' }}</strong><small>{{ shift?.ordersCount || 0 }} طلب</small></div>
      <div class="metric-card"><span class="muted">إجمالي الوردية</span><strong>{{ money(shift?.total || 0) }}</strong><small>حسب صلاحية المستخدم</small></div>
      <div class="metric-card"><span class="muted">المزامنة</span><strong>{{ sync.pendingCount + sync.reviewCount }}</strong><small>{{ sync.reviewCount ? 'تحتاج مراجعة' : 'عمليات معلقة' }}</small></div>
      <div v-if="auth.permissions.can_tables" class="metric-card"><span class="muted">الطاولات المشغولة</span><strong>{{ occupiedTables }}</strong><small>من {{ tables.length }} طاولة</small></div>
      <div class="metric-card"><span class="muted">استلام مفتوح</span><strong>{{ openPickups }}</strong><small>ينتظر التجهيز أو التحصيل</small></div>
      <div v-if="auth.permissions.can_print" class="metric-card"><span class="muted">الطباعة</span><strong :class="printerOnline ? 'success-text' : 'error-text'">{{ printerOnline === null ? '—' : printerOnline ? 'جاهزة' : 'تحتاج مراجعة' }}</strong><small>حسب إعدادات طابعات الفرع</small></div>
    </section>

    <section>
      <div class="page-head"><div><h2>الوصول السريع</h2><p>أكثر العمليات استخدامًا أثناء الوردية</p></div></div>
      <div class="quick-grid">
        <button v-for="action in quickActions" :key="action.to" class="quick-card" @click="router.push(action.to)">
          <span class="quick-icon"><AppIcon :name="action.icon" :size="25" /></span><strong>{{ action.title }}</strong><span class="muted">{{ action.text }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="page-head"><div><h2>آخر الطلبات</h2><p>نظرة سريعة على آخر النشاط</p></div><button class="btn btn-secondary" @click="router.push('/orders')">عرض الكل</button></div>
      <div class="stack">
        <article v-for="order in recentOrders" :key="order.id" class="list-card">
          <span class="avatar">#</span>
          <div class="main"><h3>{{ order.invoiceNo }} — {{ order.customerName || order.tableName || 'طلب مباشر' }}</h3><p>{{ order.status }} · {{ formatTime(order.createdAt) }}</p></div>
          <span class="badge" :class="order.paymentStatus === 'paid' ? 'success' : 'warning'">{{ order.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق' }}</span>
          <strong>{{ money(order.total) }}</strong>
        </article>
        <div v-if="!orders.length" class="empty-state">لا توجد طلبات بعد</div>
      </div>
    </section>
  </div>
</template>
