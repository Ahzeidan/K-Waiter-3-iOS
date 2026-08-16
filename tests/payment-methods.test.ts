import { describe, expect, it } from 'vitest';
import { normalizeDeviceSettings } from '@/app/settings/defaults';
import { enabledPaymentOptions, normalizePaymentMethod, normalizePaymentOptions, paymentMethodLabel } from '@/shared/payment-methods';

describe('payment method catalogue', () => {
  it('keeps every server-defined method and its real label', () => {
    const options = normalizePaymentOptions([
      { id: 'cash', label: 'نقدي' },
      { id: 'custom_pay_7', label: 'قسيمة موظف' },
      { id: 'cheque', label: 'شيك' },
    ]);
    expect(options).toHaveLength(3);
    expect(paymentMethodLabel('custom_pay_7', options)).toBe('قسيمة موظف');
  });

  it('normalizes Laravel card and first custom method aliases', () => {
    expect(normalizePaymentMethod('card')).toBe('knet');
    expect(normalizePaymentMethod('custom_pay_1')).toBe('payment_link');
  });

  it('applies tablet-local hidden methods without dropping new server methods', () => {
    const settings = normalizeDeviceSettings({ payment: {
      hiddenMethods: ['cheque'],
      knownMethods: [{ id: 'cash', label: 'نقدي' }],
      allowSplit: true,
    } } as never);
    const enabled = enabledPaymentOptions([
      { id: 'cash', label: 'نقدي' },
      { id: 'cheque', label: 'شيك' },
      { id: 'custom_pay_6', label: 'محفظة الفرع' },
    ], settings);
    expect(enabled.map(option => option.id)).toEqual(['cash', 'custom_pay_6']);
  });
});
