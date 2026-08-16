import { expect, test } from '@playwright/test';

test('captures the final catalogue appearance in both tablet orientations', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
  await page.getByRole('button', { name: 'المزيد', exact: true }).click();
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.getByRole('button', { name: 'كاشير', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: /نقطة البيع/ }).click();
  await page.getByLabel('ألوان التصنيفات').selectOption('both');
  await page.getByLabel('شكل كارت المنتج').selectOption('soft');
  await page.getByLabel('حجم اسم وسعر المنتج').selectOption('xlarge');
  await page.getByLabel('عدد المنتجات في الصف').selectOption('3');
  await page.locator('label.switch-row').filter({ hasText: 'إظهار صور المنتجات' }).getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();
  await page.screenshot({ path: 'docs/final-pos-appearance-settings.png', fullPage: true });
  await page.getByRole('link', { name: 'نقطة البيع' }).click();
  await expect(page.locator('.product-card.no-image').first()).toBeVisible();
  await page.screenshot({ path: 'docs/final-pos-no-images-portrait.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.app-shell')).toHaveClass(/tablet-landscape/);
  await page.screenshot({ path: 'docs/final-pos-no-images-landscape.png', fullPage: true });
});
