// e2e del carrito (fase 4). Criterio de salida: todo funciona CON JS DESACTIVADO.
// Datos: catálogo mock de la BD local (`pnpm backend:seed:mock`). Cada test tiene su propio
// contexto (cookies nuevas → carrito nuevo).
import { expect, test, type Page } from "@playwright/test";

const SINGLE = "/producto/mock-bufanda-natural-020/"; // 1 variante, con stock (< 99)
const MULTI = "/producto/mock-aceite-de-oliva-ligero-063/"; // 2 variantes con stock

const addButton = (page: Page) => page.getByRole("button", { name: /^Añadir .* al carrito$/ });
const cartCount = (page: Page) => page.locator("header [data-cart-count]");

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

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

test.describe("con JS", () => {
  test("añade sin recargar: contador, toast y flyout solo en escritorio", async ({
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
    if (isMobile) {
      await expect(flyout).toBeHidden();
      await page.getByRole("link", { name: "Carrito", exact: true }).click();
      await expect(page).toHaveURL(/\/carrito\/$/);
    } else {
      await expect(flyout).toBeVisible();
      await expect(flyout.getByRole("link", { name: "Ver carrito" })).toBeVisible();
      await expect(flyout).toContainText("Bufanda Natural 020");
      await page.keyboard.press("Escape");
      await expect(flyout).toBeHidden();
      // El icono abre el flyout en escritorio
      await page.getByRole("link", { name: "Carrito", exact: true }).click();
      await expect(flyout).toBeVisible();
    }
  });

  test("error de stock como toast de alerta", async ({ page }) => {
    await page.goto(SINGLE);
    await page.getByLabel("Cantidad").fill("99");
    await addButton(page).click();
    await expect(page.getByRole("alert")).toContainText("No hay stock suficiente");
    await expect(page.locator("#cart-flyout")).toBeHidden();
  });
});
