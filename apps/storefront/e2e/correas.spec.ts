// e2e de la correa a medida (Fase E-2c). Criterio de salida: la landing y añadir funcionan CON y
// SIN JS y la línea del carrito muestra la medida exacta y las observaciones.
// Datos: `catalog:import catalog/mock` (categoría correas-perro) + `correas:sync
// catalog/plantilla/correas` (6 correas; verde PVC con 9 m de cuerda → hasta 8 m; roja de nailon
// sin cuerda). `pnpm backend:stock:mock` no toca las piezas de las correas.
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const GROUP = "/producto/correa-a-medida/";
const AZUL = "/producto/correa-azul-nylon/";
const VERDE_PVC = "/producto/correa-verde-pvc/";
const ROJA_NYLON = "/producto/correa-rojo-nylon/";

const form = (page: Page) => page.locator("form[data-correa]");
const add = (page: Page) => form(page).getByRole("button", { name: /^Añadir .* al carrito$/ });
const select = (page: Page, name: string) => form(page).locator(`select[name=${name}]`);

/** Elige largo y mosquetones en los desplegables del configurador. */
async function choose(page: Page, largo: string, perro = "EST", mano = "EST") {
  await select(page, "largo").selectOption(largo);
  await select(page, "perro").selectOption(perro);
  await select(page, "mano").selectOption(mano);
}

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("listado: una sola tarjeta «Correa a medida» que lleva a la landing", async ({ page }) => {
    await page.goto("/categoria/paseo-perro/");
    const card = page.locator("article", { hasText: "Correa a medida" });
    await expect(card).toHaveCount(1);
    await expect(page.locator('article a[href^="/producto/correa-azul"]')).toHaveCount(0);
    await card.getByRole("link", { name: "Correa a medida", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${GROUP}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Correa a medida");
    await expect(page.getByText(/Fabricada a mano.*24–48 h laborables/)).toBeVisible();
    // Tabla de precios: nailon 24 € y PVC 25 € a 3 m
    await expect(page.getByRole("row", { name: /^3 m/ })).toContainText("24,00");
    await expect(page.getByRole("row", { name: /^3 m/ })).toContainText("25,00");
  });

  test("landing: selector de color con «hasta X m» y CTA de la elegida (CSS :has)", async ({
    page,
  }) => {
    await page.goto(GROUP);
    const pick = page.locator(".correa-pick");
    await expect(pick.getByRole("radio")).toHaveCount(6);
    await expect(pick.locator('[data-price="correa-verde-pvc_max"]')).toHaveText("hasta 8 m");
    await expect(pick.locator('[data-price="correa-rojo-nylon_max"]')).toHaveText("Agotada");
    // Un solo CTA visible: el de la preseleccionada; al elegir otra, el suyo
    const visible = pick.locator("[data-cta]:visible");
    await expect(visible).toHaveCount(1);
    const checked = await pick.locator("input:checked").getAttribute("value");
    await expect(visible).toHaveAttribute("href", `/producto/${checked}/`);
    await pick.locator("label", { has: page.locator('[value="correa-verde-pvc"]') }).click();
    await expect(visible).toHaveAttribute("href", VERDE_PVC);
    await visible.click();
    await expect(page).toHaveURL(new RegExp(`${VERDE_PVC}$`));
  });

  test("ficha: desplegables con precio, muestras de color; la roja de nailon, agotada", async ({
    page,
  }) => {
    await page.goto(AZUL);
    await expect(select(page, "largo").locator("option")).toHaveCount(13);
    await expect(select(page, "perro").locator("option").nth(1)).toHaveText("Montaña (+3,00 €)");
    await expect(page.getByText(/Fabricada a mano/)).toBeVisible();
    const colors = page.getByRole("navigation", { name: "Color y material" });
    await expect(colors.getByRole("link")).toHaveCount(5);
    await colors.getByRole("link", { name: "Rojo · Nailon" }).click();
    await expect(page).toHaveURL(new RegExp(`${ROJA_NYLON}$`));
    await expect(form(page).getByRole("button", { name: "Agotada" })).toBeVisible();
    await expect(add(page)).toBeHidden();
  });

  test("añadir con medida exacta y observaciones; medida fuera del largo → aviso", async ({
    page,
  }) => {
    await page.goto(AZUL);
    await choose(page, "7", "MON", "SEG");
    await form(page)
      .getByLabel(/Medida exacta/)
      .fill("590");
    await add(page).click();
    await expect(page).toHaveURL(new RegExp(`${AZUL}#carrito-correa$`));
    await expect(page.locator("#carrito-correa")).toBeVisible();

    await choose(page, "7", "MON", "SEG");
    await form(page)
      .getByLabel(/Medida exacta/)
      .fill("640");
    await form(page)
      .getByLabel(/Observaciones/)
      .fill("Para Hiro, que tira mucho");
    await add(page).click();
    await expect(page).toHaveURL(new RegExp(`${AZUL}#carrito-added$`));

    await page.goto("/carrito/");
    const line = page.locator("main li", { hasText: "Correa a medida azul de nailon" });
    await expect(line).toContainText("7 m / Montaña / Seguridad");
    await expect(line).toContainText("Medida exacta: 6,40 m");
    await expect(line).toContainText("Observaciones: Para Hiro, que tira mucho");
  });

  test("combinación agotada (verde PVC 10 m): no se añade", async ({ page }) => {
    await page.goto(VERDE_PVC);
    await choose(page, "10");
    await add(page).click();
    await expect(page.locator("#carrito-stock")).toBeVisible();
  });
});

