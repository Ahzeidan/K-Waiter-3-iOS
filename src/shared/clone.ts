/** Converts Vue proxies and other JSON-compatible state into a storage-safe value. */
export function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
