<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { CartChoice, CartLine, Product } from '@/shared/domain';
import { money } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';
import { sameProductChoice } from '@/features/pos/choice-utils';

const props = defineProps<{ product: Product | null; line?: CartLine | null }>();
const emit = defineEmits<{ close: []; confirm: [payload: { choices: CartChoice[]; note: string; quantity: number }] }>();
const selected = reactive<Record<string, boolean>>({});
const note = ref('');
const error = ref('');
const quantity = ref(1);
const search = ref('');
const collapsed = reactive<Record<number, boolean>>({});

watch(() => [props.product, props.line] as const, () => {
  Object.keys(selected).forEach(key => delete selected[key]);
  props.line?.choices.forEach(savedChoice => {
    let matched = false;
    props.product?.choiceGroups?.forEach(group => group.choices.forEach(choice => {
      if (sameProductChoice(savedChoice, choice)) {
        selected[choiceKey(choice, group.id)] = true;
        matched = true;
      }
    }));
    if (!matched) selected[choiceKey(savedChoice)] = true;
  });
  note.value = props.line?.note ?? '';
  quantity.value = props.line?.quantity ?? 1;
  error.value = '';
  search.value = '';
}, { immediate: true });

function choiceKey(choice: CartChoice, fallbackGroupId = 0): string {
  return choice.clientKey
    || `${choice.kind ?? 'choice'}:${choice.groupId ?? fallbackGroupId}:${choice.variationId ?? choice.id}:${choice.id}`;
}

const choices = computed<CartChoice[]>(() => {
  if (!props.product) return props.line?.choices.map(choice => ({ ...choice })) ?? [];
  return props.product.choiceGroups?.flatMap(group =>
    group.choices
      .filter(choice => selected[choiceKey(choice, group.id)])
      .map(choice => ({ ...choice, groupId: choice.groupId ?? group.id })),
  ) ?? [];
});
const visibleGroups = computed(() => (props.product?.choiceGroups ?? []).filter(group => {
  if (!group.showWhenItemKey) return true;
  return (props.product?.choiceGroups ?? []).some(candidate => candidate.choices.some(choice =>
    choice.clientKey === group.showWhenItemKey && selected[choiceKey(choice, candidate.id)],
  ));
}));
const matchingChoices = (group: NonNullable<Product['choiceGroups']>[number]) => group.choices.filter(choice =>
  !search.value.trim() || `${group.name} ${choice.name}`.toLocaleLowerCase('ar').includes(search.value.trim().toLocaleLowerCase('ar')),
);
const total = computed(() => ((props.product?.price ?? props.line?.unitPrice ?? 0) + choices.value.reduce((sum, item) => sum + item.price, 0)) * quantity.value);

function toggle(groupIndex: number, choiceId: number): void {
  const group = props.product?.choiceGroups?.[groupIndex];
  if (!group) return;
  const target = group.choices.find(choice => choice.id === choiceId);
  if (!target) return;
  error.value = '';
  if (!group.multiple) group.choices.forEach(choice => { selected[choiceKey(choice, group.id)] = choice.id === choiceId; });
  else {
    const key = choiceKey(target, group.id);
    const selectedCount = group.choices.filter(choice => selected[choiceKey(choice, group.id)]).length;
    if (!selected[key] && group.max > 0 && selectedCount >= group.max) {
      error.value = `الحد الأقصى في «${group.name}» هو ${group.max}`;
      return;
    }
    selected[key] = !selected[key];
  }
  for (const hidden of (props.product?.choiceGroups ?? []).filter(group => !visibleGroups.value.includes(group))) {
    hidden.choices.forEach(choice => { delete selected[choiceKey(choice, hidden.id)]; });
  }
}

function groupKindLabel(kind?: 'option' | 'modifier' | 'combo'): string {
  if (kind === 'modifier') return 'إضافات';
  if (kind === 'combo') return 'اختيار الوجبة';
  return 'اختيار المنتج';
}

function groupLimitLabel(group: NonNullable<Product['choiceGroups']>[number]): string {
  if (!group.multiple) return 'اختيار واحد';
  return group.max > 0 ? `حتى ${group.max}` : 'اختيارات متعددة';
}

function confirm(): void {
  for (const group of visibleGroups.value) {
    const count = group.choices.filter(choice => selected[choiceKey(choice, group.id)]).length;
    if (count < group.min || (group.required && count === 0)) { error.value = `اختر من مجموعة «${group.name}»`; return; }
    if (group.max > 0 && count > group.max) { error.value = `الحد الأقصى في «${group.name}» هو ${group.max}`; return; }
  }
  emit('confirm', { choices: choices.value, note: note.value.trim(), quantity: Math.max(1, Math.floor(quantity.value)) });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="product || line" class="modal-backdrop" @click.self="emit('close')">
      <section class="modal" role="dialog" aria-modal="true">
        <header class="modal-head"><div class="grow"><h2>{{ product?.name || line?.name }}</h2><small class="muted">خصص الصنف أو الوجبة ثم أكد الإضافة</small></div><button class="icon-button" aria-label="إغلاق" @click="emit('close')"><AppIcon name="close" :size="20" /></button></header>
        <div class="modal-body stack">
          <label v-if="(product?.choiceGroups?.length || 0) > 2" class="catalog-search"><AppIcon name="search" :size="20" /><input v-model="search" placeholder="ابحث داخل الاختيارات…" /><button v-if="search" aria-label="مسح البحث" @click="search=''"><AppIcon name="close" :size="16" /></button></label>
          <section v-for="group in visibleGroups" :key="group.id" class="choice-group">
            <button class="row choice-group-toggle" :aria-expanded="!collapsed[group.id]" @click="collapsed[group.id] = !collapsed[group.id]"><span class="choice-kind">{{ groupKindLabel(group.kind) }}</span><h3 class="grow">{{ group.name }}</h3><span v-if="group.required" class="badge warning">مطلوب</span><small>{{ groupLimitLabel(group) }}</small><AppIcon :name="collapsed[group.id] ? 'chevron-down' : 'chevron-up'" :size="17" /></button>
            <div v-show="!collapsed[group.id]" class="choice-grid"><button v-for="choice in matchingChoices(group)" :key="choiceKey(choice, group.id)" class="choice-card" :class="{ active: selected[choiceKey(choice, group.id)] }" :aria-pressed="Boolean(selected[choiceKey(choice, group.id)])" @click="toggle((product?.choiceGroups || []).findIndex(item => item.id === group.id), choice.id)"><span>{{ choice.name }}</span><b v-if="choice.price">+ {{ money(choice.price) }}</b><i><AppIcon v-if="selected[choiceKey(choice, group.id)]" name="check" :size="15" /></i></button></div>
          </section>
          <label class="field"><span>ملاحظة الصنف</span><textarea v-model="note" rows="3" placeholder="مثال: بدون بصل، الصوص منفصل"></textarea></label>
          <label class="field"><span>الكمية</span><input v-model.number="quantity" type="number" min="1" max="99" inputmode="numeric" /></label>
          <p v-if="error" class="error-text">{{ error }}</p>
        </div>
        <footer class="modal-foot"><button class="btn btn-secondary" @click="emit('close')">إلغاء</button><button class="btn btn-primary" @click="confirm">تأكيد · {{ money(total) }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>
