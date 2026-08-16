<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/app/stores/notifications';
import { money } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const notifications = useNotificationsStore();

function openPickup(id: number): void {
  notifications.panelOpen = false;
  void router.push(`/pos?order=${id}`);
}
</script>

<template>
  <button class="notification-button" aria-label="التنبيهات" @click="notifications.panelOpen = !notifications.panelOpen">
    <AppIcon name="receipt" :size="21" /><b v-if="notifications.unread">{{ notifications.unread > 99 ? '99+' : notifications.unread }}</b>
  </button>
  <Teleport to="body">
    <div v-if="notifications.panelOpen" class="notification-backdrop" @click.self="notifications.panelOpen = false">
      <aside class="notification-panel">
        <header><div><h2>التنبيهات</h2><small>تتحدث تلقائيًا أثناء تشغيل التطبيق</small></div><button class="icon-button" aria-label="إغلاق" @click="notifications.panelOpen = false"><AppIcon name="close" /></button></header>
        <div class="notification-list">
          <article v-for="call in notifications.snapshot.waiterCalls" :key="`call-${call.id}`" class="notification-item urgent">
            <span class="notification-icon"><AppIcon name="tables" :size="22" /></span><div class="grow"><strong>نداء من {{ call.tableName }}</strong><small>{{ call.note || 'الطاولة تحتاج جارسون' }}</small></div><button class="btn btn-primary" @click="notifications.acknowledge(call.tableId)">استلام</button>
          </article>
          <button v-for="pickup in notifications.snapshot.pickupAssigned" :key="`pickup-${pickup.id}`" class="notification-item" @click="openPickup(pickup.id)">
            <span class="notification-icon"><AppIcon name="pickup" :size="22" /></span><span class="grow"><strong>طلب استلام {{ pickup.invoiceNo || `#${pickup.id}` }}</strong><small>{{ pickup.customer || 'عميل الاستلام' }}<template v-if="pickup.customerMobile"> · {{ pickup.customerMobile }}</template></small><small v-if="pickup.pickupTime">موعد الاستلام: {{ pickup.pickupTime }}</small></span><b v-if="pickup.total != null">{{ money(pickup.total) }}</b>
          </button>
          <div v-if="!notifications.unread" class="empty-state"><span class="empty-icon">✓</span>لا توجد تنبيهات جديدة</div>
        </div>
        <footer><button class="btn btn-secondary btn-block" :disabled="notifications.polling" @click="notifications.poll">{{ notifications.polling ? 'جاري التحديث…' : 'تحديث الآن' }}</button></footer>
      </aside>
    </div>
  </Teleport>
</template>
