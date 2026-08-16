import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { localDatabase } from '@/app/services/local-database';
import { waiterApi, type MenuResponse } from '@/app/services/waiter-api';
import { matchesSearch } from '@/shared/format';
import type { Category, Product, ProductChoiceGroup } from '@/shared/domain';
import { scopedKey } from '@/app/services/data-scope';
import { useSettingsStore } from '@/app/stores/settings';

const CACHE_MAX_AGE = 7 * 24 * 60 * 60_000;

export const useCatalogStore = defineStore('catalog', () => {
  const settings = useSettingsStore();
  const categories = ref<Category[]>([]);
  const products = ref<Product[]>([]);
  const activeCategoryId = ref<number | null>(null);
  const search = ref('');
  const loading = ref(false);
  const stale = ref(false);
  const error = ref('');

  const visibleProducts = computed(() => products.value.filter(product => {
    const category = categories.value.find(item => item.id === product.categoryId);
    const categoryMatches = search.value.trim() || activeCategoryId.value === null || product.categoryId === activeCategoryId.value;
    return categoryMatches && matchesSearch(search.value, product.name, product.searchText, product.sku, category?.name);
  }).sort((a, b) => {
    if (settings.settings.pos.productSort === 'name') return a.name.localeCompare(b.name, 'ar');
    if (settings.settings.pos.productSort === 'price') return a.price - b.price;
    if (settings.settings.pos.productSort === 'favorites') return Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    return 0;
  }));

  function applyMenu(menu: MenuResponse): void {
    categories.value = menu.categories.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    products.value = menu.products;
  }

  function choiceCacheKey(product: Product): string {
    return scopedKey(`product-choices:${product.serverProductId ?? product.id}`);
  }

  async function refreshProductChoices(product: Product): Promise<ProductChoiceGroup[]> {
    const response = await waiterApi.productChoices(product.serverProductId ?? product.id);
    product.choiceGroups = response.choiceGroups;
    product.hasChoices = response.choiceGroups.length > 0;
    await localDatabase.cachePut(choiceCacheKey(product), response.choiceGroups);
    return response.choiceGroups;
  }

  async function ensureProductChoices(product: Product): Promise<ProductChoiceGroup[]> {
    if (product.choiceGroups !== undefined) return product.choiceGroups;

    const cached = await localDatabase.cachePeek<ProductChoiceGroup[]>(choiceCacheKey(product));
    if (cached) {
      product.choiceGroups = cached.value;
      product.hasChoices = cached.value.length > 0;
      // Do not make an offline waiter wait for a network timeout. Refresh the
      // cached configuration quietly when connectivity is available.
      void refreshProductChoices(product).catch(() => undefined);
      return product.choiceGroups;
    }

    return refreshProductChoices(product);
  }

  async function warmProductChoices(menuProducts: Product[]): Promise<void> {
    const queue = menuProducts.filter(product => product.hasChoices && product.choiceGroups === undefined);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const product = queue[cursor++];
        if (!product) continue;
        try { await refreshProductChoices(product); }
        catch { /* The menu stays usable; ensureProductChoices can retry later. */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const cacheKey = scopedKey('menu');
    const cachedRecord = await localDatabase.cachePeek<MenuResponse>(cacheKey);
    const cached = cachedRecord?.value ?? null;
    if (cached) applyMenu(cached);
    const favoritesKey = scopedKey('favorite-products');
    const favorites = new Set(await localDatabase.get<number[]>('keyvalue', favoritesKey) ?? []);
    products.value.forEach(product => { product.favorite = favorites.has(product.id); });
    try {
      const menu = await waiterApi.menu();
      applyMenu(menu);
      products.value.forEach(product => { product.favorite = favorites.has(product.id); });
      await localDatabase.cachePut(cacheKey, menu);
      void warmProductChoices(menu.products);
      stale.value = false;
    } catch (reason) {
      stale.value = Boolean(cached);
      error.value = reason instanceof Error ? reason.message : 'تعذر تحميل المنتجات';
      if (!cached) throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function toggleFavorite(productId: number): Promise<void> {
    const product = products.value.find(item => item.id === productId);
    if (!product) return;
    product.favorite = !product.favorite;
    await localDatabase.put('keyvalue', scopedKey('favorite-products'), products.value.filter(item => item.favorite).map(item => item.id));
  }

  return { categories, products, activeCategoryId, search, loading, stale, error, visibleProducts, load, ensureProductChoices, toggleFavorite };
});
