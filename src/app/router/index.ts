import { createRouter, createWebHashHistory, type RouteLocationNormalized } from 'vue-router';
import { pinia } from '@/app/pinia';
import { useAuthStore } from '@/app/stores/auth';
import { useSettingsStore } from '@/app/stores/settings';
import type { PermissionSet } from '@/shared/domain';
import SyncPage from '@/features/sync/SyncPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    shell?: boolean;
    permission?: keyof PermissionSet;
    screen?: 'home' | 'pos' | 'tables' | 'pickups' | 'orders' | 'customers' | 'payment' | 'shift';
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0, left: 0 }),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/features/auth/LoginPage.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: () => import('@/features/home/HomePage.vue'), meta: { shell: true, screen: 'home' } },
    { path: '/pos', name: 'pos', component: () => import('@/features/pos/PosPage.vue'), meta: { shell: true, permission: 'can_sell', screen: 'pos' } },
    { path: '/tables', name: 'tables', component: () => import('@/features/tables/TablesPage.vue'), meta: { shell: true, permission: 'can_tables', screen: 'tables' } },
    { path: '/pickups', name: 'pickups', component: () => import('@/features/pickups/PickupsPage.vue'), meta: { shell: true, screen: 'pickups' } },
    { path: '/orders', name: 'orders', component: () => import('@/features/orders/OrdersPage.vue'), meta: { shell: true, permission: 'can_orders', screen: 'orders' } },
    { path: '/customers', name: 'customers', component: () => import('@/features/customers/CustomersPage.vue'), meta: { shell: true, screen: 'customers' } },
    { path: '/payment/:id', name: 'payment', component: () => import('@/features/payment/PaymentPage.vue'), meta: { shell: true, permission: 'can_pay', screen: 'payment' } },
    { path: '/shift', name: 'shift', component: () => import('@/features/shift/ShiftPage.vue'), meta: { shell: true, permission: 'can_shift', screen: 'shift' } },
    { path: '/settings', name: 'settings', component: () => import('@/features/settings/SettingsPage.vue'), meta: { shell: true } },
    // Keep the recovery queue in the initial bundle so it always opens while the
    // tablet is offline, even when this is the first visit to the screen.
    { path: '/sync', name: 'sync', component: SyncPage, meta: { shell: true } },
    { path: '/health', name: 'health', component: () => import('@/features/health/HealthPage.vue'), meta: { shell: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

function isAllowed(to: RouteLocationNormalized): boolean {
  const auth = useAuthStore(pinia);
  const settings = useSettingsStore(pinia);
  if (to.meta.permission && !auth.permissions[to.meta.permission]) return false;
  if (to.meta.screen && !settings.settings.screens[to.meta.screen]) return false;
  return true;
}

router.beforeEach(async to => {
  const auth = useAuthStore(pinia);
  const settings = useSettingsStore(pinia);
  await Promise.all([auth.initialize(), settings.ready ? Promise.resolve() : settings.load()]);
  if (to.meta.public) return auth.authenticated && to.name === 'login' ? { name: 'home' } : true;
  if (!auth.authenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (!isAllowed(to)) {
    const candidates = [
      { name: 'home', screen: 'home', permission: null },
      { name: 'pos', screen: 'pos', permission: 'can_sell' },
      { name: 'pickups', screen: 'pickups', permission: 'can_pickup' },
      { name: 'orders', screen: 'orders', permission: 'can_orders' },
      { name: 'customers', screen: 'customers', permission: 'can_manage_customers' },
      { name: 'tables', screen: 'tables', permission: 'can_tables' },
      { name: 'shift', screen: 'shift', permission: 'can_shift' },
    ] as const;
    const fallback = candidates.find(candidate =>
      settings.settings.screens[candidate.screen]
      && (!candidate.permission || auth.permissions[candidate.permission]),
    );
    return { name: fallback?.name ?? 'settings', query: { denied: '1' } };
  }
  return true;
});

export default router;
