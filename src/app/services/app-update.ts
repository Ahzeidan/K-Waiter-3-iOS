import type { Language } from '@/shared/domain';

export interface AppReleaseInfo {
  platform: 'android' | 'ios';
  currentVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  buildNumber: number;
  updateAvailable: boolean;
  updateRequired: boolean;
  updateUrl: string;
  publishedAt: string;
  releaseNotes: Record<Language, string[]>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean).slice(0, 8);
}

export function normalizeAppRelease(input: unknown): AppReleaseInfo {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const notes = source.releaseNotes && typeof source.releaseNotes === 'object'
    ? source.releaseNotes as Record<string, unknown>
    : {};
  let updateUrl = String(source.updateUrl ?? '').trim();
  try {
    if (updateUrl && new URL(updateUrl).protocol !== 'https:') updateUrl = '';
  } catch { updateUrl = ''; }
  return {
    platform: source.platform === 'ios' ? 'ios' : 'android',
    currentVersion: String(source.currentVersion ?? ''),
    latestVersion: String(source.latestVersion ?? ''),
    minimumSupportedVersion: String(source.minimumSupportedVersion ?? ''),
    buildNumber: Math.max(0, Number(source.buildNumber ?? 0) || 0),
    updateAvailable: source.updateAvailable === true,
    updateRequired: source.updateRequired === true,
    updateUrl,
    publishedAt: String(source.publishedAt ?? ''),
    releaseNotes: { ar: stringList(notes.ar), en: stringList(notes.en) },
  };
}
