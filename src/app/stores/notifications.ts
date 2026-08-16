import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { waiterApi } from '@/app/services/waiter-api';
import { realtimeClient } from '@/app/services/realtime';
import { useAuthStore } from '@/app/stores/auth';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSettingsStore } from '@/app/stores/settings';
import type { NotificationSnapshot } from '@/shared/domain';
import { localDatabase } from '@/app/services/local-database';
import { scopedKey } from '@/app/services/data-scope';

const EMPTY: NotificationSnapshot = { waiterCalls: [], pickupAssigned: [], tableUpdate: false, cursor: '' };

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore();
  const connectivity = useConnectivityStore();
  const settings = useSettingsStore();
  const snapshot = ref<NotificationSnapshot>(structuredClone(EMPTY));
  const polling = ref(false);
  const panelOpen = ref(false);
  const lastError = ref('');
  const realtimeEnabled = ref(false);
  const realtimeConnected = ref(false);
  const unread = computed(() => snapshot.value.waiterCalls.length + snapshot.value.pickupAssigned.length);
  let timer: number | null = null;
  let stopped = true;

  async function signal(kind: 'table' | 'pickup'): Promise<void> {
    if (kind === 'table' && !settings.settings.notifications.tableCalls) return;
    if (kind === 'pickup' && !settings.settings.notifications.pickups) return;
    if (settings.settings.notifications.vibration) {
      await Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
    }
    if (settings.settings.notifications.sound) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.035;
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.12);
      } catch { /* Browser may require an earlier user interaction. */ }
    }
  }

  async function poll(): Promise<void> {
    if (polling.value || !auth.authenticated || !connectivity.online || document.hidden) return;
    polling.value = true;
    try {
      const seenKey = scopedKey('seen-notifications');
      const savedIds = await localDatabase.get<string[]>('keyvalue', seenKey) ?? [];
      const previousIds = new Set([
        ...savedIds,
        ...snapshot.value.waiterCalls.map(item => `call-${item.id}`),
        ...snapshot.value.pickupAssigned.map(item => `pickup-${item.id}`),
      ]);
      const next = await waiterApi.notifications(snapshot.value.cursor || undefined);
      const newCalls = next.waiterCalls.map(item => `call-${item.id}`).filter(id => !previousIds.has(id));
      const newPickups = next.pickupAssigned.map(item => `pickup-${item.id}`).filter(id => !previousIds.has(id));
      const nextIds = [...next.waiterCalls.map(item => `call-${item.id}`), ...next.pickupAssigned.map(item => `pickup-${item.id}`)];
      snapshot.value = next;
      lastError.value = '';
      await localDatabase.put('keyvalue', seenKey, [...new Set([...savedIds, ...nextIds])].slice(-500));
      if (newCalls.length) await signal('table');
      if (newPickups.length) await signal('pickup');
    } catch (reason) {
      lastError.value = reason instanceof Error ? reason.message : 'تعذر تحديث التنبيهات';
    } finally { polling.value = false; }
  }

  function schedule(): void {
    if (stopped) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      await poll();
      schedule();
    }, Math.max(10, settings.settings.sync.intervalSeconds) * 1000);
  }

  function start(): void {
    if (stopped) {
      stopped = false;
      schedule();
      document.addEventListener('visibilitychange', visibilityChanged);
    }
    void poll();
    realtimeEnabled.value = realtimeClient.start(auth.realtime, () => { void poll(); }, connected => {
      realtimeConnected.value = connected;
    });
  }

  function stop(): void {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    realtimeClient.stop();
    realtimeEnabled.value = false;
    realtimeConnected.value = false;
    document.removeEventListener('visibilitychange', visibilityChanged);
  }

  function visibilityChanged(): void {
    if (!document.hidden) void poll();
  }

  async function acknowledge(tableId: number): Promise<void> {
    await waiterApi.acknowledgeTableCall(tableId);
    snapshot.value = { ...snapshot.value, waiterCalls: snapshot.value.waiterCalls.filter(item => item.tableId !== tableId) };
  }

  return { snapshot, polling, panelOpen, lastError, unread, realtimeEnabled, realtimeConnected, poll, start, stop, acknowledge };
});
