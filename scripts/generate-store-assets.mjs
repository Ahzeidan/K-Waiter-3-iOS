import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const output = new URL('../release/store-assets/', import.meta.url);
const screenshots = new URL('./screenshots/', output);
const sourceArtwork = new URL('./source/feature-artwork-v1.png', output);
const icon = new URL('./resources/k-waiter-app-icon-source.png', root);
const mark = new URL('./resources/k-waiter-splash-mark.png', root);
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });

function filePath(value) { return fileURLToPath(value); }
async function pngData(value) { return `data:image/png;base64,${(await readFile(value)).toString('base64')}`; }

const artworkData = await pngData(sourceArtwork);
const iconData = await pngData(icon);
const markData = await pngData(mark);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const marketing = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await marketing.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:Arial,"Noto Sans Arabic",sans-serif;background:#075f3d}
    .hero{position:relative;width:100%;height:100%;overflow:hidden}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:linear-gradient(90deg,transparent 0 46%,rgba(3,52,32,.33) 58%,rgba(3,52,32,.96) 77%)}
    .copy{position:absolute;z-index:2;right:48px;top:50%;width:340px;transform:translateY(-50%);color:#fff;text-align:right;direction:rtl}
    .brand{display:flex;direction:ltr;align-items:center;justify-content:flex-end;gap:14px;margin-bottom:20px}.brand img{width:76px;height:76px;object-fit:contain}.brand b{font-size:38px;letter-spacing:-1px}
    h1{margin:0 0 12px;font-size:31px;line-height:1.25}p{margin:0;color:#eaf6ef;font-size:19px;line-height:1.6}.tag{display:inline-flex;margin-top:20px;padding:8px 14px;border:1px solid rgba(255,255,255,.35);border-radius:999px;color:#fff;font-weight:700;font-size:14px;background:rgba(255,255,255,.08)}
  </style></head><body><main class="hero"><img class="art" src="${artworkData}"><div class="shade"></div><section class="copy"><div class="brand"><b>K-Waiter</b><img src="${markData}"></div><h1>إدارة الطلب أسرع من أول لمسة</h1><p>نقطة بيع ذكية للجارسون تعمل أونلاين وأوفلاين على التابلت.</p><span class="tag">طلبات · طاولات · دفع · طباعة</span></section></main></body></html>`);
  await marketing.screenshot({ path: filePath(new URL('./google-play-feature-1024x500.png', output)) });

  const iconPage = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await iconPage.setContent(`<!doctype html><html><body style="margin:0;width:512px;height:512px;overflow:hidden"><img src="${iconData}" style="display:block;width:512px;height:512px"></body></html>`);
  await iconPage.screenshot({ path: filePath(new URL('./google-play-icon-512.png', output)) });
  const appleIconPage = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await appleIconPage.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:1024px;overflow:hidden;background:#087443"><img src="${iconData}" style="display:block;width:1024px;height:1024px"></body></html>`);
  await appleIconPage.screenshot({ path: filePath(new URL('./apple-app-icon-1024-opaque-v1.png', output)), omitBackground: false });
  await marketing.close();
  await iconPage.close();
  await appleIconPage.close();

  const viteCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const viteArguments = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 4187']
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4187'];
  const vite = spawn(viteCommand, viteArguments, {
    cwd: filePath(root),
    stdio: 'ignore',
    shell: false,
  });
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try { if ((await fetch('http://127.0.0.1:4187')).ok) break; } catch { /* wait */ }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (Date.now() >= deadline) throw new Error('Vite did not start in time');

    const portraitContext = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, locale: 'ar-KW', timezoneId: 'Asia/Kuwait' });
    const page = await portraitContext.newPage();
    await page.goto('http://127.0.0.1:4187/#/login');
    await page.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
    await page.getByRole('button', { name: 'المزيد', exact: true }).click();
    await page.getByRole('link', { name: 'الإعدادات' }).click();
    await page.getByRole('button', { name: 'كاشير', exact: true }).click();
    await page.locator('.settings-nav').getByRole('button', { name: /نقطة البيع/ }).click();
    await page.getByLabel('عدد المنتجات في الصف').selectOption('3');
    await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();
    await page.goto('http://127.0.0.1:4187/#/pos');
    await page.locator('.product-card').first().waitFor();
    await page.locator('.product-card').nth(0).click();
    await page.locator('.product-card').nth(1).click();
    await page.locator('.product-card').nth(2).click();
    await page.getByRole('button', { name: 'عرض السلة' }).click();
    await page.screenshot({ path: filePath(new URL('./screenshots/01-pos-ar-2048x2732.png', output)) });
    await page.goto('http://127.0.0.1:4187/#/tables');
    await page.getByRole('heading', { name: 'الطاولات' }).waitFor();
    await page.screenshot({ path: filePath(new URL('./screenshots/02-tables-ar-2048x2732.png', output)) });
    await page.goto('http://127.0.0.1:4187/#/orders');
    await page.getByRole('heading', { name: 'الطلبات' }).waitFor();
    await page.screenshot({ path: filePath(new URL('./screenshots/03-orders-ar-2048x2732.png', output)) });
    await page.goto('http://127.0.0.1:4187/#/settings');
    await page.getByRole('heading', { name: 'إعدادات التابلت' }).waitFor();
    await page.screenshot({ path: filePath(new URL('./screenshots/04-settings-ar-2048x2732.png', output)) });
    await portraitContext.close();

    const landscapeContext = await browser.newContext({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, locale: 'ar-KW', timezoneId: 'Asia/Kuwait' });
    const landscape = await landscapeContext.newPage();
    await landscape.goto('http://127.0.0.1:4187/#/login');
    await landscape.getByRole('button', { name: 'فتح النسخة التجريبية' }).click();
    await landscape.getByRole('button', { name: 'المزيد', exact: true }).click();
    await landscape.getByRole('link', { name: 'الإعدادات' }).click();
    await landscape.getByRole('button', { name: 'كاشير', exact: true }).click();
    await landscape.getByRole('button', { name: 'حفظ الإعدادات' }).click();
    await landscape.goto('http://127.0.0.1:4187/#/pos');
    await landscape.locator('.product-card').first().waitFor();
    await landscape.screenshot({ path: filePath(new URL('./screenshots/05-pos-ar-2732x2048.png', output)) });
    await landscape.goto('http://127.0.0.1:4187/#/settings');
    await landscape.getByLabel('اللغة').selectOption('en');
    await landscape.getByRole('button', { name: 'Save Settings' }).click();
    await landscape.goto('http://127.0.0.1:4187/#/pos');
    await landscape.getByPlaceholder('Search products…').waitFor();
    await landscape.screenshot({ path: filePath(new URL('./screenshots/06-pos-en-2732x2048.png', output)) });
    await landscapeContext.close();
  } finally {
    vite.kill();
  }
} finally {
  await browser.close();
}
