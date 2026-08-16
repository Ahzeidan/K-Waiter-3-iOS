import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { waiterApi, type BootstrapResponse } from '@/app/services/waiter-api';
import { appPreferences } from '@/app/services/preferences';
import { secureStorage } from '@/app/services/secure-storage';
import { DEMO_MODE_ENABLED } from '@/app/config/features';
import { DEFAULT_PERMISSIONS, type PermissionSet, type SessionUser } from '@/shared/domain';
import { setActiveDataScope } from '@/app/services/data-scope';
import { localDatabase } from '@/app/services/local-database';
import { ApiError } from '@/app/services/api-client';

function bootstrapCacheKey(serverUrl: string): string {
  return `auth-bootstrap:${serverUrl.trim().toLocaleLowerCase()}`;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const permissions = ref<PermissionSet>({ ...DEFAULT_PERMISSIONS });
  const business = ref<BootstrapResponse['business'] | null>(null);
  const location = ref<BootstrapResponse['location'] | null>(null);
  const realtime = ref<BootstrapResponse['realtime'] | null>(null);
  const initialized = ref(false);
  const busy = ref(false);
  const error = ref('');
  const authenticated = computed(() => user.value !== null);

  function applyBootstrap(data: BootstrapResponse): void {
    setActiveDataScope(data.user);
    user.value = data.user;
    permissions.value = { ...DEFAULT_PERMISSIONS, ...data.permissions };
    business.value = data.business;
    location.value = data.location;
    realtime.value = data.realtime ?? null;
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return;
    const [serverUrl, token] = await Promise.all([
      appPreferences.getServerUrl(),
      secureStorage.get('access_token'),
    ]);
    if (DEMO_MODE_ENABLED && serverUrl === 'demo://local' && token === 'demo-token') {
      applyBootstrap(await waiterApi.bootstrap());
    } else if (serverUrl && token) {
      try {
        const bootstrap = await waiterApi.bootstrap();
        applyBootstrap(bootstrap);
        await localDatabase.put('keyvalue', bootstrapCacheKey(serverUrl), bootstrap);
      } catch (reason) {
        const cached = await localDatabase.get<BootstrapResponse>('keyvalue', bootstrapCacheKey(serverUrl));
        if (cached) applyBootstrap(cached);
        else if (reason instanceof ApiError && reason.status === 401) await secureStorage.clear();
      }
    }
    initialized.value = true;
  }

  async function login(payload: { serverUrl: string; username: string; password: string; deviceName: string }): Promise<void> {
    busy.value = true;
    error.value = '';
    try {
      await appPreferences.setServerUrl(payload.serverUrl);
      const deviceId = await appPreferences.getDeviceId();
      const response = await waiterApi.login(payload.username, payload.password, deviceId, payload.deviceName);
      await secureStorage.set('access_token', response.accessToken);
      if (response.refreshToken) await secureStorage.set('refresh_token', response.refreshToken);
      applyBootstrap(response.bootstrap);
      await localDatabase.put('keyvalue', bootstrapCacheKey(payload.serverUrl), response.bootstrap);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول';
      throw reason;
    } finally {
      busy.value = false;
    }
  }

  async function loginDemo(): Promise<void> {
    if (!DEMO_MODE_ENABLED) throw new Error('الوضع التجريبي غير متاح في نسخة الإنتاج');
    await login({ serverUrl: 'demo://local', username: 'demo', password: 'demo', deviceName: 'تابلت تجريبي' });
  }

  async function logout(): Promise<void> {
    const serverUrl = await appPreferences.getServerUrl();
    await waiterApi.logout().catch(() => undefined);
    await secureStorage.clear();
    if (serverUrl) await localDatabase.delete('keyvalue', bootstrapCacheKey(serverUrl));
    user.value = null;
    permissions.value = { ...DEFAULT_PERMISSIONS };
    business.value = null;
    location.value = null;
    realtime.value = null;
    setActiveDataScope(null);
  }

  return { user, permissions, business, location, realtime, initialized, busy, error, authenticated, initialize, login, loginDemo, logout };
});
