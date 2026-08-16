import { Preferences } from '@capacitor/preferences';
import type { DeviceSettings } from '@/shared/domain';
import { DEFAULT_DEVICE_SETTINGS, normalizeDeviceSettings } from '@/app/settings/defaults';
import { DEMO_MODE_ENABLED } from '@/app/config/features';

const KEYS = {
  serverUrl: 'kw3.server_url',
  deviceSettings: 'kw3.device_settings',
  deviceId: 'kw3.device_id',
} as const;

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed === 'demo://local') {
    if (DEMO_MODE_ENABLED) return trimmed;
    throw new Error('الوضع التجريبي غير متاح في نسخة الإنتاج');
  }
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('server_url_invalid');
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLoopback) {
    throw new Error('رابط السيرفر يجب أن يستخدم HTTPS لحماية بيانات الدخول والطلبات');
  }
  return url.toString().replace(/\/+$/, '');
}

export const appPreferences = {
  async getServerUrl(): Promise<string> {
    const saved = (await Preferences.get({ key: KEYS.serverUrl })).value ?? '';
    return saved === 'demo://local' && !DEMO_MODE_ENABLED ? '' : saved;
  },

  async setServerUrl(value: string): Promise<string> {
    const normalized = normalizeServerUrl(value);
    await Preferences.set({ key: KEYS.serverUrl, value: normalized });
    return normalized;
  },

  async getDeviceId(): Promise<string> {
    const saved = (await Preferences.get({ key: KEYS.deviceId })).value;
    if (saved) return saved;
    const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    await Preferences.set({ key: KEYS.deviceId, value: next });
    return next;
  },

  async getDeviceSettings(): Promise<DeviceSettings> {
    const raw = (await Preferences.get({ key: KEYS.deviceSettings })).value;
    if (!raw) return structuredClone(DEFAULT_DEVICE_SETTINGS);
    try { return normalizeDeviceSettings(JSON.parse(raw) as Partial<DeviceSettings>); }
    catch { return structuredClone(DEFAULT_DEVICE_SETTINGS); }
  },

  async setDeviceSettings(value: DeviceSettings): Promise<DeviceSettings> {
    const normalized = normalizeDeviceSettings(value);
    await Preferences.set({ key: KEYS.deviceSettings, value: JSON.stringify(normalized) });
    return normalized;
  },
};

export { normalizeServerUrl };
