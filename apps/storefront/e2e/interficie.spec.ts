import { expect, test, type Page } from "@playwright/test";

// I-Interficie: cabecera (menús popover sin JS, se oculta al bajar), barra de anuncios, pie,
// home, /ofertas/ (precio tachado) y /sobre-nosotros/. Datos: seed:mock:ofertas (Collection
// "destacados" y Price List sale de prueba).
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;
/** El panel móvil entra con una transición (translate): esperar a que termine antes del clic. */
const settled = (menu: ReturnType<Page["locator"]>) =>
  menu.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("menú de navegación con popover: categorías, ofertas y sobre nosotros", async ({ page }) => {
    await page.goto("/");
    const opener = isMobile(page)
      ? page.getByRole("button", { name: "Menú", exact: true })
      : page.getByRole("button", { name: "Tienda" });
    await opener.click();
    const menu = page.locator(isMobile(page) ? "#menu-movil" : "#menu-tienda");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Todos los productos" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    if (isMobile(page)) {
      await opener.click();
      await settled(menu);
    }
    const nav = isMobile(page) ? menu : page.getByRole("navigation", { name: "Principal" });
    await nav.getByRole("link", { name: "Ofertas" }).click();
    await expect(page).toHaveURL(/\/ofertas\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ofertas" })).toBeVisible();
  });

  test("sin «Mi cuenta» (fase 9) ni fila de categorías antigua", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Mi cuenta/ })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Categorías" })).toHaveCount(0);
  });

  test("barra de anuncios: copia duplicada fuera del árbol accesible", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("region", { name: "Anuncios" });
    await expect(bar.locator("ul")).toHaveCount(2);
    await expect(bar.locator("ul").nth(1)).toHaveAttribute("aria-hidden", "true");
    await expect(bar.locator("ul").nth(1)).toHaveAttribute("inert", "");
    await expect(bar.getByRole("link", { name: /Rebajas/ })).toHaveCount(1);
  });

  test("home: hero LCP, categorías, carrusel de destacados, ofertas y valores", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("main picture img").first();
    await expect(hero).toHaveAttribute("fetchpriority", "high");
    await expect(hero).toHaveAttribute("loading", "eager");
    await expect(page.getByRole("heading", { name: "Categorías" })).toBeVisible();
    const carousel = page.getByRole("region", { name: "Nuestros favoritos" });
    await expect(carousel).toHaveCount(1);
    await expect(carousel).toHaveAttribute("tabindex", "0");
    await expect(carousel.locator("article")).toHaveCount(12);
    await expect(page.getByRole("link", { name: "Ver ofertas" })).toHaveAttribute(
      "href",
      "/ofertas/",
    );
    await expect(page.getByRole("heading", { name: "Cómo trabajamos" })).toBeVisible();
  });

  test("/ofertas/: precio anterior tachado y descuento en cada tarjeta", async ({ page }) => {
    await page.goto("/ofertas/");
    const cards = page.locator("main article");
    expect(await cards.count()).toBeGreaterThan(0);
    const first = cards.first();
    await expect(first.locator("del")).toBeVisible();
    await expect(first.locator("[data-off]")).toHaveText(/^−\d+\u202f%$/);
    await expect(first.getByText("Oferta", { exact: true })).toBeVisible();
    // La ficha del mismo producto también muestra la oferta.
    await first.getByRole("heading").getByRole("link").click();
    await expect(page.locator("main del").first()).toBeVisible();
  });

  test("producto sin oferta: sin tachado", async ({ page }) => {
    await page.goto("/producto/mock-sudadera-artesano-006/");
    await expect(page.locator("main del").first()).toBeHidden();
  });

  test("el manifiesto de páginas de ofertas no es público", async ({ page }) => {
    expect((await page.request.get("/ofertas/paginas.json")).status()).toBe(404);
  });

  test("/sobre-nosotros/ y pie con contacto, redes y pagos", async ({ page }) => {
    await page.goto("/sobre-nosotros/");
    await expect(page.getByRole("heading", { level: 1, name: "Sobre nosotros" })).toBeVisible();
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "tienda@elrincondehiro.com" })).toHaveAttribute(
      "href",
      "mailto:tienda@elrincondehiro.com",
    );
    await expect(footer.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/34640260110",
    );
    for (const alt of ["Visa", "Mastercard", "American Express"])
      await expect(footer.getByRole("img", { name: alt })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: "Transferencia" })).toHaveCount(0);
  });
});

test.describe("con JS", () => {
  test.use({ javaScriptEnabled: true });

  test("la cabecera se oculta al bajar y vuelve al subir", async ({ page }) => {
    await page.goto("/productos/");
    const header = page.locator("[data-site-header]");
    await page.mouse.wheel(0, 1200);
    await expect(header).toHaveAttribute("data-hide", "");
    await page.mouse.wheel(0, -300);
    await expect(header).not.toHaveAttribute("data-hide");
  });

  test("/ofertas/: la island recibe una clave corta y devuelve los datos de la página", async ({
    page,
  }) => {
    const island = page.waitForResponse((r) => r.url().includes("/_server-islands/LiveSyncData"));
    await page.goto("/ofertas/");
    const res = await island;
    // Props de tamaño fijo (clave, no ids): URL corta y GET cacheable (astro-docs § Caching).
    expect(res.request().method()).toBe("GET");
    expect(res.url().length).toBeLessThan(600);
    const data = (await res.text()).match(/<template data-live-sync>(.*?)<\/template>/s)?.[1];
    const entries = Object.keys(JSON.parse(data ?? "{}"));
    expect(entries.length).toBeGreaterThanOrEqual(await page.locator("main article").count());
    await expect(page.locator("main article").first().locator("del")).toBeVisible();
  });
});
