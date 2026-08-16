import { expect, test } from '@playwright/test';

test('production login does not expose demo mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'فتح النسخة التجريبية' })).toHaveCount(0);
});
