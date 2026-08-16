import { describe, expect, it } from 'vitest';
import { normalizeAppRelease } from '@/app/services/app-update';

describe('application update manifest', () => {
  it('accepts a secure release manifest', () => {
    const release = normalizeAppRelease({
      platform: 'ios', currentVersion: '3.0.0', latestVersion: '3.1.0',
      minimumSupportedVersion: '3.0.0', buildNumber: 310000,
      updateAvailable: true, updateRequired: false,
      updateUrl: 'https://apps.apple.com/app/id123',
      releaseNotes: { ar: ['تحسين'], en: ['Improvement'] },
    });
    expect(release.platform).toBe('ios');
    expect(release.updateUrl).toBe('https://apps.apple.com/app/id123');
    expect(release.releaseNotes.en).toEqual(['Improvement']);
  });

  it('rejects insecure and malformed update URLs', () => {
    expect(normalizeAppRelease({ updateUrl: 'http://example.com/app.apk' }).updateUrl).toBe('');
    expect(normalizeAppRelease({ updateUrl: 'not-a-url' }).updateUrl).toBe('');
  });
});
