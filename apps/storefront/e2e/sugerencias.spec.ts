// e2e de las sugerencias de la barra de búsqueda (fase 7-2). Con JS: combobox (APG) con
// productos, categorías y "Ver todos". Sin JS: el campo es un searchbox normal (GET a /buscar/).
// Datos: catálogo mock indexado en Meilisearch (como e2e/buscar.spec.ts).
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const combo = (page: Page) => page.getByRole("combobox", { name: "Buscar productos" });
const list = (page: Page) => page.getByRole("listbox", { name: "Sugerencias" });

test("productos, categoría y Ver todos; teclado ↓/Enter abre la ficha", async ({ page }) => {
  await page.goto("/");
  await combo(page).fill("bufan"); // prefijo de la última palabra
  const options = list(page).getByRole("option");
  await expect(options.first()).toHaveText(/Bufanda/);
  await expect(combo(page)).toHaveAttribute("aria-expanded", "true");
  await expect(list(page).getByRole("option", { name: /«bufan» en Accesorios/ })).toBeVisible();
  await expect(options.last()).toHaveText("Ver todos los resultados para «bufan»");
  await expect(page.locator("[data-suggest-live]")).toHaveText(/\d+ sugerencias/);

  await combo(page).press("ArrowDown");
  const first = options.first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(combo(page)).toHaveAttribute(
    "aria-activedescendant",
    (await first.getAttribute("id"))!,
  );
  const href = (await first.getAttribute("href"))!;
  await combo(page).press("Enter");
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("Escape cierra; Enter sin opción marcada envía el formulario", async ({ page }) => {
  await page.goto("/");
  await combo(page).fill("jersei"); // errata (≥ 5 letras: el motor tolera 1)
  await expect(list(page).getByRole("option").first()).toHaveText(/Jersey/);
  await combo(page).press("Escape");
  await expect(list(page)).toBeHidden();
  await expect(combo(page)).toHaveAttribute("aria-expanded", "false");
  await combo(page).press("Enter");
  await expect(page).toHaveURL(/\/buscar\/\?q=jersei$/);
});

test("clic en la categoría → /buscar/ filtrado; sin resultados no se abre", async ({ page }) => {
  await page.goto("/productos/");
  await combo(page).fill("zzzqqqxxx");
  await expect(page.locator("[data-suggest-live]")).toHaveText("Sin sugerencias");
  await expect(list(page)).toBeHidden();
  await combo(page).fill("cami");
  await list(page)
    .getByRole("option", { name: /«cami» en Ropa/ })
    .click();
  await expect(page).toHaveURL(/\/buscar\/\?q=cami&categoria=ropa$/);
  await expect(page.locator("[data-results] article").first()).toContainText(/Camiseta/);
});

test("también en el carrito (páginas sin CartClient)", async ({ page }) => {
  await page.goto("/carrito/");
  await combo(page).fill("taz");
  await expect(list(page).getByRole("option").first()).toBeVisible();
});

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("campo normal, sin lista; el formulario busca", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(list(page)).toBeHidden();
    await page.getByRole("searchbox", { name: "Buscar productos" }).fill("jersei");
    await page.getByRole("searchbox", { name: "Buscar productos" }).press("Enter");
    await expect(page).toHaveURL(/\/buscar\/\?q=jersei$/);
  });

  test("endpoint: 301 canónica, caché, noindex; SiteClient ≤ 1,5 KB", async ({ page }) => {
    const r = await page.request.get("/buscar/sugerencias/?q=%20BUF%20%20N", { maxRedirects: 0 });
    expect(r.status()).toBe(301);
    expect(r.headers()["location"]).toBe("/buscar/sugerencias/?q=buf+n");
    const ok = await page.request.get("/buscar/sugerencias/?q=buf");
    expect(ok.headers()["cache-control"]).toContain("s-maxage=60");
    expect(ok.headers()["x-robots-tag"]).toBe("noindex");
    expect(await ok.text()).not.toMatch(/<html|€/);

    for (const path of ["/", "/carrito/"]) {
      const html = await (await page.request.get(path)).text();
      const site = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
        .map((m) => m[1]!)
        .filter((s) => /\/_astro\/SiteClient\.[^/]+\.js$/.test(s));
      expect(site, path).toHaveLength(1);
      const code = await (await page.request.get(site[0]!)).body();
      expect(gzipSync(code).length).toBeLessThanOrEqual(1536);
    }
  });
});
