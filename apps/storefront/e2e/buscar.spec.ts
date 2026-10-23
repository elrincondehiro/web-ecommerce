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
/** Despliega el grupo (Fase O: llegan plegados salvo los que tienen algo marcado). */
async function openGroup(page: Page, group: string) {
  const d = page.locator(`#filtros details#f-${group}`);
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
}
/** Despliega el grupo y pulsa el valor. */
async function toggle(page: Page, group: string, label: string) {
  await openGroup(page, group);
  await box(page, group, label).click();
}

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
  await toggle(page, "talla", "M");
  await expect(page).toHaveURL(/categoria=ropa-perro&opcion=Talla%3AM#f-talla$/);
  await filters(page, isMobile);
  await toggle(page, "talla", "L");
  await expect(page).toHaveURL(/opcion=Talla%3AL&opcion=Talla%3AM#f-talla$/);
  await filters(page, isMobile);
  await toggle(page, "color", "Rojo");
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

test("grupos de filtros plegados; abierto el que tiene algo marcado (Fase O)", async ({ page }) => {
  await page.goto("/buscar/?categoria=ropa-perro&opcion=Talla%3AM");
  const open = () =>
    page
      .locator("#filtros details")
      .evaluateAll((ds) => ds.filter((d) => d.hasAttribute("open")).map((d) => d.id));
  // Abiertos: la categoría (marcada en la URL) y Talla
  expect(await open()).toEqual(["f-categoria", "f-talla"]);
  await page.goto("/categoria/ropa-perro/");
  expect(await open()).toEqual([]);
});

test("Fase F: rango de precio real, sin materia seca ni «Formato: Única» fuera de contexto", async ({
  page,
}) => {
  // Ropa: el listado del build y /buscar/ dan el MISMO rango (antes /buscar/ daba 17–28)
  await page.goto("/categoria/ropa-perro/");
  const range = async () => [
    await page.locator("#filtros [name=precio_min]").getAttribute("placeholder"),
    await page.locator("#filtros [name=precio_max]").getAttribute("placeholder"),
  ];
  const listing = await range();
  await page.goto("/buscar/?categoria=ropa-perro");
  expect(await range()).toEqual(listing);
  // Ropa no tiene analíticos: sin materia seca
  await expect(page.locator("#filtros #f-proteina, #filtros #f-grasa")).toHaveCount(0);
  // Higiene: productos sin variantes («Formato: Única») → sin grupo Formato, como el listado
  await page.goto("/buscar/?categoria=higiene-cuidados-perro");
  await expect(page.locator("#filtros #f-formato")).toHaveCount(0);
  await page.goto("/categoria/higiene-cuidados-perro/");
  await expect(page.locator("#filtros #f-formato")).toHaveCount(0);
});

test("Fase F: subcategorías sangradas bajo su padre", async ({ page, isMobile }) => {
  await page.goto("/buscar/?categoria=alimentacion-perro&categoria=perro");
  await filters(page, isMobile);
  const indent = (label: string) =>
    box(page, "categoria", label).evaluate((a) => a.closest("li")!.className);
  expect(await indent("Perro")).not.toMatch(/facet-indent/);
  expect(await indent("Alimentación")).toMatch(/facet-indent-1/);
  expect(await indent("Piensos")).toMatch(/facet-indent-2/);
});

test("Fase F: «Solo disponibles» solo en el panel (ni en la barra ni junto a «Filtrar»)", async ({
  page,
}) => {
  await page.goto("/buscar/");
  await expect(page.locator("[data-results]").getByRole("switch")).toHaveCount(0);
  await page.goto("/categoria/perro/");
  // En la categoría estática solo está dentro del panel (casilla del formulario «Aplicar»)
  await expect(page.locator("main a[role=switch]")).toHaveCount(0);
  await expect(page.locator("#filtros label.stock-toggle")).toHaveCount(1);
});

test("Fase F: sin saltos de la rejilla al filtrar (fila de chips reservada)", async ({
  page,
  isMobile,
}) => {
  const top = () =>
    page
      .locator("[data-results] article")
      .first()
      .evaluate((a) => a.getBoundingClientRect().top + scrollY);
  await page.goto("/buscar/?categoria=ropa-perro");
  const before = await top();
  await filters(page, isMobile);
  await toggle(page, "talla", "M");
  expect(await top()).toBe(before);
  await filters(page, isMobile);
  await toggle(page, "color", "Rojo");
  expect(await top()).toBe(before);
  // Muchos chips: una sola línea con scroll (misma altura)
  await page.goto(
    "/buscar/?categoria=ropa-perro&opcion=Talla%3AS&opcion=Talla%3AM&opcion=Talla%3AL&opcion=Color%3ARojo&opcion=Color%3AAzul&precio_min=1&precio_max=99",
  );
  expect(await top()).toBe(before);
});

test("Fase F: fila de categorías de altura fija; hojas con sus hermanas", async ({ page }) => {
  const top = () =>
    page
      .locator("main article")
      .first()
      .evaluate((a) => a.getBoundingClientRect().top + scrollY);
  await page.goto("/categoria/accesorios-perro/");
  const parent = await top();
  const row = page.getByRole("navigation", { name: "Subcategorías de Accesorios" });
  await expect(row.getByRole("link", { name: "Ropa" })).toBeVisible();
  // Hoja: sus hermanas con la actual marcada; la rejilla empieza a la misma altura
  await row.getByRole("link", { name: "Ropa" }).click();
  await expect(page).toHaveURL(/\/categoria\/ropa-perro\/$/);
  const siblings = page.getByRole("navigation", { name: "Categorías" });
  await expect(siblings.getByRole("link", { name: "Ropa" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(siblings.getByRole("link", { name: "Paseo" })).toBeVisible();
  expect(await top()).toBe(parent);
  // /productos/: las raíces, misma altura
  await page.goto("/productos/");
  await expect(
    page.getByRole("navigation", { name: "Categorías" }).getByRole("link", { name: "Perro" }),
  ).toBeVisible();
  expect(await top()).toBe(parent);
});

test("categoría por niveles: raíces → hijas; gana la más concreta", async ({ page, isMobile }) => {
  await page.goto("/buscar/");
  await filters(page, isMobile);
  await expect(box(page, "categoria", "Alimentación")).toHaveCount(0);
  await toggle(page, "categoria", "Perro");
  await expect(page).toHaveURL(/\/buscar\/\?categoria=perro#f-categoria$/);
  const perro = Number((await status(page).textContent())!.match(/\d+/)![0]);
  await filters(page, isMobile);
  await toggle(page, "categoria", "Alimentación");
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
  // Fase F: interruptor, lo primero del panel
  const toggle = panel.getByRole("switch", { name: "Solo disponibles" });
  await expect(panel.locator(".filter-panel__body > :first-child")).toContainText(
    "Solo disponibles",
  );
  await toggle.click();
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
  await page.locator("#filtros details#f-color summary").click();
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
  // En un despliegue Caddy añade `noindex, nofollow` al de la app (ROBOTS=noindex): basta con que
  // diga noindex.
  expect(part.headers()["x-robots-tag"]).toMatch(/\bnoindex\b/);
  const body = await part.text();
  expect(body).not.toContain("<html");
  expect(body.match(/data-filter-panel/g)).toHaveLength(1);
  const r = await page.request.get("/buscar/parcial/?opcion=Talla:M&q=abrijo", {
    maxRedirects: 0,
  });
  expect(r.status()).toBe(301);
  expect(r.headers()["location"]).toBe("/buscar/parcial/?q=abrijo&opcion=Talla%3AM");
});

test("URL no canónica → 301; JS: carrito + común + SearchLive + ScrollDrag (≤ 1 KB)", async ({
  page,
}) => {
  const res = await page.request.get("/buscar/?opcion=Talla:M&q=abrijo&categoria=ropa-perro", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(301);
  expect(res.headers()["location"]).toBe("/buscar/?q=abrijo&categoria=ropa-perro&opcion=Talla%3AM");

  const html = await (await page.request.get("/buscar/?q=abrijo")).text();
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  // Fase F: + ScrollDrag (fila de chips con scroll horizontal, aprobado por el usuario)
  expect(scripts).toHaveLength(4);
  const drag = scripts.find((s) => /\/_astro\/ScrollDrag\.[^/]+\.js$/.test(s!));
  expect(gzipSync(await (await page.request.get(drag!)).body()).length).toBeLessThanOrEqual(1024);
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
    await openGroup(page, "color");
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

  test("Fase F: «Solo disponibles» del panel, en el sitio y con el foco", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/buscar/");
    await mark(page);
    await filters(page, isMobile);
    const toggle = page.locator("#f-disponible");
    await toggle.click();
    await expect(page).toHaveURL(/\/buscar\/\?disponible=1$/);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toBeFocused();
    expect(await marked(page)).toBe(true);
  });

  test("Fase F: chips con JS sin saltos y arrastrables", async ({ page, isMobile }) => {
    await page.goto("/buscar/?categoria=ropa-perro");
    const top = () =>
      page
        .locator("[data-results] article")
        .first()
        .evaluate((a) => a.getBoundingClientRect().top + scrollY);
    const before = await top();
    await filters(page, isMobile);
    await openGroup(page, "talla");
    await box(page, "talla", "M").click();
    await expect(page.getByRole("link", { name: "Quitar filtro Talla: M" })).toBeVisible();
    expect(await top()).toBe(before);
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
