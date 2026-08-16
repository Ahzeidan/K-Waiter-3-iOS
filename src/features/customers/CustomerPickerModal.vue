<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { waiterApi } from '@/app/services/waiter-api';
import type { Customer, CustomerAddress, OrderType } from '@/shared/domain';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  open: boolean;
  orderType: OrderType;
  selectedCustomerId: number | null;
  selectedAddressId: number | null;
  initialCustomer?: Customer | null;
  canManage: boolean;
}>();
const emit = defineEmits<{
  close: [];
  select: [payload: { customer: Customer; address: CustomerAddress | null }];
}>();

type View = 'search' | 'customer' | 'address';
const view = ref<View>('search');
const term = ref('');
const loading = ref(false);
const searched = ref(false);
const error = ref('');
const results = ref<Customer[]>([]);
const selected = ref<Customer | null>(null);
const addresses = ref<CustomerAddress[]>([]);
const editingCustomerId = ref<number | null>(null);
const editingAddressId = ref<number | null>(null);
const customerForm = reactive({ name: '', mobile: '', alternateNumber: '' });
const addressForm = reactive({ label: 'المنزل', area: '', block: '', street: '', avenue: '', building: '', floor: '', apartment: '', landmark: '', notes: '', isDefault: false });
let timer: number | null = null;
let requestId = 0;

const needsAddress = computed(() => props.orderType === 'delivery');

watch(() => props.open, open => {
  if (!open) return;
  view.value = 'search';
  error.value = '';
  if (props.initialCustomer) {
    selected.value = props.initialCustomer;
    term.value = props.initialCustomer.mobile;
    if (needsAddress.value) void loadAddresses(props.initialCustomer);
  } else if (!props.selectedCustomerId) {
    selected.value = null;
    addresses.value = [];
  }
});

watch(term, () => {
  if (timer !== null) window.clearTimeout(timer);
  const query = term.value.trim();
  error.value = '';
  if (query.length < 2) {
    results.value = [];
    searched.value = false;
    return;
  }
  timer = window.setTimeout(() => { void search(); }, 280);
});

async function search(): Promise<void> {
  const query = term.value.trim();
  if (query.length < 2) return;
  const current = ++requestId;
  loading.value = true;
  searched.value = true;
  try {
    const customers = await waiterApi.customers(query);
    if (current === requestId) results.value = customers;
  } catch (reason) {
    if (current === requestId) error.value = reason instanceof Error ? reason.message : 'تعذر البحث عن العميل';
  } finally {
    if (current === requestId) loading.value = false;
  }
}

async function chooseCustomer(customer: Customer): Promise<void> {
  selected.value = customer;
  error.value = '';
  if (!needsAddress.value) {
    emit('select', { customer, address: null });
    return;
  }
  await loadAddresses(customer);
}

async function loadAddresses(customer: Customer): Promise<void> {
  loading.value = true;
  try {
    addresses.value = (customer.addresses?.length
      ? customer.addresses
      : await waiterApi.customerAddresses(customer.id)).slice().sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'تعذر تحميل عناوين العميل';
    addresses.value = [];
  } finally { loading.value = false; }
}

function changeCustomer(): void {
  selected.value = null;
  addresses.value = [];
  term.value = '';
  searched.value = false;
}

function chooseAddress(address: CustomerAddress): void {
  if (selected.value) emit('select', { customer: selected.value, address });
}

function openCustomerForm(customer?: Customer): void {
  editingCustomerId.value = customer?.id ?? null;
  customerForm.name = customer?.name ?? '';
  customerForm.mobile = customer?.mobile ?? '';
  customerForm.alternateNumber = customer?.alternateNumber ?? '';
  error.value = '';
  view.value = 'customer';
}

