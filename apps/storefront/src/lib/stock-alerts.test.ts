import { describe, expect, it } from "vitest";
import {
  alertRedirectTarget,
  classifyAlertError,
  decodeAlertPending,
  encodeAlertPending,
  isAlertError,
  stockAlertActionUrl,
} from "./stock-alerts";

describe("avisos de stock (Fase MK-B)", () => {
  it("cookie pendiente: ida y vuelta y valores no válidos", () => {
    const t = { product_id: "prod_01ABC", variant_id: "variant_01XYZ" };
    expect(decodeAlertPending(encodeAlertPending(t))).toEqual(t);
    for (const bad of [undefined, "", "prod_01ABC", "prod_01ABC:x", "a:b:c", "x".repeat(200)]) {
      expect(decodeAlertPending(bad)).toBeNull();
    }
  });

  it("URL de la action, destino sin JS y errores", () => {
    expect(stockAlertActionUrl("stockAlert.add")).toBe("/cuenta/avisos/?_action=stockAlert.add");
    expect(alertRedirectTarget("/producto/x/", "alert_added")).toBe(
      "/producto/x/#aviso-alert_added",
    );
    expect(alertRedirectTarget("https://otro.es/", "alert_added")).toBe("/#aviso-alert_added");
    expect(classifyAlertError(new Error("Ya hay stock de este producto."))).toBe("alert_in_stock");
    expect(classifyAlertError(new Error("Como mucho 50 avisos a la vez."))).toBe("alert_limit");
    expect(classifyAlertError(new Error("x"))).toBe("alert_error");
    expect(isAlertError("alert_in_stock")).toBe(false);
    expect(isAlertError("alert_limit")).toBe(true);
  });
});
