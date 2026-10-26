import { stripeSessionData, withStripeSessionData } from "../stripe-session";

describe("sesión de Stripe (Fase PG)", () => {
  it("métodos fijos y captura mixta: Bizum se cobra, el resto se autoriza", () => {
    const d = stripeSessionData();
    expect(d.payment_method_types).toEqual(["card", "paypal", "bizum"]);
    expect(d.capture_method).toBe("automatic");
    expect(Object.keys(d.payment_method_options).sort()).toEqual(["card", "paypal"]);
    expect(d.payment_method_options).not.toHaveProperty("bizum");
    expect(d.payment_method_types).not.toContain("link");
  });

  it("solo para Stripe; sustituye todo lo que venga en data", () => {
    const body = { provider_id: "pp_stripe_stripe", data: { capture_method: "manual", x: 1 } };
    expect(withStripeSessionData(body)).toEqual({
      provider_id: "pp_stripe_stripe",
      data: stripeSessionData(),
    });
    const manual = { provider_id: "pp_system_default", data: { x: 1 } };
    expect(withStripeSessionData(manual)).toBe(manual);
  });
});
