// e2e de la búsqueda (fase 7-1). Criterio de salida: todo funciona CON JS DESACTIVADO.
// Datos: catálogo mock (`catalog:mock` + `catalog:import catalog/mock`) indexado en Meilisearch.
// Animaciones fuera (prefers-reduced-motion): Playwright espera elementos estables.
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const status = (page: Page) => page.locator("[data-results] [role=status]");
/** Panel de filtros (uno solo): barra lateral en escritorio, popover en móvil. */
async function filters(page: Page, isMobile: boolean) {
  if (isMobile && !(await page.locator("#filtros:popover-open").count())) {
    await page.locator("[data-results] button[popovertarget=filtros]").click();
  }
  return page.locator("#filtros");
}
/** Enlace-casilla de un valor (modelo híbrido: sin JS, cada clic navega). */
const box = (page: Page, group: string, label: string) =>
  page
    .locator(`#filtros #f-${group} a[role=checkbox]`)
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*\\d*$`) });

test.use({ javaScriptEnabled: false, reducedMotion: "reduce" });

test("buscar desde la cabecera, con erratas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Buscar productos" }).fill("abrijo");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/buscar\/\?q=abrijo$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Resultados para «abrijo»");
  await expect(status(page)).toContainText(/\d+ productos? para «abrijo»/);
  await expect(page.locator("[data-results] article").first()).toContainText(/Abrigo/i);
  // El campo de la cabecera conserva lo buscado
  await expect(page.getByRole("searchbox", { name: "Buscar productos" })).toHaveValue("abrijo");
});

test("sin resultados", async ({ page }) => {
  await page.goto("/buscar/?q=zzzqqqxxx");
  await expect(page.getByText("No hay productos que coincidan.")).toBeVisible();
  await expect(page.locator("[data-results] article")).toHaveCount(0);
});

test("filtrar (OR dentro, AND entre grupos), chips y quitar todo", async ({ page, isMobile }) => {
  await page.goto("/buscar/?categoria=ropa-perro");
  const total = Number((await status(page).textContent())!.match(/\d+/)![0]);
  // Sin JS cada clic navega y la página nueva se abre en el grupo pulsado (#f-…)
  await filters(page, isMobile);
  await box(page, "talla", "M").click();
  await expect(page).toHaveURL(/categoria=ropa-perro&opcion=Talla%3AM#f-talla$/);
  await filters(page, isMobile);
  await box(page, "talla", "L").click();
  await expect(page).toHaveURL(/opcion=Talla%3AL&opcion=Talla%3AM#f-talla$/);
  await filters(page, isMobile);
  await box(page, "color", "Rojo").click();
  await expect(page).toHaveURL(
    /categoria=ropa-perro&opcion=Color%3ARojo&opcion=Talla%3AL&opcion=Talla%3AM#f-color$/,
  );
  const filtered = Number((await status(page).textContent())!.match(/\d+/)![0]);
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  const chips = page.getByRole("group", { name: "Filtros aplicados" });
  await expect(chips.getByRole("link", { name: /^Quitar filtro/ })).toHaveCount(4);

  // Quitar un chip deja el resto
  await chips.getByRole("link", { name: "Quitar filtro Color: Rojo" }).click();
  await expect(page).toHaveURL(/categoria=ropa-perro&opcion=Talla%3AL&opcion=Talla%3AM$/);
  await filters(page, isMobile);
  await expect(box(page, "talla", "M")).toHaveAttribute("aria-checked", "true");
  await expect(box(page, "color", "Rojo")).toHaveAttribute("aria-checked", "false");
  if (isMobile) await page.keyboard.press("Escape");

  await chips.getByRole("link", { name: "Quitar todo" }).click();
  await expect(page).toHaveURL(/\/buscar\/$/);
});

test("categoría por niveles: raíces → hijas; gana la más concreta", async ({ page, isMobile }) => {
  await page.goto("/buscar/");
  await filters(page, isMobile);
  await expect(box(page, "categoria", "Alimentación")).toHaveCount(0);
  await box(page, "categoria", "Perro").click();
  await expect(page).toHaveURL(/\/buscar\/\?categoria=perro#f-categoria$/);
  const perro = Number((await status(page).textContent())!.match(/\d+/)![0]);
  await filters(page, isMobile);
  await box(page, "categoria", "Alimentación").click();
  await expect(page).toHaveURL(/categoria=alimentacion-perro&categoria=perro#f-categoria$/);
  const alimentacion = Number((await status(page).textContent())!.match(/\d+/)![0]);
  expect(alimentacion).toBeGreaterThan(0);
  expect(alimentacion).toBeLessThan(perro);
  await filters(page, isMobile);
  await expect(box(page, "categoria", "Piensos")).toHaveAttribute("aria-checked", "false");
});

test("precio, disponibilidad, orden y paginación", async ({ page, isMobile }) => {
  // Todo el catálogo: "Solo disponibles" solo aparece si hay agotados entre los resultados
  await page.goto("/buscar/");
  let panel = await filters(page, isMobile);
  await panel.getByRole("checkbox", { name: "Solo disponibles" }).click();
  await expect(page).toHaveURL(/\/buscar\/\?disponible=1#f-disponible$/);
  panel = await filters(page, isMobile);
  await panel.getByLabel("Precio máximo").fill("20");
  await panel.getByRole("button", { name: "Ver resultados" }).click();
  await expect(page).toHaveURL(/\/buscar\/\?precio_max=20&disponible=1#resultados$/);

  await page.getByLabel("Ordenar por").selectOption("precio-asc");
  await page.getByRole("button", { name: "Ordenar" }).click();
  await expect(page).toHaveURL(/precio_max=20&disponible=1&orden=precio-asc$/);
  const prices = await page
    .locator("[data-results] [data-price]")
    .evaluateAll((els) =>
      els.map((e) => Number(e.textContent!.replace(/[^\d,]/g, "").replace(",", "."))),
    );
  expect(prices.length).toBe(24);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  for (const p of prices) expect(p).toBeLessThanOrEqual(20);

  await page.goto("/buscar/?categoria=perro");
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/categoria=perro&pagina=2$/);
  await expect(page.getByText(/Página 2 de \d+/)).toBeVisible();
});

test("proteína sobre materia seca (S-2): rango, chip y quitar", async ({ page, isMobile }) => {
  await page.goto("/buscar/?categoria=alimentacion-perro");
  const total = Number((await status(page).textContent())!.match(/\d+/)![0]);
  const panel = await filters(page, isMobile);
  await panel.getByLabel("Proteína mínima, % sobre materia seca").fill("40");
  await panel.getByRole("button", { name: "Ver resultados" }).click();
  await expect(page).toHaveURL(/categoria=alimentacion-perro&proteina_min=40#resultados$/);
  const filtered = Number((await status(page).textContent())!.match(/\d+/)![0]);
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  const chip = page.getByRole("link", { name: "Quitar filtro Proteína s.m.: ≥ 40 %" });
  await chip.click();
  await expect(page).toHaveURL(/\/buscar\/\?categoria=alimentacion-perro$/);
});

test("botón Filtrar de una categoría estática → /buscar/ con la categoría", async ({ page }) => {
  await page.goto("/categoria/ropa-perro/");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.locator("#filtros input[value='Color:Azul']").check();
  await page.locator("#filtros").getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/\/buscar\/\?categoria=ropa-perro&opcion=Color%3AAzul$/);
  await expect(page.getByRole("link", { name: "Quitar filtro Color: Azul" })).toBeVisible();
});

test("tarjetas.json no es público; un solo panel de filtros; fragmento", async ({ page }) => {
  expect((await page.request.get("/buscar/tarjetas.json")).status()).toBe(404);
  const html = await (await page.request.get("/buscar/?q=abrijo")).text();
  expect(html.match(/data-filter-panel/g)).toHaveLength(1);
  // Miniaturas del build (no placeholder) aunque el manifiesto ya no esté en dist/client
  expect(html).toMatch(/<source srcset="\/_astro\/[^"]+\.avif/);
  // Fragmento del modelo híbrido: sin <html>, mismos resultados, canónico (301) y noindex
  const part = await page.request.get("/buscar/parcial/?q=abrijo");
  expect(part.headers()["x-robots-tag"]).toBe("noindex");
  const body = await part.text();
  expect(body).not.toContain("<html");
  expect(body.match(/data-filter-panel/g)).toHaveLength(1);
  const r = await page.request.get("/buscar/parcial/?opcion=Talla:M&q=abrijo", {
    maxRedirects: 0,
  });
  expect(r.status()).toBe(301);
  expect(r.headers()["location"]).toBe("/buscar/parcial/?q=abrijo&opcion=Talla%3AM");
});

test("URL no canónica → 301; JS: carrito + común + SearchLive ≤ 1 KB", async ({ page }) => {
  const res = await page.request.get("/buscar/?opcion=Talla:M&q=abrijo&categoria=ropa-perro", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(301);
  expect(res.headers()["location"]).toBe("/buscar/?q=abrijo&categoria=ropa-perro&opcion=Talla%3AM");

  const html = await (await page.request.get("/buscar/?q=abrijo")).text();
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  expect(scripts).toHaveLength(3);
  expect(scripts.some((s) => /\/_astro\/SiteClient\.[^/]+\.js$/.test(s!))).toBe(true);
  expect(scripts.some((s) => /\/_astro\/CartClient\.[^/]+\.js$/.test(s!))).toBe(true);
  const live = scripts.find((s) => /\/_astro\/SearchLive\.[^/]+\.js$/.test(s!));
  expect(live).toBeTruthy();
  const code = await (await page.request.get(live!)).body();
  expect(gzipSync(code).length).toBeLessThanOrEqual(1024);
  expect(html).not.toContain("/_image");
});

test.describe("con JS (modelo híbrido: en el sitio)", () => {
  test.use({ javaScriptEnabled: true });
  const mark = (page: Page) =>
    page.evaluate(() => ((window as unknown as { mark: number }).mark = 42));
  const marked = (page: Page) =>
    page.evaluate(() => (window as unknown as { mark?: number }).mark === 42);

  test("filtro → en el sitio: URL, foco, scroll, chip y atrás sin recargar", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/buscar/?categoria=ropa-perro");
    await mark(page);
    const before = await status(page).textContent();
    await filters(page, isMobile);
    await page.evaluate(() => (document.getElementById("filtros")!.dataset.mark = "1"));
    const link = box(page, "color", "Rojo");
    await link.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY);
    await link.click();
    await expect(page).toHaveURL(/\/buscar\/\?categoria=ropa-perro&opcion=Color%3ARojo$/);
    await expect(status(page)).not.toHaveText(before!);
    await expect(box(page, "color", "Rojo")).toHaveAttribute("aria-checked", "true");
    await expect(box(page, "color", "Rojo")).toBeFocused();
    if (isMobile) await expect(page.locator("#filtros:popover-open")).toHaveCount(1);
    // Fase D (4.1): el panel es el mismo elemento (no se cierra ni se vuelve a animar)
    expect(await page.evaluate(() => document.getElementById("filtros")!.dataset.mark)).toBe("1");
    expect(await page.evaluate(() => scrollY)).toBe(y);
    await expect(page.locator("[data-search-announce]")).toHaveText(/\d+ productos?/);

    if (isMobile) await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Quitar filtro Color: Rojo" }).click();
    await expect(page).toHaveURL(/\/buscar\/\?categoria=ropa-perro$/);
    await page.goBack();
    await expect(page).toHaveURL(/opcion=Color%3ARojo$/);
    await expect(page.getByRole("link", { name: "Quitar filtro Color: Rojo" })).toBeVisible();
    expect(await marked(page)).toBe(true);
  });

  test("orden al elegir, precio y paginación en el sitio", async ({ page, isMobile }) => {
    await page.goto("/buscar/?categoria=perro");
    await mark(page);
    await page.getByLabel("Ordenar por").selectOption("precio-asc");
    await expect(page).toHaveURL(/categoria=perro&orden=precio-asc$/);
    const panel = await filters(page, isMobile);
    await panel.getByLabel("Precio máximo").fill("30");
    await panel.getByRole("button", { name: "Ver resultados" }).click();
    // precio vacío (mínimo) se omite; la URL es la canónica
    await expect(page).toHaveURL(/categoria=perro&precio_max=30&orden=precio-asc$/);
    // Fase D (4.2): "Ver resultados" cierra el panel
    await expect(page.locator("#filtros:popover-open")).toHaveCount(0);
    await page.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/pagina=2$/);
    await expect(page.getByText(/Página 2 de \d+/)).toBeVisible();
    expect(await marked(page)).toBe(true);
  });
});
