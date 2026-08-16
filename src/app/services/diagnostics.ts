import { Capacitor } from '@capacitor/core';
import { apiClient } from '@/app/services/api-client';
import { localDatabase } from '@/app/services/local-database';
import { APP_VERSION } from '@/shared/version';

export interface DiagnosticEvent {
  id: string;
  kind: 'error' | 'rejection' | 'performance';
  name: string;
  code?: string;
  message: string;
  route: string;
  platform: string;
  appVersion: string;
  occurredAt: string;
}

const STORAGE_KEY = 'diagnostic-events';
const MAX_LOCAL_EVENTS = 100;

function sanitize(value: unknown): string {
  return String(value ?? 'Unknown error')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[PHONE]')
    .slice(0, 400);
}

async function events(): Promise<DiagnosticEvent[]> {
  return await localDatabase.get<DiagnosticEvent[]>('keyvalue', STORAGE_KEY) ?? [];
}

async function capture(kind: DiagnosticEvent['kind'], reason: unknown, code?: string): Promise<void> {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const event: DiagnosticEvent = {
    id: globalThis.crypto.randomUUID(),
    kind,
    name: sanitize(error.name || 'Error'),
    ...(code ? { code: sanitize(code) } : {}),
    message: sanitize(error.message),
    route: `${location.pathname}${location.hash.split('?')[0]}`.slice(0, 180),
    platform: Capacitor.getPlatform(),
    appVersion: APP_VERSION,
    occurredAt: new Date().toISOString(),
  };
  const next = [...await events(), event].slice(-MAX_LOCAL_EVENTS);
  await localDatabase.put('keyvalue', STORAGE_KEY, next);
}

async function flush(): Promise<void> {
  const pending = await events();
  if (!pending.length) return;
  await apiClient.post('/api/waiter/v3/device/diagnostics', { events: pending.slice(0, 50) });
  await localDatabase.put('keyvalue', STORAGE_KEY, pending.slice(50));
}

function bind(): void {
  window.addEventListener('error', event => { void capture('error', event.error ?? event.message).catch(() => undefined); });
  window.addEventListener('unhandledrejection', event => { void capture('rejection', event.reason).catch(() => undefined); });
  window.addEventListener('online', () => { void flush().catch(() => undefined); });
}

export const diagnostics = { capture, flush, bind, events };
