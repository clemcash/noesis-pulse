const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Cache mémoire par instance serveur ; un échec n'est jamais mis en cache. */
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  return value;
}

export function clearMemo(): void {
  cache.clear();
}
