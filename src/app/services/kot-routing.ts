import { localDatabase } from '@/app/services/local-database';
import { scopedKey } from '@/app/services/data-scope';
import { waiterApi } from '@/app/services/waiter-api';
import type { KotRoutingSnapshot, OrderDraft } from '@/shared/domain';

const CACHE_KEY = 'kot-routing';

export async function loadKotRouting(refresh = navigator.onLine): Promise<KotRoutingSnapshot | null> {
  const key = scopedKey(CACHE_KEY);
  const cached = await localDatabase.cachePeek<KotRoutingSnapshot>(key);
  if (!refresh) return cached?.value ?? null;
  try {
    const routing = await waiterApi.kotRoutes();
    await localDatabase.cachePut(key, routing);
    return routing;
  } catch {
    return cached?.value ?? null;
  }
}

export function routedCategories(draft: OrderDraft, routing: KotRoutingSnapshot | null): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (!routing) return result;
  for (const route of routing.routes.filter(item => item.orderType === 'all' || item.orderType === draft.type)) {
    for (const line of draft.lines) {
      if (route.printScope === 'categories' && route.categoryIds.length && line.categoryId && !route.categoryIds.includes(line.categoryId)) continue;
      const names = result.get(route.printer.id) ?? [];
      names.push(line.name);
      result.set(route.printer.id, names);
    }
  }
  return result;
}
