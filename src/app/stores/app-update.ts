import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { appPreferences } from '@/app/services/preferences';
import { normalizeAppRelease, type AppReleaseInfo } from '@/app/services/app-update';
import { waiterApi } from '@/app/services/waiter-api';
import { useSettingsStore } from '@/app/stores/settings';
import { APP_VERSION } from '@/shared/version';

const CACHE_KEY = 'kw3.app_update_cache';
const DISMISSED_KEY = 'kw3.app_update_dismissed';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface CachedRelease {
  checkedAt: number;
  release: AppReleaseInfo;
}

export const useAppUpdateStore = defineStore('app-update', () => {
  const release = ref<AppReleaseInfo | null>(null);
  const checking = ref(false);
  const checked = ref(false);
  const error = ref('');
  const dismissedVersion = ref('');
  const sessionHidden = ref(false);
  const visible = computed(() => Boolean(
    release.value?.updateAvailable
    && !sessionHidden.value
    && (release.value.updateRequired || release.value.latestVersion !== dismissedVersion.value),
  ));
  const actionable = computed(() => Boolean(release.value?.updateUrl));

  async function readCache(): Promise<CachedRelease | null> {
    const raw = (await Preferences.get({ key: CACHE_KEY })).value;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<CachedRelease>;
      if (!parsed.release || !Number.isFinite(parsed.checkedAt)) return null;
      return { checkedAt: Number(parsed.checkedAt), release: normalizeAppRelease(parsed.release) };
    } catch { return null; }
  }

  async function check(force = false): Promise<AppReleaseInfo | null> {
    if (checking.value) return release.value;
    checking.value = true;
    error.value = '';
    try {
      dismissedVersion.value = (await Preferences.get({ key: DISMISSED_KEY })).value ?? '';
      const cached = await readCache();
      if (cached) release.value = cached.release;
      const serverUrl = await appPreferences.getServerUrl();
      if (!serverUrl || serverUrl === 'demo://local') return release.value;
      if (!force && cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) return release.value;

      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      const next = normalizeAppRelease(await waiterApi.appVersion(platform, APP_VERSION));
      release.value = next;
      await Preferences.set({ key: CACHE_KEY, value: JSON.stringify({ checkedAt: Date.now(), release: next }) });
      return next;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'تعذر فحص التحديثات';
      return release.value;
    } finally {
      checked.value = true;
      checking.value = false;
    }
  }

  async function dismiss(): Promise<void> {
    if (!release.value || release.value.updateRequired) return;
    dismissedVersion.value = release.value.latestVersion;
    await Preferences.set({ key: DISMISSED_KEY, value: dismissedVersion.value });
  }

  async function install(): Promise<void> {
    const url = release.value?.updateUrl;
    if (!url) return;
    await Browser.open({ url, presentationStyle: 'popover' });
  }

  function continueTemporarily(): void {
    if (!actionable.value) sessionHidden.value = true;
  }

  const notes = computed(() => {
    const language = useSettingsStore().settings.language;
    return release.value?.releaseNotes[language] ?? [];
  });

  return { release, checking, checked, error, visible, actionable, notes, check, dismiss, install, continueTemporarily };
});
