import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rutas de trabajo. TODO lo que sale de Loyverse va en `datos/` (fuera de git: el repo es
 * público y son datos de la tienda).
 */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = join(ROOT, "datos");
export const RAW = join(DATA, "bruto");
export const RECEIPTS = join(RAW, "tickets");
export const OUT = join(DATA, "revision");

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.partial`;
  await writeFile(tmp, `${JSON.stringify(data, null, 1)}\n`);
  await rename(tmp, path);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/** Escribe un fichero JSON Lines (una línea por objeto) de forma atómica. */
export async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.partial`;
  await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  await rename(tmp, path);
}

export async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/** Ficheros `AAAA-MM.jsonl` de tickets ya descargados, en orden. */
export async function receiptMonths(): Promise<string[]> {
  if (!existsSync(RECEIPTS)) return [];
  return (await readdir(RECEIPTS)).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
}

export const exists = existsSync;
