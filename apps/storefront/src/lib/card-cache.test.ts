import { describe, expect, it, vi } from "vitest";
import { CardCache } from "./card-cache";

type Card = { id: string; v: number };
const idOf = (c: Card) => c.id;

function setup(ttlMs = 1000, maxEntries = 10) {
  let t = 0;
  const cache = new CardCache<Card>({ ttlMs, maxEntries, now: () => t });
  let version = 1;
  const load = vi.fn(async (ids: string[]) => ids.map((id) => ({ id, v: version })));
  return {
    cache,
    load,
    advance: (ms: number) => (t += ms),
    bump: () => version++,
  };
}

describe("CardCache", () => {
  it("solo pide los que faltan y respeta el orden", async () => {
    const { cache, load } = setup();
    await cache.getMany(["a", "b"], load, idOf);
    const r = await cache.getMany(["c", "a", "b"], load, idOf);
    expect(load).toHaveBeenLastCalledWith(["c"]);
    expect(r.values.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(r.hits).toBe(2);
  });

  it("caduca con el TTL", async () => {
    const { cache, load, advance, bump } = setup(1000);
    await cache.getMany(["a"], load, idOf);
    bump();
    advance(999);
    expect((await cache.getMany(["a"], load, idOf)).values[0]!.v).toBe(1);
    advance(1);
    expect((await cache.getMany(["a"], load, idOf)).values[0]!.v).toBe(2);
  });

  it("no devuelve ni cachea lo que el backend no devuelve", async () => {
    const { cache } = setup();
    const load = vi.fn(async (ids: string[]) =>
      ids.filter((id) => id !== "x").map((id) => ({ id, v: 1 })),
    );
    expect((await cache.getMany(["a", "x"], load, idOf)).values.map(idOf)).toEqual(["a"]);
    await cache.getMany(["x"], load, idOf);
    expect(load).toHaveBeenLastCalledWith(["x"]);
  });

  it("descarta las entradas más antiguas al pasar del tope", async () => {
    const { cache, load } = setup(1000, 2);
    await cache.getMany(["a", "b"], load, idOf);
    await cache.getMany(["c"], load, idOf);
    expect(cache.size).toBe(2);
    await cache.getMany(["a"], load, idOf);
    expect(load).toHaveBeenLastCalledWith(["a"]);
  });

  it("si el backend falla, propaga el error y no cachea nada", async () => {
    const { cache } = setup();
    const load = vi.fn(async () => {
      throw new Error("503");
    });
    await expect(cache.getMany(["a"], load, idOf)).rejects.toThrow("503");
    expect(cache.size).toBe(0);
  });
});

describe("CardCache get/set (sugerencias)", () => {
  it("devuelve el valor hasta que caduca", () => {
    let t = 0;
    const cache = new CardCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => t });
    cache.set("bufn", "<a>");
    expect(cache.get("bufn")).toBe("<a>");
    t = 1000;
    expect(cache.get("bufn")).toBeUndefined();
  });
});
