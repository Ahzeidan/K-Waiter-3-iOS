<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import NetworkBanner from '@/components/NetworkBanner.vue';
import AppUpdateNotice from '@/components/AppUpdateNotice.vue';

const route = useRoute();
const shell = computed(() => route.meta.shell === true);
</script>

<template>
  <NetworkBanner />
  <AppUpdateNotice />
  <AppShell v-if="shell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>
