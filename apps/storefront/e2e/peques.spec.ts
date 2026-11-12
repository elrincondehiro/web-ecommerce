// e2e del escaparate «Vuestros peques» y los cumpleaños (Fase MK-D). Requisitos: mascotas de
// prueba (`pnpm --filter backend pets:mock 60`: aprobadas, pendientes y fallecidas) y los de
// cuenta.spec.ts (Mailpit). 0 JS en /peques/: movimiento con CSS, pausa con :has().
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";

test.beforeEach(() => skipIfRemote("mascotas de prueba locales (pets:mock)"));

const cards = (page: Page) => page.getByRole("list", { name: "Peques" }).getByRole("listitem");

test.describe("escaparate sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("noindex, tarjetas con nombre y edad, fallecidas en el arcoíris; pausa", async ({
    page,
  }) => {
    const res = await page.goto("/peques/");
    expect(res?.headers()["cache-control"]).toContain("s-maxage");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vuestros peques");
    expect(await cards(page).count()).toBeGreaterThan(5);
    const first = cards(page).first();
    await expect(first.getByRole("img")).toHaveAttribute("src", /\/mascotas\/.+\.webp$/);
    await expect(first.locator(".peque__edad")).toHaveText(/\d+ (años|meses|año|mes)|menos de/);
    // Fallecidas: «Nombre · 2009–2023» (accesible una vez; el desfile, oculto a lectores)
    const arco = page.getByRole("region", { name: "Al otro lado del arcoíris" });
    await expect(arco.locator("ul.sr-only li").first()).toHaveText(/ · (\d{4}–\d{4}|†\d{4})$/);
    // Animadas, y la casilla las para (sin JS)
    const state = () => first.evaluate((e) => getComputedStyle(e).animationPlayState);
    expect(await first.evaluate((e) => getComputedStyle(e).animationName)).toMatch(/^peque-\d+$/);
    expect(await state()).toBe("running");
    await page.getByText("Parar el movimiento").click();
    expect(await state()).toBe("paused");
    await expect(page.getByText("Reanudar el movimiento")).toBeVisible();
    // Arcoíris: todas las tarjetas del desfile miden lo mismo (nombre y años en líneas fijas)
    const heights = await arco
      .locator(".peque--arcoiris")
      .evaluateAll((els) => [
        ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height))),
      ]);
    expect(heights).toHaveLength(1);
    // La página no se ensancha
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/peques.png", fullPage: true });
  });
});

test.describe("escaparate: movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });
  test("con prefers-reduced-motion, quietas", async ({ page }) => {
    await page.goto("/peques/");
    expect(
      await cards(page)
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
  });
});

test.describe("escaparate con JS: axe y CSP", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`tema ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const csp: string[] = [];
      page.on("console", (m) => {
        if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
      });
      await page.goto("/peques/");
      await expect(cards(page).first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(violations.map((v) => v.id)).toEqual([]);
      expect(csp).toEqual([]);
    });
  }
});

async function verifyLink(page: Page, to: string): Promise<string> {
  const re = /\/cuenta\/verificar\/\?token=([\w.-]+)/;
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = re.exec(msg.Text);
      if (match) return `/cuenta/verificar/?token=${match[1]}`;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email de verificación para ${to}`);
}

test.describe("Mis peques: casilla del escaparate y cumpleaños (sin JS)", () => {
  test.use({ javaScriptEnabled: false });

  test("casilla guardada sin foto; cumpleaños de hoy en la cuenta y en la ficha", async ({
    page,
  }) => {
    const email = testEmail("peques");
    await page.goto("/cuenta/registro/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/He leído y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.goto(await verifyLink(page, email));
    await page.getByRole("button", { name: "Confirmar mi email" }).click();
    await page.goto("/cuenta/entrar/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cuenta\/$/);

    // Hoy en Madrid
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })
      .format(new Date())
      .split("-")
      .map(Number);
    await page.goto("/cuenta/mascotas/nueva/");
    await page.getByLabel("Nombre").fill("Cumpleañero");
    await page.getByLabel("Tipo de animal").selectOption("perro");
    await page.locator("#f-birth_year").fill(String(y! - 3));
    await page.locator("#f-birth_month").selectOption(String(m));
    await page.locator("#f-birth_day").fill(String(d));
    await page.getByLabel(/salga en el escaparate/).check();
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText("¡Hoy cumple Cumpleañero 3 años!")).toBeVisible();
    await page.goto("/cuenta/");
    await expect(page.getByText(/🎂 ¡Hoy cumple Cumpleañero 3 años!/)).toBeVisible();
    // Resumen: una tarjeta por apartado, en el orden del menú (Fase MK-D)
    const order = [
      "Lista de deseos",
      "Avisos de stock",
      "Mis pedidos",
      "Mis datos",
      "Mis puntos",
      "Mis peques",
      "Direcciones",
      "Comunicaciones",
    ];
    await expect(page.locator("main section h2")).toHaveText(order);
    await expect(page.getByRole("navigation", { name: "Mi cuenta" }).getByRole("link")).toHaveText([
      "Resumen",
      ...order.map((o) => (o === "Mis pedidos" ? o : o)),
    ]);
    await expect(page.locator("#resumen-avisos ~ p")).toContainText("«Avísame»");
    await expect(page.locator("#resumen-comunicaciones ~ p")).toContainText("Solo te escribimos");
    // Casilla guardada (sin foto todavía no entra en el escaparate)
    await page.goto("/cuenta/mascotas/");
    await page
      .getByRole("link", { name: /Editar/ })
      .first()
      .click();
    await expect(page.getByLabel(/salga en el escaparate/)).toBeChecked();
  });
});
