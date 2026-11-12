// e2e del checkout (fase 5). Local: necesita backend con Stripe (claves de TEST en los .env),
// `pnpm infra:stripe` para los webhooks y red hacia Stripe. Ver docs/fases/fase5.md §5.
// Tarjetas de prueba de Stripe: 4242… (sin 3DS), 4000 0027 6000 3184 (3DS siempre),
// 4000 0000 0000 0002 (rechazada).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { REMOTE, testEmail } from "./_remote";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const PRODUCT = "/producto/mock-clicker-esencial-018/";
const BULK = "/producto/mock-premios-plus-010/"; // granel (S-3): paso 5 g, 20 €/kg
const CORREA = "/producto/correa-azul-nylon/"; // correa a medida (E-2c)
const CAJA = "/producto/caja-snacks/"; // caja de snacks (Fase CS)
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

/**
 * `bulkGrams`: gramos del granel, "correa" (7 m con medida y observaciones) o "caja" (caja de
 * snacks de 25 € para Toby).
 */
async function addAndGoToCheckout(page: Page, bulkGrams?: string) {
  await page.goto(
    bulkGrams === "correa" ? CORREA : bulkGrams === "caja" ? CAJA : bulkGrams ? BULK : PRODUCT,
  );
  if (bulkGrams === "caja") {
    const form = page.locator("form.caja-form");
    await form.locator("input[name=variant_id]").nth(2).check();
    await form.getByLabel("Nombre").fill("Toby");
    await form.getByLabel("Edad").fill("3");
    await form.getByLabel("Peso").fill("12.5");
    await form.locator("input[name=mastica][value=engulle]").check();
    await form.getByRole("button", { name: "Añadir caja al carrito" }).click();
  } else if (bulkGrams === "correa") {
    const form = page.locator("form[data-correa]");
    await form.locator("select[name=largo]").selectOption("7");
    await form.getByLabel(/Medida exacta/).fill("640");
    await form.getByLabel(/Observaciones/).fill("Para Hiro");
    await form.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
  } else if (bulkGrams) {
    await page.locator("#comprar").getByLabel("Cantidad (g)").fill(bulkGrams);
    await page
      .locator("#comprar")
      .getByRole("button", { name: "Añadir Premios Plus al carrito", exact: true })
      .click();
  } else {
    await page
      .locator("#comprar")
      .getByRole("button", { name: /^Añadir .* al carrito$/ })
      .click();
  }
  // Con JS: toast + contador; sin JS: 303 a la ficha con #carrito-added.
  await expect(page.locator("#carrito-added:target, #toasts .toast").first()).toBeVisible();
  await page.goto("/carrito/");
  await page.getByRole("link", { name: "Ir a pagar" }).click();
  await expect(page).toHaveURL(/\/checkout\/$/);
}

