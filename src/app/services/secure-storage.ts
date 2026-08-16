import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

const nativeSecureStorage = registerPlugin<SecureStoragePlugin>('KemetSecureStorage');
const FALLBACK_PREFIX = 'kw3.secure.';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try { return (await nativeSecureStorage.get({ key })).value; }
      catch { /* Keep development builds usable until the native plugin is installed. */ }
    }
    return (await Preferences.get({ key: `${FALLBACK_PREFIX}${key}` })).value;
  },

  async set(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try { await nativeSecureStorage.set({ key, value }); return; }
      catch { /* Use Preferences only as a compatibility fallback. */ }
    }
    await Preferences.set({ key: `${FALLBACK_PREFIX}${key}`, value });
  },

  async remove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try { await nativeSecureStorage.remove({ key }); }
      catch { /* Continue to remove the fallback copy. */ }
    }
    await Preferences.remove({ key: `${FALLBACK_PREFIX}${key}` });
  },

  async clear(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try { await nativeSecureStorage.clear(); }
      catch { /* Native plugin may not exist in a browser build. */ }
    }
    await Promise.all(['access_token', 'refresh_token', 'device_token'].map(key =>
      Preferences.remove({ key: `${FALLBACK_PREFIX}${key}` }),
    ));
  },
};
