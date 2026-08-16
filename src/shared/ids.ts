export function createId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export function createIdempotencyKey(action: string, aggregateId?: string | number): string {
  return createId(`${action}-${aggregateId ?? 'new'}`);
}
