const CATEGORY_PALETTE = [
  '#137a55',
  '#2568b7',
  '#7350b4',
  '#b85f22',
  '#a73b62',
  '#167985',
  '#8a6415',
  '#536594',
  '#65772b',
  '#9b463d',
] as const;

export function categoryAccent(categoryId: number): string {
  const safeId = Number.isFinite(categoryId) ? Math.abs(Math.trunc(categoryId)) : 0;
  return CATEGORY_PALETTE[(safeId * 7 + 3) % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0];
}

export function categoryAccentStyle(categoryId: number): Record<string, string> {
  return { '--category-accent': categoryAccent(categoryId) };
}
