import { describe, expect, it } from "vitest";
import { buildTaxBreakdown, isTemplateId, previewProps, renderEmail, TEMPLATE_IDS } from "./index";

describe("renderEmail", () => {
  it.each(TEMPLATE_IDS)("%s genera asunto, HTML y texto plano", async (id) => {
    const { subject, html, text } = await renderEmail(id, previewProps(id));
    expect(subject.length).toBeGreaterThan(5);
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain('lang="es"');
    expect(html).toContain("/email/logo.png");
    expect(html).not.toMatch(/<script/i);
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).toContain("no respondas");
  });

  it("el pedido incluye el desglose de IVA y los importes en euros", async () => {
    const { subject, text } = await renderEmail("order-placed", previewProps("order-placed"));
    expect(subject).toBe("Hemos recibido tu pedido n.º 1042");
    expect(text).toContain("IVA 21 %");
    expect(text).toContain("IVA 4 %");
    expect(text).toMatch(/61,05\s€/);
  });

  it("el envío muestra el seguimiento", async () => {
    const { text } = await renderEmail("order-shipped", previewProps("order-shipped"));
    expect(text).toContain("PK123456789ES");
  });

  it("los enlaces de cuenta salen en el texto plano", async () => {
    const reset = await renderEmail("password-reset", previewProps("password-reset"));
    expect(reset.text).toContain("token=preview-token");
    const verify = await renderEmail("verify-email", previewProps("verify-email"));
    expect(verify.text).toContain("/cuenta/verificar/?token=preview-token");
  });

  it("bienvenida y baja: enlace a la cuenta y datos de la solicitud", async () => {
    const welcome = await renderEmail("welcome", previewProps("welcome"));
    expect(welcome.text).toContain("/cuenta/");
    const baja = await renderEmail(
      "account-deletion-request",
      previewProps("account-deletion-request"),
    );
    expect(baja.subject).toBe("Solicitud de baja de cuenta: ana@example.com");
    expect(baja.text).toContain("cus_01PREVIEW");
    expect(baja.text).toContain("Ya no voy a comprar más.");
  });

  it("escapa los datos del cliente", async () => {
    const { html } = await renderEmail("order-placed", {
      ...previewProps("order-placed"),
      customerName: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<img src=x");
  });

  it("isTemplateId", () => {
    expect(isTemplateId("order-placed")).toBe(true);
    expect(isTemplateId("toString")).toBe(false);
  });
});

describe("buildTaxBreakdown", () => {
  it("agrupa por tipo, calcula la base y ordena de mayor a menor", () => {
    expect(
      buildTaxBreakdown([
        { rate: 4, total: 31.2, taxTotal: 1.2 },
        { rate: 21, total: 24.9, taxTotal: 4.32 },
        { rate: 21, total: 4.95, taxTotal: 0.86 },
      ]),
    ).toEqual([
      { rate: 21, base: 24.67, tax: 5.18 },
      { rate: 4, base: 30, tax: 1.2 },
    ]);
  });

  it("ignora líneas a cero (envío gratis)", () => {
    expect(buildTaxBreakdown([{ rate: 21, total: 0, taxTotal: 0 }])).toEqual([]);
  });
});
