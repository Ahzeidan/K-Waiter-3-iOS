import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiClient } from '@/app/services/api-client';
import { appPreferences } from '@/app/services/preferences';
import { DEMO_MODE_ENABLED } from '@/app/config/features';

export const useConnectivityStore = defineStore('connectivity', () => {
  const browserOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const serverReachable = ref<boolean | null>(null);
  const checking = ref(false);
  const lastCheckedAt = ref<number | null>(null);
  const online = computed(() => browserOnline.value && serverReachable.value !== false);

  function bind(): void {
    window.addEventListener('online', () => { browserOnline.value = true; void check(); });
    window.addEventListener('offline', () => { browserOnline.value = false; serverReachable.value = false; });
  }

  async function check(): Promise<boolean> {
    checking.value = true;
    try {
      const url = await appPreferences.getServerUrl();
      if (DEMO_MODE_ENABLED && url === 'demo://local') return (serverReachable.value = true);
      await apiClient.get('/api/waiter/v3/health', { timeoutMs: 5000, skipAuth: true });
      return (serverReachable.value = true);
    } catch {
      return (serverReachable.value = false);
    } finally {
      checking.value = false;
      lastCheckedAt.value = Date.now();
    }
  }

  return { browserOnline, serverReachable, checking, lastCheckedAt, online, bind, check };
});
