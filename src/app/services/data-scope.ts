import type { SessionUser } from '@/shared/domain';

let activeScope = 'anonymous';

export function dataScopeFor(user: Pick<SessionUser, 'id' | 'businessId' | 'locationId'>): string {
  return `b${user.businessId}:l${user.locationId}:u${user.id}`;
}

export function setActiveDataScope(user: Pick<SessionUser, 'id' | 'businessId' | 'locationId'> | null): void {
  activeScope = user ? dataScopeFor(user) : 'anonymous';
}

export function getActiveDataScope(): string {
  return activeScope;
}

export function scopedKey(key: string): string {
  return `${activeScope}:${key}`;
}

export function belongsToActiveScope(value: { scope?: string } | null | undefined): boolean {
  return value?.scope === activeScope;
}
