import type { DeviceSettings, PaymentMethod, PaymentMethodOption, ShiftState } from '@/shared/domain';
import { DEFAULT_PAYMENT_METHOD_OPTIONS } from '@/app/settings/defaults';

const FALLBACK_LABELS = new Map(DEFAULT_PAYMENT_METHOD_OPTIONS.map(option => [option.id, option.label]));

export function normalizePaymentMethod(value?: string | null): PaymentMethod {
  const method = String(value ?? '').trim().toLowerCase();
  if (['card', 'k-net', 'k_net', 'credit_card'].includes(method)) return 'knet';
  if (['link', 'online', 'payment-link', 'custom_pay_1'].includes(method)) return 'payment_link';
  if (['split', 'split_payment'].includes(method)) return 'mixed';
  return method;
}

export function paymentMethodLabel(method: PaymentMethod, options: PaymentMethodOption[] = []): string {
  const id = normalizePaymentMethod(method);
  return options.find(option => normalizePaymentMethod(option.id) === id)?.label
    ?? FALLBACK_LABELS.get(id)
    ?? (id.startsWith('custom_pay_') ? `دفع مخصص ${id.replace('custom_pay_', '')}` : id || 'غير محدد');
}

export function paymentMethodIcon(method: PaymentMethod): string {
  const id = normalizePaymentMethod(method);
  if (id === 'cash') return 'cash';
  if (id === 'knet') return 'card';
  if (id === 'cheque') return 'cheque';
  if (id === 'bank_transfer') return 'bank';
  if (id === 'payment_link') return 'link';
  if (id === 'other') return 'more';
  return 'wallet';
}

export function normalizePaymentOptions(
  options: PaymentMethodOption[] = [],
  methods: PaymentMethod[] = [],
  fallback: PaymentMethodOption[] = DEFAULT_PAYMENT_METHOD_OPTIONS,
): PaymentMethodOption[] {
  const source = options.length
    ? options
    : methods.length
      ? methods.map(id => ({ id, label: paymentMethodLabel(id, fallback) }))
      : fallback;
  return Array.from(new Map(source
    .map(option => ({ id: normalizePaymentMethod(option.id), label: String(option.label || '').trim() }))
    .filter(option => option.id && option.id !== 'mixed')
    .map(option => [option.id, { ...option, label: option.label || paymentMethodLabel(option.id, fallback) }] as const)).values());
}

export function shiftPaymentOptions(shift: ShiftState | null, settings: DeviceSettings): PaymentMethodOption[] {
  return normalizePaymentOptions(
    shift?.paymentMethodOptions ?? [],
    shift?.paymentMethods ?? [],
    settings.payment.knownMethods,
  );
}

export function enabledPaymentOptions(options: PaymentMethodOption[], settings: DeviceSettings): PaymentMethodOption[] {
  const hidden = new Set(settings.payment.hiddenMethods.map(normalizePaymentMethod));
  return normalizePaymentOptions(options, [], settings.payment.knownMethods).filter(option => !hidden.has(option.id));
}

export function isPaymentMethodEnabled(method: PaymentMethod, settings: DeviceSettings): boolean {
  const id = normalizePaymentMethod(method);
  return !settings.payment.hiddenMethods.some(hidden => normalizePaymentMethod(hidden) === id);
}

export function isOfflinePaymentMethod(method: PaymentMethod): boolean {
  return ['cash', 'knet'].includes(normalizePaymentMethod(method));
}
