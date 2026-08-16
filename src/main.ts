import { createApp, watch } from 'vue';
import App from '@/App.vue';
import router from '@/app/router';
import { pinia } from '@/app/pinia';
import { useConnectivityStore } from '@/app/stores/connectivity';
import { useSyncStore } from '@/app/stores/sync';
import { useSettingsStore } from '@/app/stores/settings';
import { useNotificationsStore } from '@/app/stores/notifications';
import { useAuthStore } from '@/app/stores/auth';
import { useTablesStore } from '@/app/stores/tables';
import { diagnostics } from '@/app/services/diagnostics';
import { directPrintQueue } from '@/app/services/direct-printing';
import { installLocalization } from '@/app/services/localization';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';

const app = createApp(App);
installLocalization();
app.config.errorHandler = (reason, _instance, info) => {
  void diagnostics.capture('error', reason, `vue:${info}`).catch(() => undefined);
  if (import.meta.env.DEV) console.error(reason);
};
app.use(pinia);
app.use(router);

const connectivity = useConnectivityStore(pinia);
const sync = useSyncStore(pinia);
const settings = useSettingsStore(pinia);
const notifications = useNotificationsStore(pinia);
const auth = useAuthStore(pinia);
const tables = useTablesStore(pinia);
connectivity.bind();
diagnostics.bind();
window.addEventListener('online', () => {
  if (auth.authenticated) { void sync.flush(true); void tables.refresh(true); }
  void settings.syncRemote();
});

app.mount('#app');
watch(() => auth.authenticated, authenticated => {
  if (authenticated) { notifications.start(); sync.start(); void tables.load(); }
  else { notifications.stop(); sync.stop(); tables.reset(); }
}, { immediate: true });
void router.isReady().then(() => { directPrintQueue.start(); void diagnostics.flush().catch(() => undefined); });
