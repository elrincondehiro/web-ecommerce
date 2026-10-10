// e2e de la cuenta de cliente (fase 9), SIN JS (mejora progresiva, AGENTS §3.2).
// Requisitos (además de los de playwright.config.ts): backend con EMAIL_TRANSPORT=smtp (Mailpit
// en :8025) para leer los enlaces de verificación y de restablecer contraseña.
import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";

/**
 * Enlace del storefront con `path` del email MÁS RECIENTE a `to` (Mailpit lista del más nuevo al
 * más antiguo). Cada solicitud de verificación genera un código nuevo e invalida el anterior.
 */
async function mailLink(page: Page, to: string, path: string, minCount = 1): Promise<string> {
  const re = new RegExp(`${path.replace(/\//g, "\\/")}\\?token=([\\w.-]+)`);
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length < minCount) {
      await page.waitForTimeout(500);
      continue;
    }
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = re.exec(msg.Text);
      if (match) return `${path}?token=${match[1]}`;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email con ${path} para ${to}`);
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/cuenta/entrar/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("cuenta sin JS", () => {
  test.use({ javaScriptEnabled: false });
  // Comparten la cuenta creada en el primer test.
  test.describe.configure({ mode: "serial" });
  const email = `e2e-${Date.now()}@example.com`;

  test("registro → verificar email → entrar (bienvenida) → salir", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Mi cuenta" }).first().click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/$/);
    await page.getByRole("link", { name: "Crear una cuenta" }).click();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/He leído y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/$/);
    await expect(
      page.getByRole("status").filter({ hasText: "confirmar tu dirección" }),
    ).toBeVisible();

    // Sin verificar no se entra (se reenvía el enlace).
    await login(page, email);
    await expect(page.getByText(/Te hemos enviado un email para confirmar/)).toBeVisible();

    // Abrir el enlace no gasta el código: se confirma con el botón.
    // Dos emails (registro + reenvío al entrar sin verificar): vale el último.
    await page.goto(await mailLink(page, email, "/cuenta/verificar/", 2));
    await page.getByRole("button", { name: "Confirmar mi email" }).click();
    await expect(page.getByText("¡Email confirmado!")).toBeVisible();

    await login(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mi cuenta");

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByText("Has cerrado la sesión.")).toBeVisible();
    await page.goto("/cuenta/datos/");
    await expect(page).toHaveURL(/\/cuenta\/entrar\/\?next=%2Fcuenta%2Fdatos%2F$/);
  });

  test("móvil: las páginas de la cuenta no desbordan en horizontal", async ({ page }) => {
    // El menú de la cuenta (scroll horizontal) estiraba la columna del grid: ~420 px en 320.
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page, email);
    for (const path of ["/cuenta/", "/cuenta/pedidos/", "/cuenta/direcciones/", "/cuenta/datos/"]) {
      await page.goto(path);
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll, path).toBeLessThanOrEqual(client);
    }
  });

  test("datos y direcciones; el checkout se rellena con la predeterminada", async ({ page }) => {
    await login(page, email);
    await page.getByRole("link", { name: "Mis datos" }).first().click();
    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellidos").fill("Pérez");
    await page.getByLabel("Teléfono").fill("600 123 456");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();

    await page.getByRole("link", { name: "Direcciones" }).first().click();
    const form = page.locator("#nueva");
    await form.getByLabel("Nombre de la dirección").fill("Casa");
    await form.getByLabel("Nombre", { exact: true }).fill("Ana");
    await form.getByLabel("Apellidos").fill("Pérez");
    await form.getByLabel("Dirección", { exact: true }).fill("Calle Mayor 1");
    await form.getByLabel("Código postal").fill("28001");
    await form.getByLabel("Población").fill("Madrid");
    await form.getByLabel("Teléfono").fill("600123456");
    await form.getByRole("button", { name: "Guardar dirección" }).click();
    await expect(page.getByText("Dirección guardada.")).toBeVisible();
    await expect(page.getByText("Predeterminada", { exact: true })).toBeVisible();

    await page.goto("/producto/mock-bufanda-natural-020/");
    await page.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
    await page.goto("/checkout/");
    const datos = page.locator("#datos");
    await expect(datos.getByLabel("Email")).toHaveValue(email);
    await expect(datos.getByLabel("Dirección", { exact: true }).first()).toHaveValue(
      "Calle Mayor 1",
    );
    await expect(datos.getByLabel("Teléfono")).toHaveValue("+34600123456");
  });

  test("recuperar contraseña: enlace de un solo uso", async ({ page }) => {
    await page.goto("/cuenta/recuperar/");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText(/Si hay una cuenta con ese email/)).toBeVisible();

    const link = await mailLink(page, email, "/cuenta/restablecer/");
    await page.goto(link);
    await page.getByLabel("Contraseña nueva").fill("Nueva-4567");
    await page.getByLabel("Repite la contraseña").fill("Nueva-4567");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("Contraseña cambiada.")).toBeVisible();

    await page.goto(link);
    await page.getByLabel("Contraseña nueva").fill("Otra-99999");
    await page.getByLabel("Repite la contraseña").fill("Otra-99999");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("El enlace no es válido o ha caducado.")).toBeVisible();

    await login(page, email, "Nueva-4567");
    await expect(page).toHaveURL(/\/cuenta\/$/);
  });

  test("el carrito sigue a la cuenta: tras salir y en otro navegador", async ({
    page,
    browser,
  }) => {
    // Con sesión y sin carrito en el navegador: el carrito nace asociado al cliente.
    await login(page, email, "Nueva-4567");
    await page.context().clearCookies({ name: "cart_id" });
    await page.goto("/producto/mock-bufanda-natural-020/");
    await page.getByRole("button", { name: /^Añadir .* al carrito$/ }).click();
    await page.goto("/cuenta/");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.goto("/carrito/");
    await expect(page.getByText(/bufanda/i)).toHaveCount(0);

    await login(page, email, "Nueva-4567");
    await page.goto("/carrito/");
    await expect(page.getByText(/bufanda/i).first()).toBeVisible();

    // Otro "dispositivo": contexto nuevo, sin cookies.
    const other = await browser.newContext({ javaScriptEnabled: false });
    const page2 = await other.newPage();
    await login(page2, email, "Nueva-4567");
    await page2.goto("/carrito/");
    await expect(page2.getByText(/bufanda/i).first()).toBeVisible();
    await other.close();
  });
});

test.describe("cuenta con JS", () => {
  test("en las páginas de cuenta el icono del carrito abre el panel", async ({ page }) => {
    await page.goto("/cuenta/entrar/");
    await page.getByRole("link", { name: /^Carrito( \d+)?$/ }).click();
    await expect(page.locator("#cart-flyout")).toBeVisible();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/$/);
  });
});
