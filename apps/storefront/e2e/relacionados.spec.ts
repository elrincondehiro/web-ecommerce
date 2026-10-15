// e2e de relacionados y venta cruzada (Fase R). Datos: catálogo mock de la BD local
// (`catalog:mock` rellena `relacionados` en 1 de cada 4 productos). Requisitos de cuenta.spec.ts
// para el bloque de la lista de deseos (EMAIL_TRANSPORT=smtp → Mailpit).
//   - Ficha: 4 relacionados (los de la hoja primero, luego su categoría), carrusel con ScrollDrag,
//     precio corregido por LiveSync; correa a medida sin bloque.
//   - Carrito: «Completa tu pedido» (relacionados de lo que lleva) y, con sesión, «De tu lista de
//     deseos» (disponibles ahora); «Añadir» con y sin JS; lo añadido deja de sugerirse.
import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";
// Hoja: relacionados «mock-collar-natural-014|mock-transportin-eco-015» (catalog:mock, i % 4 = 1)
const WITH_SHEET = "/producto/mock-abrigo-esencial-017/";
// Hoja: «mock-empapadores-eco-…|mock-botiquin-natural-024» (de una variante, con stock)
const CART_SOURCE = "/producto/mock-mordedor-premium-025/";
const NO_SHEET = "/producto/mock-clicker-esencial-018/";

const related = (page: Page) => page.locator('section[aria-labelledby="relacionados"]');
const suggested = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-cart-suggestions]")].map((s) => ({
      title: s.querySelector("h2")!.textContent!.trim(),
      items: [...s.querySelectorAll("li a[href^='/producto/']")].map((a) => a.textContent!.trim()),
    })),
  );

async function addFrom(page: Page, path: string) {
  await page.goto(path);
  await page
    .locator("form[data-cart-form]")
    .first()
    .getByRole("button", { name: /^Añadir .* al carrito$/ })
    .click();
  await expect(page.locator("#carrito-added:target, .toast").first()).toBeVisible();
}

test.describe("ficha", () => {
  test("los de la hoja primero, relleno hasta 4; carrusel con ScrollDrag; correa sin bloque", async ({
    page,
  }) => {
    await page.goto(WITH_SHEET);
    const cards = related(page).locator("li h3 a");
    await expect(cards).toHaveCount(4);
    const hrefs = await cards.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.slice(0, 2)).toEqual([
      "/producto/mock-collar-natural-014/",
      "/producto/mock-transportin-eco-015/",
    ]);
    expect(new Set(hrefs).size).toBe(4);
    expect(hrefs).not.toContain(WITH_SHEET);
    await expect(related(page).locator("[data-drag-scroll]")).toHaveCount(1);
    // Sin hoja: 4 de su categoría
    await page.goto(NO_SHEET);
    await expect(related(page).locator("li h3 a")).toHaveCount(4);
    // Correa a medida: sin relacionados
    await page.goto("/producto/correa-azul-nylon/");
    await expect(related(page)).toHaveCount(0);
  });

  test("precio de los relacionados corregido por LiveSync (sin errores)", async ({ page }) => {
    const live = page.waitForResponse(
      (r) => r.url().includes("/_server-islands/LiveSyncData") && r.status() === 200,
    );
    await page.goto(WITH_SHEET);
    await live;
    await expect(related(page).locator(".price__now").first()).toHaveText(/\d+,\d{2}\s€/);
  });
});

test.describe("carrito sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("«Completa tu pedido»: relacionados de lo que lleva; «Añadir» → 303 y deja de salir", async ({
    page,
  }) => {
    await addFrom(page, CART_SOURCE);
    await page.goto("/carrito/");
    const before = await suggested(page);
    expect(before.map((b) => b.title)).toEqual(["Completa tu pedido"]);
    expect(before[0]!.items).toContain("Botiquín Natural");
    const first = before[0]!.items[0]!;
    await page
      .locator("[data-cart-suggestions]")
      .getByRole("button", { name: `Añadir ${first} al carrito` })
      .click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-added$/);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-cart-view] form[data-cart-remove]")).toHaveCount(2);
    const after = await suggested(page);
    expect(after.flatMap((b) => b.items)).not.toContain(first);
  });
});

test.describe("carrito con JS", () => {
  test("«Añadir» sin recargar: la línea entra y la sugerencia se va", async ({ page }) => {
    await addFrom(page, CART_SOURCE);
    await page.goto("/carrito/");
    const first = (await suggested(page))[0]!.items[0]!;
    let navigated = false;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigated = true;
    });
    await page
      .locator("[data-cart-suggestions]")
      .getByRole("button", { name: `Añadir ${first} al carrito` })
      .click();
    await expect(page.locator("[data-cart-view] form[data-cart-remove]")).toHaveCount(2);
    expect((await suggested(page)).flatMap((b) => b.items)).not.toContain(first);
    expect(navigated).toBe(false);
  });
});

test.describe("carrito con sesión: lista de deseos", () => {
  test.use({ javaScriptEnabled: false });

  async function createAccount(page: Page, email: string) {
    await page.goto("/cuenta/registro/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/He leído y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    let token = "";
    for (let i = 0; i < 20 && !token; i++) {
      const res = await page.request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await res.json()) as { messages: { ID: string }[] };
      for (const m of messages) {
        const t = (
          (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
            Text: string;
          }
        ).Text;
        token = /\/cuenta\/verificar\/\?token=([\w.-]+)/.exec(t)?.[1] ?? token;
      }
      if (!token) await page.waitForTimeout(500);
    }
    await page.goto(`/cuenta/verificar/?token=${token}`);
    await page.getByRole("button", { name: "Confirmar mi email" }).click();
    await page.goto("/cuenta/entrar/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cuenta\/$/);
  }

  test("guardados disponibles, lo más reciente primero; sin lo que ya está en el carrito", async ({
    page,
  }) => {
    await createAccount(page, `e2e-rel-${Date.now()}@example.com`);
    for (const [path, title] of [
      [NO_SHEET, "Clicker Esencial"],
      ["/producto/mock-taza-sport-038/", "Taza Sport"],
    ] as const) {
      await page.goto(path);
      // El ♡ junto al título (button[name=wish]; las tarjetas de relacionados tienen el suyo y
      // los mock repiten títulos)
      await page
        .locator("button[name=wish]")
        .and(page.getByRole("button", { name: `Guardar ${title} en mi lista de deseos` }))
        .click();
      await expect(page).toHaveURL(/#deseos-wish_(added|already)$/);
    }
    await addFrom(page, CART_SOURCE);
    await page.goto("/carrito/"); // goto espera a `load`: la página entera
    const blocks = await suggested(page);
    expect(blocks.map((b) => b.title)).toEqual(["De tu lista de deseos", "Completa tu pedido"]);
    expect(blocks[0]!.items).toEqual(["Taza Sport", "Clicker Esencial"]);
    await expect(page.getByRole("link", { name: "Ver toda mi lista" })).toBeVisible();
    // Añadir uno de la lista: deja de sugerirse (sigue guardado: R6)
    await page
      .locator("[data-cart-suggestions]")
      .getByRole("button", { name: "Añadir Taza Sport al carrito" })
      .click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-added$/);
    // La página llega por streaming (las sugerencias van al final): esperar a que termine.
    await page.waitForLoadState("load");
    expect((await suggested(page))[0]!.items).toEqual(["Clicker Esencial"]);
    await page.goto("/cuenta/deseos/");
    await expect(page.getByRole("link", { name: "Taza Sport", exact: true })).toBeVisible();
  });
});
