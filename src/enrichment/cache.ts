interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class EnrichmentCache<T> {
  readonly #ttlMs: number;
  readonly #entries = new Map<string, CacheEntry<T>>();

  constructor(ttlMs = 300_000) {
    this.#ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.#entries.get(key);

    if (entry === undefined) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.#entries.set(key, {
      value,
      expiresAt: Date.now() + this.#ttlMs,
    });
  }

  clear(): void {
    this.#entries.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }
}
