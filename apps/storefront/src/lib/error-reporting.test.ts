import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorReportingOptions } from "./error-reporting";

// Los tests del filtro están en el backend (src/lib/__tests__/error-reporting.unit.spec.ts).
describe("errores a Bugsink (fase 12-B)", () => {
  it("sin SENTRY_DSN no se inicia; con él, servicio «storefront» y sin trazas", () => {
    expect(errorReportingOptions({}, "storefront")).toBeNull();
    expect(
      errorReportingOptions({ SENTRY_DSN: "http://k@10.77.0.3:8000/2" }, "storefront"),
    ).toMatchObject({ tracesSampleRate: 0, initialScope: { tags: { service: "storefront" } } });
  });

  it("apps/backend/src/lib/error-reporting.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./error-reporting.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/error-reporting.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
