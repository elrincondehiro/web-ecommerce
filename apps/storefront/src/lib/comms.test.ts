import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMS_TOPICS, COMMS_TOPIC_IDS, isCommsTopic, parseCommsTopics } from "./comms";

describe("comunicaciones (Fase MK-A)", () => {
  it("tres temas, con id único, título y versión", () => {
    expect(COMMS_TOPIC_IDS).toEqual(["novedades", "cumpleanos", "gincana"]);
    expect(new Set(COMMS_TOPIC_IDS).size).toBe(COMMS_TOPICS.length);
    for (const t of COMMS_TOPICS) {
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("solo los temas conocidos, sin repetir y en orden", () => {
    expect(isCommsTopic("novedades")).toBe(true);
    expect(isCommsTopic("spam")).toBe(false);
    expect(parseCommsTopics(["gincana", "novedades", "x", "gincana"])).toEqual([
      "novedades",
      "gincana",
    ]);
    expect(parseCommsTopics([])).toEqual([]);
  });
});

describe("copia del backend", () => {
  it("apps/backend/src/lib/comms.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./comms.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/comms.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