test.describe("con JS", () => {
  test("landing: solo SiteClient y CartClient (0 bundles propios)", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
    });
    await page.goto(GROUP);
    await expect(page.locator('[data-price="correa-verde-pvc_max"]')).toHaveText("hasta 8 m");
    const own = scripts.filter((s) => s.startsWith("/_astro/"));
    expect(own.map((s) => s.split("/").pop()!.split(".")[0]).sort()).toEqual([
      "CartClient",
      "SiteClient",
    ]);
  });

  test("total en vivo, agotado y medida exacta que elige el largo", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
    });
    await page.goto(VERDE_PVC);
    const total = form(page).locator("[data-correa-total]");
    await expect(total).toHaveText("Total: 25,00 €");
    // Datos de la island (disponibilidad actual): 10 m agotado con PVC verde (9 m de cuerda)
    await choose(page, "10");
    await expect(form(page).locator("[data-correa-out]")).toBeVisible();
    await expect(add(page)).toBeDisabled();
    await expect(select(page, "largo").locator('option[value="10"]')).toHaveText(
      "10 m (33,00 €) · agotado",
    );
    await choose(page, "5", "SEG");
    await expect(total).toHaveText("Total: 33,00 €");
    await expect(add(page)).toBeEnabled();
    // El precio de cada largo incluye los mosquetones elegidos
    await expect(select(page, "largo").locator('option[value="5"]')).toHaveText("5 m (33,00 €)");
    await form(page)
      .getByLabel(/Medida exacta/)
      .fill("745");
    await expect(select(page, "largo")).toHaveValue("8");
    await expect(form(page).locator("[data-correa-range]")).toHaveText(
      "Para 8 m: de 701 a 800 cm.",
    );

    // Solo los bundles permitidos: SiteClient, CartClient y CorreaLive (≤ 1 KB gzip)
    const own = scripts.filter((s) => s.startsWith("/_astro/"));
    expect(own.map((s) => s.split("/").pop()!.split(".")[0]).sort()).toEqual([
      "CartClient",
      "CorreaLive",
      "SiteClient",
    ]);
    const live = own.find((s) => s.includes("CorreaLive"))!;
    const body = await (await page.request.get(live)).body();
    expect(gzipSync(body).length).toBeLessThanOrEqual(1024);
  });

  test("añadir sin recargar (CartClient) con observaciones", async ({ page }) => {
    await page.goto(AZUL);
    await choose(page, "4");
    await form(page)
      .getByLabel(/Observaciones/)
      .fill("Con JS");
    await add(page).click();
    await expect(page.locator("#toasts")).toContainText(/Añadido/);
    await expect(page).toHaveURL(new RegExp(`${AZUL}$`));
    await page.goto("/carrito/");
    await expect(
      page.locator("main li", { hasText: "Correa a medida azul de nailon" }),
    ).toContainText("Observaciones: Con JS");
  });
});
