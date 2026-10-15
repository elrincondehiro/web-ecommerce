// e2e del programa de puntos (Fase L-3). Requisitos: los de checkout.spec.ts (Stripe test) y
// cuenta.spec.ts (EMAIL_TRANSPORT=smtp → Mailpit). El saldo se da con el script del backend
// `points:adjust` (mismo ajuste que el Admin), así que necesita la BD local del backend.
// - Sin JS: invitado ve «ganarías X»; con cuenta, /cuenta/puntos/ con saldo y movimientos;
//   en el pago «Usar Y €» (PRG) → «Puntos −Y €» y total menor → «Quitar»; importe no válido y
//   por encima del tope → aviso.
// - Con JS (Stripe test): pagar con puntos → /pedido/ con «Puntos −X €» → email con «Puntos
//   usados» y «ganarás» → el saldo baja.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";
const PRODUCT = "/producto/mock-clicker-esencial-018/";
const REPO = fileURLToPath(new URL("../../..", import.meta.url));

/** Abona `amount` € al cliente con el script del backend (ajuste manual, como en el Admin). */
function credit(email: string, amount: number) {
  const out = execFileSync(
    "pnpm",
    ["--filter", "backend", "points:adjust", email, "credit", String(amount), "e2e de puntos"],
    { cwd: REPO, encoding: "utf8", timeout: 120_000 },
  );
  if (!out.includes("points:adjust: credit")) throw new Error("points:adjust no abonó");
}

