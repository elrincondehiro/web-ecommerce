// e2e del checkout (fase 5). Local: necesita backend con Stripe (claves de TEST en los .env),
// `pnpm infra:stripe` para los webhooks y red hacia Stripe. Ver docs/fases/fase5.md §5.
// Tarjetas de prueba de Stripe: 4242… (sin 3DS), 4000 0027 6000 3184 (3DS siempre),
// 4000 0000 0000 0002 (rechazada).
import { expect, test, type FrameLocator, type Page } from "@playwright/test";

const PRODUCT = "/producto/mock-bufanda-natural-020/";

async function addAndGoToCheckout(page: Page) {
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
  // Con JS: toast + contador; sin JS: 303 a la ficha con #carrito-added.
  await expect(page.locator("#carrito-added:target, .toast").first()).toBeVisible();
  await page.goto("/carrito/");
  await page.getByRole("link", { name: "Ir a pagar" }).click();
  await expect(page).toHaveURL(/\/checkout\/$/);
}

async function fillAddress(page: Page, overrides: Record<string, string> = {}) {
  const data = {
    Email: "e2e@example.com",
    Teléfono: "600 123 456",
    Nombre: "Ana",
    Apellidos: "Pérez",
    Dirección: "Calle Mayor 1",
    "Código postal": "28001",
    Población: "Madrid",
    ...overrides,
  };
  const step = page.locator("#datos");
  for (const [label, value] of Object.entries(data)) {
    await step.getByLabel(label, { exact: true }).first().fill(value);
  }
}

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("datos → envío; el pago avisa de que necesita JS", async ({ page }) => {
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
    await page.goto("/carrito/");
    await page.getByRole("link", { name: "Ir a pagar" }).click();

    // CP de Canarias rechazado en el servidor (se salta la validación HTML con novalidate).
    await page.locator("#datos form").evaluate((f) => f.setAttribute("novalidate", ""));
    await fillAddress(page, { "Código postal": "35001", Email: "mal" });
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/\/checkout\/#datos$/);
    await expect(page.getByText("Revisa los campos marcados.")).toBeVisible();
    await expect(page.getByText(/solo enviamos a la Península y Baleares/)).toBeVisible();
    await expect(page.getByText("Escribe un email válido.")).toBeVisible();
    await expect(page.locator("#datos").getByLabel("Nombre", { exact: true }).first()).toHaveValue(
      "Ana",
    );

    await fillAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/\/checkout\/#envio$/);
    await page.getByLabel(/Envío exprés/).check();
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await expect(page).toHaveURL(/\/checkout\/#pago$/);
    await expect(page.locator("#pago")).toContainText("necesitas activar JavaScript");
    await expect(page.locator("#resumen-titulo")).toBeVisible();
  });

  test("facturación distinta: se muestra al desmarcar la casilla (CSS)", async ({ page }) => {
    await addAndGoToCheckout(page);
    const billing = page.locator(".checkout-billing");
    await expect(billing).toBeHidden();
    await page.getByLabel("La dirección de facturación es la misma").uncheck();
    await expect(billing).toBeVisible();
  });
});

test.describe("con JS (Stripe test)", () => {
  test.skip(({ isMobile }) => isMobile, "el pago se prueba en escritorio");
  test.setTimeout(90_000);

  const stripeFrame = (page: Page): FrameLocator =>
    page.frameLocator('#pago-element iframe[name^="__privateStripeFrame"]').first();

  async function toPayment(page: Page) {
    await addAndGoToCheckout(page);
    await fillAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await expect(page).toHaveURL(/\/checkout\/#pago$/);
    await expect(page.getByRole("button", { name: /^Pagar y realizar pedido/ })).toBeEnabled({
      timeout: 30_000,
    });
  }

  async function fillCard(page: Page, number: string) {
    const frame = stripeFrame(page);
    await frame.getByRole("textbox", { name: /Número de (la )?tarjeta|Card number/i }).fill(number);
    await frame.getByRole("textbox", { name: /caducidad|Expiration/i }).fill("12 / 34");
    await frame.getByRole("textbox", { name: /Código de seguridad|CVC/i }).fill("123");
    // El Payment Element pide el país/CP según el país de la tarjeta; España no pide CP.
  }

  test("tarjeta 4242: pedido creado y página de confirmación", async ({ page }) => {
    await toPayment(page);
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "¡Gracias por tu pedido!" })).toBeVisible();
    await expect(page.getByText(/Pedido #\d+/)).toBeVisible();
    await expect(page.getByText("Calle Mayor 1")).toBeVisible();
    await expect(page.locator("header [data-cart-count]")).toBeHidden();

    // Otra sesión (sin la cookie last_order) no ve datos personales.
    const url = page.url();
    const other = await page.context().browser()!.newPage();
    await other.goto(url);
    await expect(other.getByText("Hemos recibido tu pedido.")).toBeVisible();
    await expect(other.getByText("Calle Mayor 1")).toHaveCount(0);
    await other.close();
  });

  test("tarjeta rechazada: aviso y se puede reintentar", async ({ page }) => {
    await toPayment(page);
    await fillCard(page, "4000 0000 0000 0002");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page.locator("#pago-mensaje")).toHaveText(/.+/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/checkout\/#pago$/);
    await expect(page.getByRole("button", { name: /^Pagar y realizar pedido/ })).toBeEnabled();
  });

  test("3DS: autenticar en el modal de prueba de Stripe", async ({ page }) => {
    await toPayment(page);
    await fillCard(page, "4000 0027 6000 3184");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    // Modal 3DS de pruebas: iframe three-ds-2-challenge → iframe "stripe-challenge-frame"
    // (testmode-acs.stripe.com) con los botones COMPLETE / FAIL (verificado con Stripe.js dahlia).
    // El botón aparece antes de que el modal termine de inicializarse: un clic inmediato se
    // pierde (PI sigue en requires_action). Se reintenta hasta salir del checkout.
    const complete = page
      .frameLocator('iframe[src*="three-ds-2-challenge"]')
      .frameLocator('iframe[name="stripe-challenge-frame"]')
      .getByRole("button", { name: "COMPLETE" });
    await expect(async () => {
      if (await complete.isVisible()) await complete.click({ timeout: 2_000 });
      await expect(page).toHaveURL(/\/pedido\//, { timeout: 3_000 });
    }).toPass({ timeout: 45_000 });
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
  });
});
