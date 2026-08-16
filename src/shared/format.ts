import { getUiLanguage, localeCode } from '@/app/services/localization';
import type { Language } from '@/shared/domain';

export function money(value: number, currency?: string, language: Language = getUiLanguage()): string {
  const resolvedCurrency = currency ?? (language === 'ar' ? 'د.ك' : 'KWD');
  return `${new Intl.NumberFormat(localeCode(language), {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(value) ? value : 0)} ${resolvedCurrency}`;
}

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('ar')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function matchesSearch(query: string, ...values: Array<string | number | null | undefined>): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(values.filter(Boolean).join(' ')).includes(needle);
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value) ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeCode(), { hour: '2-digit', minute: '2-digit' }).format(date);
}
