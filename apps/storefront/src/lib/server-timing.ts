// Cabecera `Server-Timing` (fase 7-1, punto 3a): solo nombres y duraciones, nunca datos.
// Se activa con SERVER_TIMING=true (runtime); por defecto no se envía nada.
// Formato: `search;dur=4.8, cards;dur=19.2, data;dur=31.0` (W3C Server Timing).
// `data` = desde el inicio de la petición hasta que la página tiene los datos. El render no cabe
// en una cabecera (Astro manda las cabeceras antes de pintar el cuerpo): render ≈ total − data.

export class Timings {
  private readonly start = performance.now();
  private readonly entries: [string, number][] = [];

  /** Mide una promesa y la devuelve tal cual. */
  async measure<T>(name: string, work: Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await work;
    } finally {
      this.entries.push([name, performance.now() - t0]);
    }
  }

  /** Valor de la cabecera, con `data` desde que se creó el objeto. */
  header(): string {
    return [...this.entries, ["data", performance.now() - this.start] as [string, number]]
      .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
      .join(", ");
  }
}