async function saveCustomer(): Promise<void> {
  if (!customerForm.name.trim() || !customerForm.mobile.trim()) {
    error.value = 'اسم العميل ورقم الهاتف مطلوبان'; return;
  }
  loading.value = true;
  try {
    const alternateNumber = customerForm.alternateNumber.trim();
    const payload = {
      name: customerForm.name.trim(),
      mobile: customerForm.mobile.trim(),
      ...(alternateNumber ? { alternateNumber } : {}),
    };
    const customer = editingCustomerId.value
      ? await waiterApi.updateCustomer(editingCustomerId.value, payload)
      : await waiterApi.createCustomer(payload);
    view.value = 'search';
    term.value = customer.mobile;
    await chooseCustomer(customer);
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر حفظ العميل'; }
  finally { loading.value = false; }
}

function openAddressForm(address?: CustomerAddress): void {
  editingAddressId.value = address?.id ?? null;
  const fields = ['label', 'area', 'block', 'street', 'avenue', 'building', 'floor', 'apartment', 'landmark', 'notes'] as const;
  fields.forEach(key => { addressForm[key] = address?.[key] ?? (key === 'label' ? 'المنزل' : ''); });
  addressForm.isDefault = address?.isDefault ?? !addresses.value.length;
  error.value = '';
  view.value = 'address';
}

async function saveAddress(): Promise<void> {
  if (!selected.value) return;
  if (!addressForm.label.trim() || !addressForm.area.trim()) { error.value = 'اسم العنوان والمنطقة مطلوبان'; return; }
  loading.value = true;
  try {
    const payload: Omit<CustomerAddress, 'id' | 'customerId'> = {
      label: addressForm.label.trim(), area: addressForm.area.trim(), block: addressForm.block.trim(),
      street: addressForm.street.trim(), avenue: addressForm.avenue.trim(), building: addressForm.building.trim(),
      floor: addressForm.floor.trim(), apartment: addressForm.apartment.trim(), landmark: addressForm.landmark.trim(),
      notes: addressForm.notes.trim(),
      isDefault: addressForm.isDefault,
    };
    const address = editingAddressId.value
      ? await waiterApi.updateAddress(selected.value.id, editingAddressId.value, payload)
      : await waiterApi.createAddress(selected.value.id, payload);
    const normalized = address.isDefault ? addresses.value.map(item => ({ ...item, isDefault: false })) : addresses.value;
    addresses.value = (editingAddressId.value
      ? normalized.map(item => item.id === address.id ? address : item)
      : [...normalized, address]).sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
    view.value = 'search';
    chooseAddress(address);
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'تعذر حفظ العنوان'; }
  finally { loading.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <section class="modal customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-title">
        <header class="modal-head">
          <div class="avatar"><AppIcon name="user" :size="21" /></div>
          <div class="grow"><h2 id="customer-title">{{ view === 'search' ? 'اختيار العميل' : view === 'customer' ? (editingCustomerId ? 'تعديل العميل' : 'عميل جديد') : (editingAddressId ? 'تعديل العنوان' : 'عنوان جديد') }}</h2><small class="muted">{{ needsAddress ? 'اختر العميل ثم عنوان التوصيل' : 'ابحث بالاسم أو رقم الهاتف' }}</small></div>
          <button class="icon-button" aria-label="إغلاق" @click="emit('close')"><AppIcon name="close" /></button>
        </header>

        <div v-if="view === 'search'" class="modal-body stack">
          <div class="customer-search-row">
            <AppIcon class="search-icon" name="search" :size="23" />
            <input v-model="term" autofocus inputmode="search" placeholder="اكتب الاسم أو أي جزء من رقم الهاتف" />
            <button v-if="term" class="icon-button" aria-label="مسح البحث" @click="term = ''"><AppIcon name="close" /></button>
          </div>
          <p class="search-help">ابدأ بكتابة حرفين على الأقل. لا يتم عرض عملاء عشوائيين أو آخر 12 عميل.</p>
          <p v-if="error" class="error-text">{{ error }}</p>

          <div v-if="selected" class="selected-customer card">
            <div class="row"><span class="avatar">{{ selected.name.slice(0, 1) }}</span><div class="grow"><strong>{{ selected.name }}</strong><small>{{ selected.mobile }}</small></div><button class="btn btn-soft" @click="changeCustomer">تغيير</button><button v-if="canManage" class="btn btn-secondary" @click="openCustomerForm(selected)">تعديل</button></div>
            <template v-if="needsAddress"><h3>عناوين العميل</h3>
            <div class="address-grid">
              <button v-for="address in addresses" :key="address.id" class="address-card" :class="{ active: address.id === selectedAddressId }" @click="chooseAddress(address)">
                <strong>{{ address.label }} <span v-if="address.isDefault" class="badge success">افتراضي</span></strong><span>{{ address.area }} · قطعة {{ address.block || '—' }} · {{ address.street || 'بدون شارع' }}</span>
                <small v-if="address.building">مبنى {{ address.building }} {{ address.floor ? `· دور ${address.floor}` : '' }}</small>
                <span v-if="canManage" class="address-edit" @click.stop="openAddressForm(address)">تعديل</span>
              </button>
              <button v-if="canManage" class="address-card add" @click="openAddressForm()">＋ إضافة عنوان</button>
            </div>
            <div v-if="!addresses.length" class="empty-state"><span class="empty-icon">⌖</span>لا توجد عناوين لهذا العميل<button v-if="canManage" class="btn btn-primary" @click="openAddressForm()">إضافة أول عنوان</button></div>
            </template>
            <button v-else class="btn btn-primary btn-block" @click="emit('select', { customer: selected, address: null })">اختيار هذا العميل</button>
          </div>

          <div v-else class="customer-results">
            <div v-if="loading" class="empty-state">جاري البحث…</div>
            <button v-for="customer in results" v-else :key="customer.id" class="customer-result" @click="chooseCustomer(customer)">
              <span class="avatar">{{ customer.name.slice(0, 1) }}</span><span class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.mobile }}<template v-if="customer.alternateNumber"> · {{ customer.alternateNumber }}</template></small></span><AppIcon name="back" :size="18" />
            </button>
            <div v-if="searched && !loading && !results.length" class="empty-state"><AppIcon class="empty-icon" name="search" :size="38" />لم نجد عميلًا مطابقًا<button v-if="canManage" class="btn btn-primary" @click="openCustomerForm()">＋ إضافة عميل جديد</button></div>
            <div v-if="!searched && !loading" class="empty-state compact"><AppIcon class="empty-icon" name="user" :size="38" />اكتب اسم العميل أو رقم الهاتف للبحث</div>
          </div>
        </div>

        <form v-else-if="view === 'customer'" class="modal-body stack" @submit.prevent="saveCustomer">
          <div class="form-grid">
            <label class="field"><span>اسم العميل *</span><input v-model="customerForm.name" autofocus required /></label>
            <label class="field"><span>رقم الهاتف *</span><input v-model="customerForm.mobile" inputmode="tel" required /></label>
            <label class="field"><span>رقم بديل</span><input v-model="customerForm.alternateNumber" inputmode="tel" /></label>
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
          <div class="row"><button type="button" class="btn btn-secondary" @click="view = 'search'">رجوع</button><button class="btn btn-primary" :disabled="loading">حفظ العميل</button></div>
        </form>

        <form v-else class="modal-body stack" @submit.prevent="saveAddress">
          <div class="form-grid">
            <label class="field"><span>اسم العنوان *</span><input v-model="addressForm.label" autofocus placeholder="المنزل أو العمل" required /></label>
            <label class="field"><span>المنطقة *</span><input v-model="addressForm.area" required /></label>
            <label class="field"><span>القطعة</span><input v-model="addressForm.block" /></label>
            <label class="field"><span>الشارع</span><input v-model="addressForm.street" /></label>
            <label class="field"><span>الجادة</span><input v-model="addressForm.avenue" /></label>
            <label class="field"><span>المبنى</span><input v-model="addressForm.building" /></label>
            <label class="field"><span>الدور</span><input v-model="addressForm.floor" /></label>
            <label class="field"><span>الشقة</span><input v-model="addressForm.apartment" /></label>
            <label class="field"><span>علامة مميزة</span><input v-model="addressForm.landmark" /></label>
            <label class="field"><span>ملاحظات</span><input v-model="addressForm.notes" /></label>
            <label class="switch-row"><span><strong>العنوان الافتراضي</strong><small class="muted">يظهر أولًا عند طلب التوصيل</small></span><input v-model="addressForm.isDefault" class="switch" type="checkbox" /></label>
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
          <div class="row"><button type="button" class="btn btn-secondary" @click="view = 'search'">رجوع</button><button class="btn btn-primary" :disabled="loading">حفظ العنوان</button></div>
        </form>

        <footer v-if="view === 'search' && canManage && !selected" class="modal-foot"><button class="btn btn-primary btn-block" @click="openCustomerForm()">＋ إضافة عميل جديد</button></footer>
      </section>
    </div>
  </Teleport>
</template>
