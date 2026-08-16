<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { waiterApi } from '@/app/services/waiter-api';
import type { Customer, CustomerAddress } from '@/shared/domain';
import CustomerPickerModal from '@/features/customers/CustomerPickerModal.vue';

const auth = useAuthStore();
const term = ref('');
const results = ref<Customer[]>([]);
const loading = ref(false);
const searched = ref(false);
const picker = ref(false);
const selected = ref<Customer | null>(null);
const error = ref('');
let timer: number | null = null;
let requestId = 0;

watch(term, query => {
  if (timer !== null) clearTimeout(timer);
  if (query.trim().length < 2) { results.value = []; searched.value = false; return; }
  timer = window.setTimeout(async () => {
    const current = ++requestId;
    loading.value = true; searched.value = true;
    error.value = '';
    try { const customers = await waiterApi.customers(query.trim()); if (current === requestId) results.value = customers; }
    catch (reason) { if (current === requestId) error.value = reason instanceof Error ? reason.message : 'تعذر البحث عن العميل'; }
    finally { if (current === requestId) loading.value = false; }
  }, 280);
});

function picked(payload: { customer: Customer; address: CustomerAddress | null }): void {
  selected.value = payload.customer; picker.value = false; term.value = payload.customer.mobile;
}
</script>

<template>
  <div class="page stack customers-page">
    <div class="page-head"><div><h1>العملاء والعناوين</h1><p>بحث مباشر بالاسم أو أي جزء من رقم الهاتف</p></div><button class="btn btn-primary" @click="selected = null; picker = true">＋ إضافة عميل</button></div>
    <section class="card stack">
      <label class="catalog-search"><span>⌕</span><input v-model="term" autofocus placeholder="اكتب حرفين على الأقل…" /><button v-if="term" @click="term=''">×</button></label>
      <p class="search-help">لن تظهر قائمة «آخر العملاء»؛ النتائج تظهر فقط بعد البحث.</p>
      <p v-if="error" class="error-text">{{ error }}</p>
      <div v-if="loading" class="empty-state">جاري البحث…</div>
      <button v-for="customer in results" v-else :key="customer.id" class="customer-result" @click="selected=customer; picker=true"><span class="avatar">{{ customer.name.slice(0,1) }}</span><span class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.mobile }} {{ customer.alternateNumber ? `· ${customer.alternateNumber}` : '' }}</small></span><span>‹</span></button>
      <div v-if="searched && !loading && !results.length" class="empty-state">لا يوجد عميل مطابق</div>
      <div v-if="!searched && !loading" class="empty-state"><span class="empty-icon">♟</span>ابدأ بالبحث عن العميل</div>
    </section>
    <CustomerPickerModal :open="picker" order-type="delivery" :selected-customer-id="selected?.id || null" :selected-address-id="null" :initial-customer="selected" :can-manage="auth.permissions.can_manage_customers" @close="picker=false" @select="picked" />
  </div>
</template>
