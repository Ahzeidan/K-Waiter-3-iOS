<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSyncStore } from '@/app/stores/sync';
import { appPreferences } from '@/app/services/preferences';
import { waiterApi } from '@/app/services/waiter-api';
import { diagnostics } from '@/app/services/diagnostics';
import { useAuthStore } from '@/app/stores/auth';
import { useNotificationsStore } from '@/app/stores/notifications';
import { APP_VERSION } from '@/shared/version';
import { useSettingsStore } from '@/app/stores/settings';
import { checkDirectPrinterConnection, isDirectPrintingMode } from '@/app/services/direct-printing';
import { useAppUpdateStore } from '@/app/stores/app-update';

const connectivity = useConnectivityStore();
const sync = useSyncStore();
const auth = useAuthStore();
const notifications = useNotificationsStore();
const settings = useSettingsStore();
const updater = useAppUpdateStore();
const serverUrl = ref('');
const printerCount = ref<number | null>(null);
const diagnosticCount = ref(0);
const platform = Capacitor.getPlatform();
const checks = computed(() => [
  { label: 'اتصال الإنترنت', ok: connectivity.browserOnline, detail: connectivity.browserOnline ? 'متاح' : 'غير متاح' },
  { label: 'اتصال السيرفر', ok: connectivity.serverReachable === true, detail: connectivity.serverReachable === null ? 'لم يُفحص' : connectivity.serverReachable ? 'متصل' : 'غير متصل' },
  { label: 'طابور المزامنة', ok: sync.reviewCount === 0, detail: `${sync.pendingCount} معلقة · ${sync.reviewCount} مراجعة` },
  { label: isDirectPrintingMode(settings.settings.printing.mode) ? 'الطابعة المباشرة' : 'الطابعات', ok: printerCount.value !== 0, detail: printerCount.value === null ? 'لم تُفحص أو لا توجد صلاحية' : settings.settings.printing.mode === 'tcp' ? (printerCount.value ? `${settings.settings.printing.directHost}:${settings.settings.printing.directPort} متصلة` : 'غير متصلة') : settings.settings.printing.mode === 'bluetooth' ? (printerCount.value ? `${settings.settings.printing.bluetoothName || settings.settings.printing.bluetoothAddress} متصلة` : 'غير متصلة') : `${printerCount.value} طابعة متاحة` },
  { label: 'تقارير الأعطال المحلية', ok: diagnosticCount.value === 0, detail: diagnosticCount.value ? `${diagnosticCount.value} تنتظر الإرسال` : 'لا توجد أخطاء معلقة' },
  { label: 'التحديث اللحظي', ok: !notifications.realtimeEnabled || notifications.realtimeConnected, detail: notifications.realtimeEnabled ? (notifications.realtimeConnected ? 'WebSocket متصل' : 'يستخدم polling الاحتياطي') : 'polling الاحتياطي مفعّل' },
  { label: 'المنصة', ok: true, detail: platform },
  { label: 'إصدار التطبيق', ok: true, detail: APP_VERSION },
  {
    label: 'تحديث التطبيق',
    ok: updater.release ? !updater.release.updateRequired : !updater.error,
    detail: updater.checking
      ? 'جاري فحص التحديث…'
      : updater.release?.updateAvailable
        ? `الإصدار ${updater.release.latestVersion} متاح${updater.release.updateRequired ? ' — مطلوب' : ''}`
        : updater.release ? 'أنت تستخدم أحدث إصدار' : updater.error || 'لم تتوفر معلومات التحديث',
  },
]);

async function runChecks(): Promise<void> {
  serverUrl.value = await appPreferences.getServerUrl();
  const tasks: Promise<unknown>[] = [
    connectivity.check(),
    sync.load(),
    updater.check(true),
    diagnostics.events().then(value => { diagnosticCount.value = value.length; }),
  ];
  if (auth.permissions.can_print && isDirectPrintingMode(settings.settings.printing.mode)) {
    tasks.push(checkDirectPrinterConnection(settings.settings.printing).then(() => { printerCount.value = 1; }).catch(() => { printerCount.value = 0; }));
  } else if (auth.permissions.can_print && settings.settings.printing.mode === 'server') {
    tasks.push(waiterApi.printers().then(value => { printerCount.value = value.filter(item => item.active).length; }).catch(() => { printerCount.value = 0; }));
  }
  await Promise.all(tasks);
}

onMounted(runChecks);
</script>

<template>
  <div class="page stack"><div class="page-head"><div><h1>صحة الجهاز</h1><p>فحص سريع قبل بدء الوردية</p></div><button class="btn btn-primary" :disabled="updater.checking" @click="runChecks">{{ updater.checking ? 'جاري الفحص…' : 'إعادة الفحص' }}</button></div><section class="card"><article v-for="check in checks" :key="check.label" class="health-row"><span :class="check.ok ? 'health-ok' : 'health-bad'">{{ check.ok ? '✓' : '!' }}</span><div class="grow"><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></div></article></section><section class="card"><h2>السيرفر</h2><p class="muted">{{ serverUrl || 'غير مضبوط' }}</p><h2>المساعدة</h2><p class="muted">عند الإبلاغ عن مشكلة أرسل اسم التابلت، وقت المشكلة، ورقم الطلب فقط. لا ترسل كلمة المرور.</p></section></div>
</template>
