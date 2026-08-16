import { expect, test } from '@playwright/test';

test('switches the full tablet workflow to English and LTR', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
  await page.getByRole('button', { name: 'المزيد', exact: true }).click();
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.getByLabel('اللغة').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible();

  await page.getByRole('link', { name: 'Point of Sale' }).click();
  await expect(page.getByRole('button', { name: 'Delivery', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search products…')).toBeVisible();
  await page.locator('.product-card').first().click();
  await page.getByRole('button', { name: 'View Cart' }).click();
  await expect(page.getByRole('heading', { name: 'Current Order' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Only' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to Kitchen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detailed or Split Payment' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('reduces no-image product cards by about thirty percent', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
  await page.getByRole('button', { name: 'المزيد', exact: true }).click();
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.locator('.settings-nav').getByRole('button', { name: /نقطة البيع/ }).click();
  await page.locator('label.switch-row').filter({ hasText: 'إظهار صور المنتجات' }).getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();
  await page.getByRole('link', { name: 'نقطة البيع' }).click();
  const card = page.locator('.product-card.no-image').first();
  await expect(card).toBeVisible();
  const height = await card.evaluate(element => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(122);
  expect(height).toBeGreaterThanOrEqual(112);
});

test('shows English titles across every operational screen', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
  await page.getByRole('button', { name: 'المزيد', exact: true }).click();
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.getByRole('button', { name: 'كاشير', exact: true }).click();
  await page.getByLabel('اللغة').selectOption('en');
  await page.getByRole('button', { name: 'Save Settings' }).click();

  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto('/#/tables');
  await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
  await page.goto('/#/pickups');
  await expect(page.getByRole('heading', { name: 'Pickup Orders' })).toBeVisible();
  await page.goto('/#/orders');
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await page.goto('/#/customers');
  await expect(page.getByRole('heading', { name: 'Customers & Addresses' })).toBeVisible();
  await page.goto('/#/shift');
  await expect(page.getByRole('heading', { name: 'Shift', exact: true })).toBeVisible();
  await page.goto('/#/sync');
  await expect(page.getByRole('heading', { name: 'Sync', exact: true })).toBeVisible();
  await page.goto('/#/health');
  await expect(page.getByRole('heading', { name: 'Device Health' })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Tablet Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
