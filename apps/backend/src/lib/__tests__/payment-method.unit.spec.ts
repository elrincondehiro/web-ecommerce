import { paymentMethodInfo, paymentStatusLabel } from "../payment-method";

const stripe = (pm: unknown, captured = false, types?: string[]) => ({
  provider_id: "pp_stripe_stripe",
  captured_at: captured ? new Date() : null,
  data: { payment_method: pm, ...(types ? { payment_method_types: types } : {}) },
});

describe("método de pago (Fase PG)", () => {
  it("tipos de Stripe y wallets", () => {
    expect(paymentMethodInfo(stripe({ type: "card", card: { wallet: null } }))?.label).toBe(
      "Tarjeta",
    );
    expect(
      paymentMethodInfo(stripe({ type: "card", card: { wallet: { type: "apple_pay" } } }))?.label,
    ).toBe("Apple Pay");
    expect(paymentMethodInfo(stripe({ type: "paypal" }))?.label).toBe("PayPal");
    expect(paymentMethodInfo(stripe({ type: "bizum" }, true))).toEqual({
      label: "Bizum",
      captured: true,
      transfer: false,
    });
    // Solo el id del método: se usa la lista si es única
    expect(paymentMethodInfo(stripe("pm_1", false, ["card"]))?.label).toBe("Tarjeta");
    expect(paymentMethodInfo(stripe("pm_1", false, ["card", "bizum"]))?.label).toBe("Stripe");
  });

  it("transferencia manual y textos", () => {
    const t = paymentMethodInfo({ provider_id: "pp_system_default", captured_at: null, data: {} });
    expect(t).toEqual({ label: "Transferencia", captured: false, transfer: true });
    expect(paymentStatusLabel(t)).toBe("Transferencia · pendiente de recibir");
    expect(paymentStatusLabel(paymentMethodInfo(stripe({ type: "card" })))).toBe(
      "Tarjeta · pendiente de capturar",
    );
    expect(paymentStatusLabel(paymentMethodInfo(stripe({ type: "bizum" }, true)))).toBe(
      "Bizum · cobrado",
    );
    expect(paymentMethodInfo(null)).toBeNull();
    expect(paymentStatusLabel(null)).toBeNull();
  });
});
