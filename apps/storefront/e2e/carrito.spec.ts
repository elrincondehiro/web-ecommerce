// e2e del carrito (fase 4). Criterio de salida: todo funciona CON JS DESACTIVADO.
// Datos: catálogo mock de la BD local (`pnpm backend:seed:mock`). Cada test tiene su propio
// contexto (cookies nuevas → carrito nuevo).
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const SINGLE = "/producto/mock-bufanda-natural-020/"; // 1 variante, con stock (< 99)
const MULTI = "/producto/mock-aceite-de-oliva-ligero-063/"; // 2 variantes con stock
const SALE = "/producto/mock-camiseta-clasico-001/"; // en oferta (seed:mock:ofertas)
/** Productos de 1 variante con stock para llenar el panel. */
const EXTRA = [
  "/producto/mock-cartera-ligero-015/",
  "/producto/mock-cojin-ligero-007/",
  "/producto/mock-gorra-esencial-010/",
];

const addButton = (page: Page) => page.getByRole("button", { name: /^Añadir .* al carrito$/ });
const cartCount = (page: Page) => page.locator("header [data-cart-count]");

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("cantidad: campo numérico normal, sin botones − / +", async ({ page }) => {
    await page.goto(SINGLE);
    await expect(page.getByLabel("Cantidad")).toBeVisible();
    await expect(page.getByRole("button", { name: /una unidad/i })).toHaveCount(0);
  });

  test("añadir desde la ficha, cambiar cantidad y quitar hasta vaciar", async ({ page }) => {
    await page.goto(SINGLE);
    await page.getByLabel("Cantidad").fill("2");
    await addButton(page).click();

    // PRG: vuelve a la ficha con el aviso (:target)
    await expect(page).toHaveURL(new RegExp(`${SINGLE}#carrito-added$`));
    await expect(page.locator("#carrito-added")).toBeVisible();
    await expect(page.locator("#carrito-stock")).toBeHidden();

    await page.locator("#carrito-added").getByRole("link", { name: "Ver carrito" }).click();
    await expect(page).toHaveURL(/\/carrito\/$/);
    await expect(cartCount(page)).toHaveText("2");
    await expect(page.getByRole("link", { name: "Bufanda Natural 020" })).toBeVisible();

    await page.getByLabel("Cantidad").fill("3");
    await page.getByRole("button", { name: "Actualizar" }).click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-updated$/);
    await expect(page.getByLabel("Cantidad")).toHaveValue("3");
    await expect(cartCount(page)).toHaveText("3");

    await page.getByRole("button", { name: /^Quitar / }).click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-removed$/);
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
    await expect(cartCount(page)).toBeHidden();
  });

  test("cantidad 0 en el carrito quita la línea", async ({ page }) => {
    await page.goto(SINGLE);
    await addButton(page).click();
    await page.goto("/carrito/");
    await page.getByLabel("Cantidad").fill("0");
    await page.getByRole("button", { name: "Actualizar" }).click();
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
  });

  test("añadir desde la ficha con varias variantes (radio)", async ({ page }) => {
    await page.goto(MULTI);
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(2);
    await radios.nth(1).check();
    await addButton(page).click();
    await expect(page.locator("#carrito-added")).toBeVisible();
    await page.goto("/carrito/");
    await expect(page.locator("main li")).toHaveCount(1);
  });

  test("añadir desde el listado vuelve al listado", async ({ page }) => {
    await page.goto("/productos/3/");
    const card = page
      .locator("article")
      .filter({ has: addButton(page) })
      .first();
    const title = (await card.getByRole("heading").textContent())?.trim() ?? "";
    await card.getByRole("button", { name: /^Añadir / }).click();
    await expect(page).toHaveURL(/\/productos\/3\/#carrito-added$/);
    await page.goto("/carrito/");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("error de stock", async ({ page }) => {
    await page.goto(SINGLE);
    await page.getByLabel("Cantidad").fill("99");
    await addButton(page).click();
    await expect(page).toHaveURL(new RegExp(`${SINGLE}#carrito-stock$`));
    await expect(page.locator("#carrito-stock")).toHaveText("No hay stock suficiente");
    await expect(page.locator("#carrito-added")).toBeHidden();
  });
});

test("/carrito/: JS = común + CartLive ≤ 1 KB (sin CartClient ni otros)", async ({ page }) => {
  const html = await (await page.request.get("/carrito/")).text();
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
  expect(scripts).toHaveLength(2);
  expect(scripts.some((s) => /\/_astro\/SiteClient\.[^/]+\.js$/.test(s))).toBe(true);
  const live = scripts.find((s) => /\/_astro\/CartLive\.[^/]+\.js$/.test(s));
  expect(live).toBeTruthy();
  const code = await (await page.request.get(live!)).body();
  expect(gzipSync(code).length).toBeLessThanOrEqual(1024);
});

test.describe("con JS", () => {
  test("añade sin recargar: contador, toast; el panel se abre al añadir solo en escritorio", async ({
    page,
    isMobile,
  }) => {
    await page.goto(SINGLE);
    // La island del contador ya ha respondido (carrito vacío → oculto)
    await expect(cartCount(page)).toBeHidden();
    const url = page.url();
    let navigated = false;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigated = true;
    });

    await page.getByLabel("Cantidad").fill("2");
    await addButton(page).click();

    await expect(cartCount(page)).toHaveText("2");
    await expect(page.locator(".toast")).toContainText("Añadido: Bufanda Natural 020");
    expect(page.url()).toBe(url);
    expect(navigated).toBe(false);

    const flyout = page.locator("#cart-flyout");
    const icon = page.getByRole("link", { name: "Carrito", exact: true });
    if (isMobile) {
      await expect(flyout).toBeHidden();
      // Fase D (3.2): el icono abre el panel también en móvil (lateral, como en escritorio)
      await icon.click();
      await expect(flyout).toBeVisible();
    } else {
      await expect(flyout).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(flyout).toBeHidden();
      await icon.click();
      await expect(flyout).toBeVisible();
    }
    await expect(flyout.getByRole("link", { name: "Ver carrito" })).toBeVisible();
    await expect(flyout).toContainText("Bufanda Natural 020");
    // Pulsar fuera (a la izquierda del panel) solo cierra: no activa lo de debajo (3.1)
    await page.mouse.click(10, 300);
    await expect(flyout).toBeHidden();
    expect(page.url()).toBe(url);
  });

  test("cantidad con − / +: respeta el mínimo y añade lo elegido", async ({ page }) => {
    await page.goto(SINGLE);
    await expect(cartCount(page)).toBeHidden();
    const qty = page.getByLabel("Cantidad");
    const plus = page.getByRole("button", { name: /^Una unidad más/ });
    const minus = page.getByRole("button", { name: /^Una unidad menos/ });
    await minus.click();
    await expect(qty).toHaveValue("1");
    await plus.click();
    await plus.click();
    await expect(qty).toHaveValue("3");
    await addButton(page).click();
    await expect(cartCount(page)).toHaveText("3");
  });

  test("panel: oferta tachada, «Quitar» en la línea y pie fijo con total y «Ver carrito»", async ({
    page,
    isMobile,
  }) => {
    const flyout = page.locator("#cart-flyout");
    const products = [SALE, SINGLE, ...EXTRA];
    for (const [i, h] of products.entries()) {
      await page.goto(h);
      await addButton(page).click();
      // Al añadir, el panel solo se abre en escritorio (móvil: aviso)
      await expect(cartCount(page)).toHaveText(String(i + 1));
      if (!isMobile) {
        await expect(flyout.locator("li").first()).toBeVisible();
        await flyout.getByRole("button", { name: "Cerrar carrito" }).click();
        await expect(flyout).toBeHidden();
      }
    }
    await page.getByRole("link", { name: "Carrito", exact: true }).click();
    await expect(flyout.locator("li")).toHaveCount(2 + EXTRA.length);
    // 5.1: precio anterior tachado + descuento en la línea en oferta
    const sale = flyout.locator("li").filter({ hasText: "Camiseta Clásico 001" });
    await expect(sale.locator("del")).toHaveText(/\d,\d{2}\s€/);
    await expect(sale).toContainText("%");
    // Tres partes: "Ver carrito" siempre a la vista aunque la lista tenga scroll
    const view = flyout.getByRole("link", { name: "Ver carrito" });
    await expect(view).toBeInViewport();
    await expect(flyout.getByText("Total", { exact: true }).last()).toBeInViewport();
    // 5.4: "Quitar" en el panel, sin cerrar ni navegar
    const url = page.url();
    await flyout.getByRole("button", { name: "Quitar Bufanda Natural 020 del carrito" }).click();
    await expect(flyout.locator("li")).toHaveCount(1 + EXTRA.length);
    await expect(flyout).toBeVisible();
    expect(page.url()).toBe(url);
  });

  test("/carrito/: la cantidad se aplica sola (500 ms) y «Quitar» sin recargar", async ({
    page,
  }) => {
    await page.goto(SINGLE);
    await addButton(page).click();
    await expect(cartCount(page)).toHaveText("1");
    await page.goto("/carrito/");
    let navigated = false;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigated = true;
    });
    await expect(page.getByRole("button", { name: "Actualizar" })).toBeHidden();
    const plus = page.getByRole("button", { name: /^Una unidad más/ });
    await plus.click();
    await plus.click();
    await expect(cartCount(page)).toHaveText("3");
    await expect(page.getByLabel("Cantidad")).toHaveValue("3");
    await expect(page.locator("[data-cart-live]")).toHaveText("Carrito actualizado");
    await expect(page.getByLabel("Cantidad")).toBeFocused();
    await page.getByRole("button", { name: /^Quitar / }).click();
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
    await expect(cartCount(page)).toBeHidden();
    expect(navigated).toBe(false);
  });

  test("error de stock como toast de alerta", async ({ page }) => {
    await page.goto(SINGLE);
    await page.getByLabel("Cantidad").fill("99");
    await addButton(page).click();
    await expect(page.getByRole("alert")).toContainText("No hay stock suficiente");
    await expect(page.locator("#cart-flyout")).toBeHidden();
  });
});
