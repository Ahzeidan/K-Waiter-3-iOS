import { describe, expect, it } from 'vitest';
import { orderTypeLabel, translateText } from '@/app/services/localization';
import { money } from '@/shared/format';
import { receiptHtml } from '@/app/services/receipt';
import type { ReceiptSnapshot } from '@/shared/domain';

describe('Arabic and English localization', () => {
  it('translates fixed and dynamic waiter UI messages', () => {
    expect(translateText('نقطة البيع', 'en')).toBe('Point of Sale');
    expect(translateText('تم حفظ الطلب رقم 42', 'en')).toBe('Order #42 saved');
    expect(translateText('اسم صنف من السيرفر', 'en')).toBe('اسم صنف من السيرفر');
    expect(orderTypeLabel('delivery', 'en')).toBe('Delivery');
  });

  it('formats money for the selected language', () => {
    expect(money(1.5, undefined, 'en')).toContain('KWD');
    expect(money(1.5, undefined, 'ar')).toContain('د.ك');
  });

  it('renders a fully LTR English receipt', () => {
    const receipt: ReceiptSnapshot = {
      scope: 'test', key: 'test:1', invoiceNo: '#1', businessName: 'K-Waiter', language: 'en',
      orderType: 'pickup', paymentStatus: 'paid', paymentMethod: 'نقدي', total: 1.5,
      createdAt: '2026-08-15T12:00:00Z', temporary: false,
      lines: [{ name: 'Coffee', quantity: 1, unitPrice: 1.5, total: 1.5, choices: [] }],
    };
    const html = receiptHtml(receipt);
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('Receipt #1');
    expect(html).toContain('Pickup');
    expect(html).toContain('Cash');
    expect(html).not.toContain('الإجمالي');
  });
});
