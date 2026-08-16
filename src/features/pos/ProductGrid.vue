<script setup lang="ts">
import { ref } from 'vue';
import type { Product } from '@/shared/domain';
import { money } from '@/shared/format';
import AppIcon from '@/components/AppIcon.vue';
import { categoryAccentStyle } from '@/features/pos/category-colors';

defineProps<{
  products: Product[];
  showImages: boolean;
  showFavorites: boolean;
  quantities: Record<number, number>;
  columns: 2 | 3 | 4 | 5;
  categoryColorMode: 'off' | 'categories' | 'cards' | 'both';
  cardStyle: 'clean' | 'soft' | 'accent';
}>();
const emit = defineEmits<{ select: [product: Product]; favorite: [productId: number] }>();
const failedImages = ref(new Set<number>());
function imageFailed(productId: number): void {
  failedImages.value = new Set(failedImages.value).add(productId);
}
</script>

<template>
  <div
    v-if="products.length"
    class="product-grid"
    :class="[
      `product-columns-${columns}`,
      `card-style-${cardStyle}`,
      { 'category-card-colors': categoryColorMode === 'cards' || categoryColorMode === 'both' },
    ]"
  >
    <article v-for="product in products" :key="product.id" class="product-card" :style="categoryAccentStyle(product.categoryId)" :class="{ unavailable: !product.available, 'no-image': !showImages, 'image-missing': showImages && (!product.image || failedImages.has(product.id)) }" :aria-disabled="!product.available" role="button" tabindex="0" @click="product.available && emit('select', product)" @keydown.enter="product.available && emit('select', product)">
      <span v-if="quantities[product.id]" class="quantity-badge">{{ quantities[product.id] }}</span>
      <button v-if="showFavorites" class="favorite-button" :class="{ active: product.favorite }" :aria-pressed="Boolean(product.favorite)" :aria-label="`${product.favorite ? 'إزالة' : 'إضافة'} ${product.name} من المفضلة`" @click.stop="emit('favorite', product.id)"><AppIcon name="star" :size="18" /></button>
      <div v-if="showImages" class="product-image">
        <img v-if="product.image && !failedImages.has(product.id)" :src="product.image" :alt="product.name" loading="lazy" decoding="async" @error="imageFailed(product.id)" />
        <AppIcon name="image" :size="34" />
      </div>
      <div class="product-body"><strong>{{ product.name }}</strong><span class="product-price">{{ money(product.price) }}</span></div>
      <small v-if="!product.available" class="unavailable-label">غير متاح</small>
    </article>
  </div>
  <div v-else class="empty-state"><span class="empty-icon">⌕</span>لا توجد منتجات مطابقة</div>
</template>
