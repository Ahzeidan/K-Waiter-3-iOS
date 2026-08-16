import { appPreferences } from '@/app/services/preferences';
import { secureStorage } from '@/app/services/secure-storage';
import { createId } from '@/shared/ids';
import { APP_VERSION } from '@/shared/version';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId: string;
  readonly details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; traceId?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'unknown_error';
    this.traceId = options.traceId ?? createId('trace');
    this.details = options.details;
  }
}

export interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
  skipAuth?: boolean;
  retryAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const serverUrl = await appPreferences.getServerUrl();
    const refreshToken = await secureStorage.get('refresh_token');
    if (!serverUrl || !refreshToken || serverUrl === 'demo://local') return false;
    try {
      const response = await fetch(`${serverUrl}/api/waiter/v3/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const data = await response.json() as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken) return false;
      await secureStorage.set('access_token', data.accessToken);
      if (data.refreshToken) await secureStorage.set('refresh_token', data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;
  if (data.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors as Record<string, unknown>).flat().find(value => typeof value === 'string');
    if (typeof first === 'string') return first;
  }
  return fallback;
}

export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const serverUrl = await appPreferences.getServerUrl();
  if (!serverUrl || serverUrl === 'demo://local') {
    throw new ApiError('لا يوجد اتصال بسيرفر', { code: 'server_not_configured' });
  }

  const token = options.skipAuth ? null : await secureStorage.get('access_token');
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || 15000);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Client-Version': APP_VERSION,
    'X-Trace-Id': createId('client'),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    const init: RequestInit = {
      method,
      headers,
      credentials: 'omit',
      signal: controller.signal,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(`${serverUrl}${path}`, init);
  } catch (error) {
    throw new ApiError(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'انتهت مهلة الاتصال بالسيرفر'
        : 'تعذر الاتصال بالسيرفر. سيبقى العمل محفوظًا على التابلت.',
      { code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error' },
    );
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abort);
  }

  const traceId = response.headers.get('X-Trace-Id') ?? createId('server');
  if (response.status === 401 && !options.skipAuth && options.retryAuth !== false) {
    if (await refreshSession()) return apiRequest<T>(method, path, { ...options, retryAuth: false });
    await secureStorage.clear();
  }
  const text = await response.text();
  const payload: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : {};
  if (!response.ok) {
    const safeMessage = response.status >= 500
      ? `حدث خطأ في السيرفر. رقم التتبع: ${traceId}`
      : messageFromPayload(payload, `تعذر تنفيذ العملية (${response.status})`);
    throw new ApiError(safeMessage, {
      status: response.status,
      code: response.status === 401 ? 'unauthenticated' : response.status === 403 ? 'forbidden' : 'server_error',
      traceId,
      details: payload,
    });
  }
  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('DELETE', path, options),
};
