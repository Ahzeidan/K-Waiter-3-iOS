import type { CartChoice } from '@/shared/domain';

export function sameProductChoice(saved: CartChoice, catalogChoice: CartChoice): boolean {
  if (saved.kind && catalogChoice.kind && saved.kind !== catalogChoice.kind) return false;
  const savedVariation = saved.variationId ?? saved.id;
  const catalogVariation = catalogChoice.variationId ?? catalogChoice.id;
  if (savedVariation !== catalogVariation) return false;
  if (saved.kind === 'option' || catalogChoice.kind === 'option') {
    return !saved.groupId || !catalogChoice.groupId || saved.groupId === catalogChoice.groupId;
  }
  if (saved.kind === 'combo' || catalogChoice.kind === 'combo') {
    return !saved.groupName || !catalogChoice.groupName || saved.groupName === catalogChoice.groupName;
  }
  return true;
}
