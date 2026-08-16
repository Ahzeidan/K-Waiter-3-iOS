<script setup lang="ts">
import { computed } from 'vue';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSyncStore } from '@/app/stores/sync';

const connectivity = useConnectivityStore();
const sync = useSyncStore();
const visible = computed(() => !connectivity.online || sync.pendingCount > 0 || sync.reviewCount > 0);
</script>

<template>
  <button v-if="visible" class="network-banner" :class="{ danger: sync.reviewCount > 0 }" @click="$router.push('/sync')">
    <span v-if="!connectivity.online">● أوفلاين — العمل محفوظ على التابلت</span>
    <span v-else-if="sync.reviewCount">⚠ {{ sync.reviewCount }} عملية تحتاج مراجعة</span>
    <span v-else>↻ {{ sync.pendingCount }} عملية تنتظر المزامنة</span>
  </button>
</template>
