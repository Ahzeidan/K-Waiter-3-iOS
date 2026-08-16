import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS, effectiveOrderTypes, normalizeDeviceSettings } from '@/app/settings/defaults';
import { DEFAULT_PERMISSIONS } from '@/shared/domain';
import { normalizeServerUrl } from '@/app/services/preferences';

describe('device settings', () => {
  it('keeps delivery and pickup as the initial business workflow', () => {
    expect(DEFAULT_DEVICE_SETTINGS.orderTypes).toEqual({
      dine_in: false,
      takeaway: false,
      delivery: true,
      pickup: true,
    });
  });

  it('never allows all order types to be disabled', () => {
    const settings = normalizeDeviceSettings({
      orderTypes: { dine_in: false, takeaway: false, delivery: false, pickup: false },
    } as never);
    expect(settings.orderTypes.pickup).toBe(true);
  });

  it('preserves a valid English language selection', () => {
    expect(normalizeDeviceSettings({ language: 'en' }).language).toBe('en');
    expect(normalizeDeviceSettings({ language: 'ar' }).language).toBe('ar');
  });

  it('keeps quick cash, quick KNET and offline payment controls enabled by default', () => {
    expect(DEFAULT_DEVICE_SETTINGS.pos.quickCash).toBe(true);
    expect(DEFAULT_DEVICE_SETTINGS.pos.quickKnet).toBe(true);
    expect(DEFAULT_DEVICE_SETTINGS.sync.offlinePayments).toBe(true);
    expect(DEFAULT_DEVICE_SETTINGS.payment.knownMethods).toHaveLength(12);
    expect(DEFAULT_DEVICE_SETTINGS.payment.hiddenMethods).toEqual([]);
  });

  it('ships with category colors and a readable product-card appearance', () => {
    expect(DEFAULT_DEVICE_SETTINGS.pos.categoryColorMode).toBe('both');
    expect(DEFAULT_DEVICE_SETTINGS.pos.productCardStyle).toBe('soft');
    expect(normalizeDeviceSettings({ pos: {
      ...DEFAULT_DEVICE_SETTINGS.pos,
      fontScale: 'xlarge',
      categoryColorMode: 'cards',
      productCardStyle: 'accent',
    } }).pos).toMatchObject({
      fontScale: 'xlarge',
      categoryColorMode: 'cards',
      productCardStyle: 'accent',
    });
  });

  it('rejects invalid catalogue appearance values from stale remote settings', () => {
    const settings = normalizeDeviceSettings({ pos: {
      ...DEFAULT_DEVICE_SETTINGS.pos,
      fontScale: 'huge',
      categoryColorMode: 'random',
      productCardStyle: 'neon',
    } } as never);
    expect(settings.pos.fontScale).toBe('normal');
    expect(settings.pos.categoryColorMode).toBe('both');
    expect(settings.pos.productCardStyle).toBe('soft');
  });

  it('normalizes the paired Bluetooth printer address for Android direct printing', () => {
    const settings = normalizeDeviceSettings({ printing: { mode: 'bluetooth', bluetoothAddress: 'aa:bb:cc:dd:ee:ff', bluetoothName: 'Kitchen' } } as never);
    expect(settings.printing.bluetoothAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(settings.printing.bluetoothName).toBe('Kitchen');
  });

  it('combines local visibility with server permissions using the most restrictive value', () => {
    const settings = normalizeDeviceSettings({
      orderTypes: { dine_in: true, takeaway: false, delivery: true, pickup: true },
    } as never);
    const permissions = {
      ...DEFAULT_PERMISSIONS,
      can_dine_in: false,
      can_delivery: true,
      can_pickup: false,
    };
    expect(effectiveOrderTypes(settings, permissions)).toEqual({
      dine_in: false,
      takeaway: false,
      delivery: true,
      pickup: false,
    });
  });

  it('requires HTTPS outside loopback development hosts', () => {
    expect(normalizeServerUrl('https://pos.example.com/')).toBe('https://pos.example.com');
    expect(normalizeServerUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(() => normalizeServerUrl('http://restaurant.example.com')).toThrow('HTTPS');
  });
});
