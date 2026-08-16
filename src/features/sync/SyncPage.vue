<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSyncStore } from '@/app/stores/sync';
import { directPrintQueue } from '@/app/services/direct-printing';
import type { LocalPrintJob } from '@/shared/domain';

const connectivity = useConnectivityStore();
const sync = useSyncStore();
const printJobs = ref<LocalPrintJob[]>([]);
const activePrintJobs = computed(() => printJobs.value.filter(job => job.status !== 'completed'));
async function loadPrintJobs(): Promise<void> { printJobs.value = await directPrintQueue.jobs(); }
async function retryPrint(jobId: string): Promise<void> { await directPrintQueue.retry(jobId); await loadPrintJobs(); }
const queueChanged = () => { void loadPrintJobs(); };
onMounted(async () => {
  await Promise.all([sync.load(), loadPrintJobs()]);
  window.addEventListener('kwaiter:print-queue-changed', queueChanged);
});
onUnmounted(() => window.removeEventListener('kwaiter:print-queue-changed', queueChanged));
</script>

<template>
  <div class="page stack">
    <div class="page-head"><div><h1>المزامنة</h1><p>الطلبات والعمليات المحفوظة على هذا التابلت</p></div><button class="btn btn-primary" :disabled="!connectivity.online || sync.running" @click="sync.flush(connectivity.online)">↻ مزامنة الآن</button></div>
    <section class="card"><div class="row"><span class="avatar">{{ connectivity.online ? '✓' : '!' }}</span><div class="grow"><strong>{{ connectivity.online ? 'السيرفر متاح' : 'لا يوجد اتصال بالسيرفر' }}</strong><p class="muted">{{ sync.pendingCount }} معلقة · {{ sync.reviewCount }} تحتاج مراجعة</p></div></div></section>
    <div class="stack"><article v-for="operation in sync.operations" :key="operation.id" class="list-card"><span class="avatar">↻</span><div class="main"><h3>{{ operation.kind === 'payment.create' ? 'دفع أوفلاين' : operation.kind === 'order.kot' ? 'إرسال للمطبخ' : operation.kind === 'order.create' ? 'إنشاء طلب' : operation.kind === 'order.update' ? 'تعديل طلب' : operation.kind }} — {{ operation.aggregateId }}</h3><p>محاولة {{ operation.attempts }} · {{ operation.lastError || 'بانتظار التنفيذ' }}</p></div><span class="badge" :class="operation.status === 'review' ? 'danger' : operation.status === 'running' ? 'success' : 'warning'">{{ operation.status }}</span><template v-if="operation.status === 'review' && operation.kind === 'order.update'"><button class="btn btn-secondary" @click="sync.resolveConflict(operation.id, 'server')">استخدام نسخة السيرفر</button><button class="btn btn-primary" @click="sync.resolveConflict(operation.id, 'local')">الاحتفاظ بتعديل التابلت</button></template><button v-else-if="operation.status === 'review'" class="btn btn-secondary" @click="sync.retry(operation.id)">إعادة المحاولة</button></article><div v-if="!sync.operations.length" class="empty-state card"><span class="empty-icon">✓</span>لا توجد عمليات معلقة</div></div>
    <div class="page-head compact"><div><h2>طابور الطباعة المباشرة</h2><p>يعمل داخل الشبكة المحلية ولا يحتاج إلى الإنترنت</p></div><button class="btn btn-secondary" :disabled="!activePrintJobs.length" @click="directPrintQueue.flush(true)">إعادة المحاولة الآن</button></div>
    <div class="stack"><article v-for="job in activePrintJobs" :key="job.id" class="list-card"><span class="avatar">▣</span><div class="main"><h3>{{ job.receipt.invoiceNo }} — {{ job.receipt.temporary ? 'طلب محلي مؤقت' : 'فاتورة' }}</h3><p>محاولة {{ job.attempts }} · {{ job.lastError || 'بانتظار الطابعة' }}</p></div><span class="badge" :class="job.status === 'uncertain' ? 'danger' : job.status === 'printing' ? 'success' : 'warning'">{{ job.status === 'uncertain' ? 'غير مؤكدة' : job.status === 'printing' ? 'تطبع الآن' : 'معلقة' }}</span><button class="btn btn-secondary" @click="retryPrint(job.id)">{{ job.status === 'uncertain' ? 'راجعت الورق — أعد' : 'إعادة' }}</button></article><div v-if="!activePrintJobs.length" class="empty-state card"><span class="empty-icon">✓</span>لا توجد طباعات محلية معلقة</div></div>
  </div>
</template>