async function mailText(page: Page, to: string, match: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      if (match.test(msg.Text)) return msg.Text;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email para ${to}`);
}

async function createAccount(page: Page, email: string) {
  await page.goto("/cuenta/registro/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/cuenta\/entrar\/$/);
  const text = await mailText(page, email, /\/cuenta\/verificar\/\?token=/);
  const token = /\/cuenta\/verificar\/\?token=([\w.-]+)/.exec(text)![1];
  await page.goto(`/cuenta/verificar/?token=${token}`);
  await page.getByRole("button", { name: "Confirmar mi email" }).click();
  await expect(page.getByText("¡Email confirmado!")).toBeVisible();
}

async function login(page: Page, email: string) {
  await page.goto("/cuenta/entrar/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta\/$/);
}

/** Producto al carrito → checkout → dirección → envío (sin JS: todo POST + PRG). */
async function toPayment(page: Page, email?: string) {
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
  await expect(page.locator("#carrito-added:target, .toast").first()).toBeVisible();
  await page.goto("/checkout/");
  const step = page.locator("#datos");
  const data: Record<string, string> = {
    Teléfono: "600 123 456",
    Nombre: "Ana",
    Apellidos: "Pérez",
    Dirección: "Calle Mayor 1",
    "Código postal": "28001",
    Población: "Madrid",
  };
  if (email) data.Email = email;
  for (const [label, value] of Object.entries(data)) {
    await step.getByLabel(label, { exact: true }).first().fill(value);
  }
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/#pago$/);
}

const euros = (text: string) =>
  Number(/([\d.]+,\d{2})/.exec(text)![1]!.replace(".", "").replace(",", "."));
const total = async (page: Page) =>
  euros((await page.locator("#resumen-titulo ~ dl dt:text-is('Total') + dd").textContent())!);

test.describe("puntos sin JS", () => {
  test.use({ javaScriptEnabled: false });
  test.describe.configure({ mode: "serial" });
  const email = `e2e-puntos-${Date.now()}@example.com`;

  test("invitado: el resumen dice cuánto ganaría con una cuenta", async ({ page }) => {
    await toPayment(page, "invitado-puntos@example.com");
    const earn = page.locator("[data-points-earn]");
    await expect(earn).toContainText(/Con una cuenta ganarías \d+,\d{2}\s€ en puntos/);
    await expect(earn.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
    await expect(page.locator("#puntos")).toHaveCount(0);
  });

  test("Mis puntos: saldo y movimientos", async ({ page }) => {
    await createAccount(page, email);
    // El cliente de Medusa se crea al entrar por primera vez (fase 9): abonar después.
    await login(page, email);
    credit(email, 5);
    await page.reload();
    await expect(page.locator("#resumen-puntos ~ p")).toContainText("5,00 € en puntos");
    await page.getByRole("link", { name: "Ver mis puntos" }).click();
    await expect(page).toHaveURL(/\/cuenta\/puntos\/$/);
    await expect(page.locator("[data-points-balance]")).toHaveText(/5,00\s€ en puntos/);
    await expect(page.locator("[data-points-transactions] li").first()).toContainText("Ajuste");
    await expect(page.locator("[data-points-transactions] li").first()).toContainText("+5,00");
    // Condiciones (L-4): página legal provisional, noindex.
    await page.getByRole("link", { name: "Condiciones del programa de puntos" }).click();
    await expect(page).toHaveURL(/\/condiciones-puntos\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Condiciones del programa de puntos",
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("checkout: usar el máximo, quitar, importe no válido y por encima del tope", async ({
    page,
  }) => {
    await login(page, email);
    await toPayment(page);
    const block = page.locator("#puntos");
    await expect(block).toContainText("Tienes 5,00 € en puntos");
    await expect(page.locator("[data-points-earn]")).toContainText(
      /ganarás \d+,\d{2}\s€ en puntos/,
    );
    const before = await total(page);

    await block.getByRole("button", { name: "Usar 5,00 €" }).click();
    await expect(page).toHaveURL(/\/checkout\/#pago$/);
    await expect(block).toContainText("Usas 5,00 € en puntos");
    await expect(page.locator("[data-points-used]")).toHaveText(/−5,00\s€/);
    expect(Math.round((before - (await total(page))) * 100)).toBe(500);

    // El carrito muestra también los puntos aplicados (el total cuadra).
    await page.goto("/carrito/");
    await expect(page.locator("main dl")).toContainText(/Puntos\s*−5,00\s€/);
    await page.goto("/checkout/");

    await block.getByRole("button", { name: "Quitar" }).click();
    await expect(block).toContainText("Tienes 5,00 € en puntos");
    expect(await total(page)).toBe(before);

    // Otro importe: no válido y por encima del tope (se salta la validación HTML).
    const other = block.locator("details form");
    await other.evaluate((f) => f.setAttribute("novalidate", ""));
    await block.getByText("Usar otro importe").click();
    await other.getByLabel("Importe en €").fill("1,234");
    await other.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Escribe un importe válido")).toBeVisible();
    await block.getByText("Usar otro importe").click();
    await other.getByLabel("Importe en €").fill("9");
    await other.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Ese importe supera lo que puedes usar")).toBeVisible();
    await block.getByText("Usar otro importe").click();
    await other.getByLabel("Importe en €").fill("1,50");
    await other.getByRole("button", { name: "Aplicar" }).click();
    await expect(block).toContainText("Usas 1,50 € en puntos");
    await block.getByRole("button", { name: "Quitar" }).click();
  });
});

test.describe("puntos con JS (Stripe test)", () => {
  test.skip(({ isMobile }) => isMobile, "el pago se prueba en escritorio");
  test.setTimeout(120_000);

  test("pagar con puntos: pedido, email y saldo", async ({ page }) => {
    const email = `e2e-puntos-pago-${Date.now()}@example.com`;
    await createAccount(page, email);
    await login(page, email);
    credit(email, 3);
    await toPayment(page);
    await page.locator("#puntos").getByRole("button", { name: "Usar 3,00 €" }).click();
    await expect(page.locator("[data-points-used]")).toHaveText(/−3,00\s€/);
    const pay = page.getByRole("button", { name: /^Pagar y realizar pedido/ });
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    const frame = page
      .locator('#pago-element iframe[name^="__privateStripeFrame"]')
      .first()
      .contentFrame();
    await frame
      .getByRole("textbox", { name: /Número de (la )?tarjeta|Card number/i })
      .fill("4242 4242 4242 4242");
    await frame.getByRole("textbox", { name: /caducidad|Expiration/i }).fill("12 / 34");
    await frame.getByRole("textbox", { name: /Código de seguridad|CVC/i }).fill("123");
    await pay.click();
    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
    await expect(page.locator("[data-points-used]")).toHaveText(/−3,00\s€/);

    const text = await mailText(page, email, /Hemos recibido|Gracias por tu pedido/);
    expect(text).toMatch(/Puntos usados\s+−3,00\s€/);
    expect(text).toMatch(/ganarás \d+,\d{2}\s€ en puntos/);

    // El cargo lo hace el subscriber de order.placed (asíncrono): reintentos.
    await expect(async () => {
      await page.goto("/cuenta/puntos/");
      await expect(page.locator("[data-points-balance]")).toHaveText(/0,00\s€ en puntos/);
    }).toPass({ timeout: 20_000 });
    await expect(page.locator("[data-points-transactions] li").first()).toContainText(
      /Usados en el pedido #\d+/,
    );
    await expect(page.locator("[data-points-pending]")).toBeVisible();
  });
});
