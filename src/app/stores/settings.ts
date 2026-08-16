import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { appPreferences } from '@/app/services/preferences';
import { secureStorage } from '@/app/services/secure-storage';
import { waiterApi } from '@/app/services/waiter-api';
import { DEFAULT_DEVICE_SETTINGS, normalizeDeviceSettings } from '@/app/settings/defaults';
import type { DeviceSettings } from '@/shared/domain';
import { setUiLanguage } from '@/app/services/localization';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<DeviceSettings>(structuredClone(DEFAULT_DEVICE_SETTINGS));
  const ready = ref(false);
  const saving = ref(false);
  const remotePending = ref(false);
  const isRtl = computed(() => settings.value.language === 'ar');

  function applyToDocument(): void {
    setUiLanguage(settings.value.language);
    document.documentElement.dataset.theme = settings.value.theme;
  }

  async function load(preferRemote = true): Promise<void> {
    settings.value = await appPreferences.getDeviceSettings();
    const token = preferRemote ? await secureStorage.get('access_token') : null;
    if (token) {
      try {
        const remote = await waiterApi.deviceSettings();
        if (remote && typeof remote === 'object') {
          settings.value = await appPreferences.setDeviceSettings(normalizeDeviceSettings(remote as Partial<DeviceSettings>));
          remotePending.value = false;
        }
      } catch { remotePending.value = true; }
    }
    ready.value = true;
    applyToDocument();
  }

  async function save(next: DeviceSettings): Promise<void> {
    saving.value = true;
    try {
      settings.value = await appPreferences.setDeviceSettings(normalizeDeviceSettings(next));
      applyToDocument();
      try {
        await waiterApi.updateDeviceSettings(settings.value);
        remotePending.value = false;
      } catch { remotePending.value = true; }
    } finally {
      saving.value = false;
    }
  }

  async function reset(): Promise<void> {
    await save(structuredClone(DEFAULT_DEVICE_SETTINGS));
  }

  async function syncRemote(): Promise<void> {
    if (!remotePending.value) return;
    try {
      await waiterApi.updateDeviceSettings(settings.value);
      remotePending.value = false;
    } catch { /* Keep the local copy and retry on the next online event. */ }
  }

  return { settings, ready, saving, remotePending, isRtl, load, save, reset, syncRemote, applyToDocument };
});
