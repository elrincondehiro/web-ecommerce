import { describe, expect, it } from "vitest";
import { Timings } from "./server-timing";

describe("Timings", () => {
  it("mide cada paso y añade data", async () => {
    const t = new Timings();
    expect(await t.measure("search", Promise.resolve(42))).toBe(42);
    await t.measure("cards", new Promise((r) => setTimeout(r, 5)));
    expect(t.header()).toMatch(/^search;dur=\d+\.\d, cards;dur=\d+\.\d, data;dur=\d+\.\d$/);
  });

  it("registra el paso aunque falle", async () => {
    const t = new Timings();
    await expect(t.measure("search", Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(t.header()).toMatch(/^search;dur=/);
  });
});
