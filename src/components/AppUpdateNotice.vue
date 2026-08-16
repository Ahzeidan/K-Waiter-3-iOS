<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useAppUpdateStore } from '@/app/stores/app-update';
import AppIcon from '@/components/AppIcon.vue';

const updater = useAppUpdateStore();
let timer = 0;
const online = () => { void updater.check(); };

onMounted(() => {
  timer = window.setTimeout(() => { void updater.check(); }, 1200);
  window.addEventListener('online', online);
});
onUnmounted(() => {
  window.clearTimeout(timer);
  window.removeEventListener('online', online);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="updater.visible" class="update-backdrop" role="presentation">
      <section class="update-card" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div class="update-icon"><AppIcon name="cloud-check" :size="32" /></div>
        <div class="grow">
          <span v-if="updater.release?.updateRequired" class="update-required">تحديث مطلوب</span>
          <span v-else class="update-optional">تحديث جديد متاح</span>
          <h2 id="update-title">K-Waiter {{ updater.release?.latestVersion }}</h2>
          <p>حدّث التطبيق للحصول على أحدث تحسينات التشغيل والأمان.</p>
          <ul v-if="updater.notes.length"><li v-for="note in updater.notes" :key="note">{{ note }}</li></ul>
          <p v-if="!updater.actionable" class="update-admin-note">النسخة الجديدة لم تُرفع بعد. تواصل مع مسؤول النظام.</p>
        </div>
        <div class="update-actions">
          <button v-if="!updater.release?.updateRequired" class="btn btn-secondary" @click="updater.dismiss">لاحقًا</button>
          <button v-else-if="!updater.actionable" class="btn btn-secondary" @click="updater.continueTemporarily">متابعة العمل مؤقتًا</button>
          <button v-if="updater.actionable" class="btn btn-primary" @click="updater.install"><AppIcon name="download" :size="18" /> تحديث الآن</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
