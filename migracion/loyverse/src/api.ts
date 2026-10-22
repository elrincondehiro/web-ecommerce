/**
 * Cliente mínimo de la API de Loyverse v1.0 (solo lectura). Fuente: especificación oficial
 * https://developer.loyverse.com/docs/API-Reference__v1.0.yaml (OpenAPI 3):
 *   - Autenticación: `Authorization: Bearer <personal access token>`.
 *   - Paginación por cursor: la respuesta trae `cursor` mientras haya más; `limit` 1–250.
 *   - Límite: 300 peticiones cada 300 s por cuenta; al pasarse, 429 → reintentar.
 * Sin dependencias: `fetch` de Node 24.
 */

export const API_BASE = "https://api.loyverse.com/v1.0";
export const PAGE_LIMIT = 250;
/** 300 peticiones / 300 s → una por segundo de media; se deja margen. */
const MIN_INTERVAL_MS = 1100;
const MAX_RETRIES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LoyverseClient {
  private last = 0;
  readonly token: string;
  readonly log: (msg: string) => void;

  constructor(token: string, log: (msg: string) => void = () => {}) {
    if (!token) throw new Error("Falta LOYVERSE_TOKEN (ver .env.example).");
    this.token = token;
    this.log = log;
  }

  /** GET con espera entre peticiones y reintentos (429, 5xx y errores de red). */
  async get<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { authorization: `Bearer ${this.token}`, accept: "application/json" },
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await this.backoff(attempt, `red (${(err as Error).message})`);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.backoff(attempt, `HTTP ${res.status}`, retryAfter > 0 ? retryAfter * 1000 : 0);
        continue;
      }
      // Sin el cuerpo completo ni el token: solo el estado y el código de error de Loyverse.
      const body = await res.text().catch(() => "");
      const code = /"code"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1] ?? "";
      throw new Error(`Loyverse ${path}: HTTP ${res.status} ${code}`.trim());
    }
  }

  private async backoff(attempt: number, why: string, min = 0) {
    const ms = Math.max(min, 2 ** attempt * 2000);
    this.log(`  ${why}: reintento en ${Math.round(ms / 1000)} s`);
    await sleep(ms);
  }

  /**
   * Todas las páginas de un listado. `key` = propiedad del array en la respuesta (`items`,
   * `receipts`…). `onPage` recibe cada página (para guardar sobre la marcha).
   */
  async *paginate<T>(
    path: string,
    key: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ): AsyncGenerator<T[]> {
    let cursor: string | undefined;
    do {
      const page = await this.get<Record<string, unknown>>(path, {
        ...query,
        limit: PAGE_LIMIT,
        cursor,
      });
      yield (page[key] as T[] | undefined) ?? [];
      cursor = typeof page.cursor === "string" && page.cursor ? page.cursor : undefined;
    } while (cursor);
  }

  async all<T>(path: string, key: string, query: Record<string, string | boolean> = {}) {
    const out: T[] = [];
    for await (const page of this.paginate<T>(path, key, query)) out.push(...page);
    return out;
  }
}
