// Caché EN MEMORIA con TTL y tope de entradas (fase 7-1, D9). Uso principal: tarjetas (precio y
// stock) por id de producto; también las sugerencias por texto (fase 7-2, get/set).
// /buscar/ pide ≤ 24 ids por página; con caché solo se piden a Medusa los que faltan o caducaron.
// - TTL corto (30 s por defecto): el precio/stock de /buscar/ puede ir hasta 30 s por detrás
//   (además de los 60 s de s-maxage de la CDN). El carrito y el checkout validan siempre.
// - Tope de entradas: al pasarse se descartan las más antiguas (orden de inserción del Map).
// - Por proceso: no se comparte entre instancias ni sobrevive a un reinicio.
// Pura (sin astro:*) para poder probarla con Vitest.

export interface CardCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

export class CardCache<T> {
  private readonly map = new Map<string, { value: T; expires: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor({ ttlMs, maxEntries, now = Date.now }: CardCacheOptions) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  /**
   * Devuelve los valores de `ids` en el MISMO orden, pidiendo a `load` solo los que faltan.
   * Los ids que `load` no devuelve (borrados, no publicados) no se cachean ni se devuelven.
   */
  async getMany(
    ids: string[],
    load: (missing: string[]) => Promise<T[]>,
    idOf: (value: T) => string,
  ): Promise<{ values: T[]; hits: number }> {
    const now = this.now();
    const found = new Map<string, T>();
    const missing: string[] = [];
    for (const id of ids) {
      const entry = this.map.get(id);
      if (entry && entry.expires > now) found.set(id, entry.value);
      else missing.push(id);
    }
    if (missing.length) {
      for (const value of await load(missing)) {
        const id = idOf(value);
        found.set(id, value);
        this.set(id, value, now);
      }
    }
    const values = ids.map((id) => found.get(id)).filter((v): v is T => v !== undefined);
    return { values, hits: ids.length - missing.length };
  }

  get size(): number {
    return this.map.size;
  }

  /** Valor vigente de una clave, o undefined. */
  get(key: string): T | undefined {
    const entry = this.map.get(key);
    return entry && entry.expires > this.now() ? entry.value : undefined;
  }

  set(id: string, value: T, now = this.now()) {
    this.map.delete(id); // reinsertar = pasa al final (más reciente)
    this.map.set(id, { value, expires: now + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