async function fillAddress(page: Page, overrides: Record<string, string> = {}) {
  const data = {
    Email: testEmail("e2e-checkout"),
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
    await page
      .locator("#comprar")
      .getByRole("button", { name: /^Añadir .* al carrito$/ })
      .click();
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
    page.locator('#pago-element iframe[name^="__privateStripeFrame"]').first().contentFrame();

  async function toPayment(page: Page, bulkGrams?: string, email?: string) {
    await addAndGoToCheckout(page, bulkGrams);
    await fillAddress(page, email ? { Email: email } : {});
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

  test("carga (Fase PG): esqueleto visible hasta que Stripe está listo", async ({ page }) => {
    await addAndGoToCheckout(page);
    await fillAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await expect(page.locator("#pago-estado")).toBeHidden(); // aviso sin JS
    await expect(page.getByRole("button", { name: /^Pagar y realizar pedido/ })).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.locator("#pago-cargando")).toHaveCount(0);
  });

  test("métodos (Fase PG): tarjeta, Bizum y PayPal", async ({ page }) => {
    await toPayment(page);
    // Acordeón (Fase PG): los tres a la vista, la tarjeta abierta.
    const frame = stripeFrame(page);
    for (const name of ["Tarjeta", "Bizum", "PayPal"]) {
      await expect(frame.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(frame.getByRole("textbox", { name: /Número de (la )?tarjeta/i })).toBeVisible();
  });

  /** Bizum (Fase PG): sin redirección; Stripe espera la aprobación (~5 s en test). */
  async function payBizum(page: Page, phone: string) {
    const frame = stripeFrame(page);
    await frame.getByRole("button", { name: "Bizum", exact: true }).click();
    const field = frame.getByRole("textbox", { name: /teléfono|phone/i });
    await field.fill(phone);
    // Salir del campo: Stripe valida y guarda el teléfono al perder el foco (sin esto, a veces el
    // clic inmediato en «Pagar» no llegaba a confirmar).
    await field.press("Tab");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
  }

  test("Bizum aprobado: pedido cobrado al momento", async ({ page }) => {
    await toPayment(page);
    await payBizum(page, "612345678");
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 60_000 });
    await expect(page.getByText("Pago recibido.")).toBeVisible();
  });

  test("Bizum rechazado (+34600000002): aviso y se puede reintentar", async ({ page }) => {
    await toPayment(page);
    await payBizum(page, "600000002");
    await expect(page.locator("#pago-mensaje")).not.toBeEmpty({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/checkout\//);
    await expect(page.getByRole("button", { name: /^Pagar y realizar pedido/ })).toBeEnabled();
  });

  test("PayPal: redirección a la página de prueba, vuelve y el pedido queda autorizado", async ({
    page,
  }) => {
    await toPayment(page);
    await stripeFrame(page).getByRole("button", { name: "PayPal", exact: true }).click();
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    // Página de pruebas de Stripe (payments.stripe.com): «Authorize Test Payment».
    await expect(page).toHaveURL(/payments\.stripe\.com/, { timeout: 30_000 });
    await page.getByRole("link", { name: "Authorize Test Payment" }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 60_000 });
    await expect(page.getByText("El cargo se hace cuando preparamos el envío.")).toBeVisible();
  });

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

  test("granel (S-3): resumen, confirmación y email en gramos y €/kg", async ({ page }) => {
    const email = testEmail("granel");
    await toPayment(page, "250", email);
    const grams = /250\sg\s·\s?Premios Plus/;
    await expect(page.locator("#resumen-titulo + ul")).toContainText(grams);
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    await expect(page.locator("#pedido-lineas + ul")).toContainText(grams);
    await expect(page.locator("#pedido-lineas + ul")).toContainText("5,00 €");
    // Email de confirmación (Mailpit, EMAIL_TRANSPORT=smtp): gramos y €/kg, no «50 ×». En
    // remoto el email va a Resend (delivered+…@resend.dev): se revisa a mano.
    if (REMOTE) return;
    let text = "";
    for (let i = 0; i < 40 && !text; i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      if (messages[0]) {
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        text = ((await msg.json()) as { Text: string }).Text;
      } else await page.waitForTimeout(500);
    }
    expect(text).toMatch(/250 g · 20,00\s€\/kg/);
    expect(text).not.toMatch(/50 ×/);
  });

  test("correa a medida (E-2c): medida y observaciones en resumen, pedido y email", async ({
    page,
  }) => {
    const email = testEmail("correa");
    await toPayment(page, "correa", email);
    const details = ["Medida exacta: 6,40 m", "Observaciones: Para Hiro"];
    for (const d of details) await expect(page.locator("#resumen-titulo + ul")).toContainText(d);
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    for (const d of details) await expect(page.locator("#pedido-lineas + ul")).toContainText(d);
    if (REMOTE) return; // email: Mailpit solo en local
    let text = "";
    for (let i = 0; i < 40 && !text; i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      if (messages[0]) {
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        text = ((await msg.json()) as { Text: string }).Text;
      } else await page.waitForTimeout(500);
    }
    for (const d of details) expect(text).toContain(d);
  });

  test("caja de snacks (Fase CS): para quién es en resumen, pedido y email", async ({ page }) => {
    const email = testEmail("caja");
    await toPayment(page, "caja", email);
    // Web: «Para Toby» (<details>); email: una línea resumida y el resto en pequeño
    const details = ["Para Toby", "Perro", "3 años · 12,5 kg aprox.", "Mastica: engulle"];
    const mailDetails = ["Para Toby (perro, 3 años, 12,5 kg aprox.)", "Mastica: engulle"];
    await page.locator("#resumen-titulo + ul summary").click();
    for (const d of details) await expect(page.locator("#resumen-titulo + ul")).toContainText(d);
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    await page.locator("#pedido-lineas + ul summary").click();
    for (const d of details) await expect(page.locator("#pedido-lineas + ul")).toContainText(d);
    // CS-3: hasta que se le propone, el cliente ve «Preparando tu caja» (no el contenido)
    await expect(page.locator("#pedido-lineas + ul")).toContainText("Preparando tu caja");
    if (REMOTE) return; // email: Mailpit solo en local
    let text = "";
    for (let i = 0; i < 40 && !text; i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      if (messages[0]) {
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        text = ((await msg.json()) as { Text: string }).Text;
      } else await page.waitForTimeout(500);
    }
    for (const d of mailDetails) expect(text).toContain(d);
  });

  test("caja de snacks (CS-4): propuesta por email, «No me convence» y aceptar desde el enlace", async ({
    page,
    browser,
  }) => {
    test.skip(REMOTE, "necesita Mailpit y el script del backend local");
    test.setTimeout(240_000);
    const email = testEmail("caja-cs4");
    await toPayment(page, "caja", email);
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pagar y realizar pedido/ }).click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    const orderId = /\/pedido\/(order_[A-Za-z0-9]+)\//.exec(page.url())![1]!;
    // La tienda la prepara y la propone (lo que haría en el Admin)
    const out = execFileSync("pnpm", ["--filter", "backend", "caja:e2e", orderId], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 180_000,
    });
    expect(out).toContain("1 caja(s) propuesta(s)");
    // Email con el contenido y el enlace de un solo uso
    let text = "";
    for (let i = 0; i < 60 && !text.includes("/cuenta/caja/"); i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:caja`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      if (messages[0]) {
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        text = ((await msg.json()) as { Text: string }).Text;
      } else await page.waitForTimeout(500);
    }
    expect(text).toContain("Para Toby");
    const link = /https?:\/\/[^\s\]]+\/cuenta\/caja\/\?[^\s\]]+/
      .exec(text)![0]
      .replace(/&amp;/g, "&");
    const path = new URL(link).pathname + new URL(link).search;
    // En el pedido ya se ve el contenido
    await page.reload();
    // Estado destacado (badge) bajo el nombre de la caja
    await expect(page.locator("#pedido-lineas + ul [data-caja-state=propuesta]")).toContainText(
      "dinos si te convence",
    );
    // El contenido va DENTRO de la caja (no como líneas sueltas a 0 €)
    const lines = page.locator("#pedido-lineas + ul > li");
    await expect(lines).toHaveCount(1);
    await expect(lines.first()).toContainText("En la caja");

    // Sin JS: abrir el enlace no responde nada; «No me convence» sin motivo no se envía (required)
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const p2 = await noJs.newPage();
    await p2.goto(path);
    await expect(p2.getByRole("heading", { name: "La caja de Toby" })).toBeVisible();
    await expect(p2.locator("#caja-contenido + ul li")).not.toHaveCount(0);
    await p2.getByText("No me convence").click();
    await p2.getByLabel(/¿Qué no le gusta\?/).fill("Le sientan mal los de pollo");
    await p2.getByRole("button", { name: "Enviar y rehacer la caja" }).click();
    await expect(p2.getByText(/Rehacemos la caja/)).toBeVisible();
    // De un solo uso: el mismo enlace ya no vale
    await p2.goto(path);
    await expect(
      p2.getByText("El enlace no es válido o esta caja ya está respondida"),
    ).toBeVisible();
    await noJs.close();
    // El cliente vuelve a ver «Preparando tu caja» (sin el contenido rechazado)
    await page.reload();
    await expect(page.locator("#pedido-lineas + ul")).toContainText("Preparando tu caja");
    await expect(page.locator("#pedido-lineas + ul")).not.toContainText("En la caja");

    // La tienda la rehace y la vuelve a proponer; esta vez acepta (con JS: el mismo formulario)
    execFileSync("pnpm", ["--filter", "backend", "caja:e2e", orderId], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 180_000,
    });
    let second = "";
    for (let i = 0; i < 60 && !second; i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:caja`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      if (messages.length >= 2) {
        const msg = await page.request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`);
        const t = ((await msg.json()) as { Text: string }).Text;
        if (t !== text) second = t;
      } else await page.waitForTimeout(500);
    }
    const link2 = /https?:\/\/[^\s\]]+\/cuenta\/caja\/\?[^\s\]]+/
      .exec(second)![0]
      .replace(/&amp;/g, "&");
    await page.goto(new URL(link2).pathname + new URL(link2).search);
    await page.getByRole("button", { name: "Me encanta, ¡adelante!" }).click();
    await expect(page.getByText(/te la enviamos con el resto/)).toBeVisible();
    await page.goBack();
    await page.goto(`/pedido/${orderId}/`);
    await expect(page.locator("#pedido-lineas + ul [data-caja-state=aceptada]")).toContainText(
      "Caja aceptada",
    );
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
