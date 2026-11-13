// e2e de las familias de opciones (Fase FO-4). Criterio: en categorías y /buscar/ una opción con
// familias se filtra por FAMILIAS (con su punto de color), con y sin JS; los nombres de marca no
// son filtros pero se siguen encontrando con el texto.
// Datos: `pnpm backend:mock:load` (catalog/mock/arneses/familias.csv: «Color» agrupado
// en las 12 familias; Estampado y Talla sin familias).
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

test.beforeEach(() =>
  skipIfRemote("familias del catálogo local (catalog/mock/arneses/familias.csv)"),
);

const status = (page: Page) => page.locator("[data-results] [role=status]");
const count = async (page: Page) => Number((await status(page).textContent())!.match(/\d+/)![0]);
/** Panel de filtros: barra lateral en escritorio, popover en móvil. */
async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile && !(await page.locator("#filtros:popover-open").count())) {
    await page.locator("[data-results] button[popovertarget=filtros]").click();
  }
  const d = page.locator("#filtros details#f-color");
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
}
const family = (page: Page, label: string) =>
  page
    .locator("#filtros #f-color a[role=checkbox]")
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*\\d*$`) });

for (const js of [false, true]) {
  test.describe(js ? "con JS" : "sin JS", () => {
    test.use({ javaScriptEnabled: js, reducedMotion: "reduce" });

    test("/buscar/: filtrar por familia (OR), chip con su nombre y quitarlo", async ({
      page,
      isMobile,
    }) => {
      await page.goto("/buscar/?categoria=ropa-perro");
      const total = await count(page);
      await openFilters(page, isMobile);
      // Familias (orden de la plantilla) con punto de color; ningún nombre de marca
      const labels = await page
        .locator("#filtros #f-color a[role=checkbox]")
        .evaluateAll((as) => as.map((a) => a.textContent!.replace(/\d+/g, "").trim()));
      expect(labels).toContain("Azul");
      expect(labels).not.toContain("Deep Teal");
      await expect(family(page, "Azul").locator(".fam-dot")).toHaveCount(1);

      await family(page, "Azul").click();
      await expect(page).toHaveURL(/familia=Color%3Aazul(#f-color)?$/);
      const azul = await count(page);
      expect(azul).toBeGreaterThan(0);
      expect(azul).toBeLessThan(total);
      await openFilters(page, isMobile);
      await family(page, "Verde").click();
      await expect(page).toHaveURL(/familia=Color%3Aazul&familia=Color%3Averde(#f-color)?$/);
      // OR dentro de la opción: azul o verde da al menos lo de azul
      await expect.poll(() => count(page)).toBeGreaterThanOrEqual(azul);
      if (isMobile) await page.keyboard.press("Escape");

      const chips = page.getByRole("group", { name: "Filtros aplicados" });
      await chips.getByRole("link", { name: "Quitar filtro Color: Verde" }).click();
      await expect(page).toHaveURL(/categoria=ropa-perro&familia=Color%3Aazul$/);
      await expect(chips.getByRole("link", { name: "Quitar filtro Color: Azul" })).toBeVisible();
    });

    test("categoría estática: familias en el panel → /buscar/ con familia=", async ({ page }) => {
      await page.goto("/categoria/ropa-perro/");
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.locator("#filtros details#f-color summary").click();
      const azul = page.locator("#filtros input[name=familia][value='Color:azul']");
      await expect(azul).toHaveCount(1);
      // El punto de color tiene su color (regla fija de la plantilla, sin style="")
      const dot = page.locator("#filtros label:has(input[value='Color:azul']) .fam-dot");
      await expect(dot).toHaveCSS("background-color", "rgb(47, 111, 209)");
      await azul.check();
      await page.locator("#filtros").getByRole("button", { name: "Aplicar filtros" }).click();
      await expect(page).toHaveURL(/\/buscar\/\?categoria=ropa-perro&familia=Color%3Aazul$/);
    });
  });
}

test("el texto sigue encontrando el nombre de marca del valor", async ({ page }) => {
  await page.goto("/buscar/?q=deep+teal");
  expect(await count(page)).toBeGreaterThan(0);
});

test("URL antigua con el valor (opcion=Color:Azul): sigue filtrando y se puede quitar", async ({
  page,
}) => {
  await page.goto("/buscar/?categoria=ropa-perro&opcion=Color%3AAzul");
  expect(await count(page)).toBeGreaterThan(0);
  const chips = page.getByRole("group", { name: "Filtros aplicados" });
  await chips.getByRole("link", { name: "Quitar filtro Color: Azul" }).click();
  await expect(page).toHaveURL(/\/buscar\/\?categoria=ropa-perro$/);
});

// Fase FO-6: preselección en la ficha al llegar desde un filtro por familia (PickerLive).
// prueba-arnes-basico: Color (Azul, Negro, Rojo; con familias) × Talla (S, M, L); por defecto,
// Azul S (la primera con stock).
test.describe("ficha desde un filtro por familia", () => {
  const BASICO = "/producto/prueba-arnes-basico/";
  const checked = (page: Page) =>
    Promise.all(
      ["opcion_1", "opcion_2"].map((n) =>
        page.locator(`.vp [name=${n}]:checked`).getAttribute("value"),
      ),
    );

  test("las tarjetas de /buscar/ filtrado llevan la familia a la ficha", async ({ page }) => {
    await page.goto("/buscar/?q=arn%C3%A9s+b%C3%A1sico&familia=Color%3Arojo");
    await expect(
      page.locator(`[data-results] article a[href^="${BASICO}"]`).first(),
    ).toHaveAttribute("href", `${BASICO}?familia=Color%3Arojo`);
    // Sin filtro de familia, el enlace de siempre
    await page.goto("/buscar/?q=arn%C3%A9s+b%C3%A1sico");
    await expect(
      page.locator(`[data-results] article a[href^="${BASICO}"]`).first(),
    ).toHaveAttribute("href", BASICO);
  });

  test("con JS: marca la primera combinación con stock de la familia", async ({ page }) => {
    await page.goto(`${BASICO}?familia=Color%3Arojo`);
    await expect.poll(() => checked(page)).toEqual(["Color:Rojo", "Talla:S"]);
    await expect(
      page.locator("form[data-cart-form]").getByRole("button", { name: /^Añadir .* al carrito$/ }),
    ).toBeVisible();
    // Familia que el producto no tiene: la variante por defecto
    await page.goto(`${BASICO}?familia=Color%3Amorado`);
    await expect.poll(() => checked(page)).toEqual(["Color:Azul", "Talla:S"]);
  });

  test("con JS: se salta las combinaciones agotadas de la familia", async ({ page }) => {
    // Rojo S agotado en el HTML (celda `data-pa` = posición de Rojo en la etiqueta de la talla S)
    await page.route(`**${BASICO}?familia=*`, async (route) => {
      const res = await route.fetch();
      const html = await res.text();
      const rojo = html.match(/value="Color:Rojo"[^>]*data-ai="(\d+)"/)![1];
      const s = html.indexOf('value="Talla:S"');
      const cell = html.indexOf(`data-pa="${rojo}"`, s);
      const end = html.indexOf('data-vstock="in"', cell);
      await route.fulfill({
        response: res,
        body:
          html.slice(0, end) + 'data-vstock="out"' + html.slice(end + 'data-vstock="in"'.length),
      });
    });
    await page.goto(`${BASICO}?familia=Color%3Arojo`);
    await expect.poll(() => checked(page)).toEqual(["Color:Rojo", "Talla:M"]);
  });

  test.describe("sin JS", () => {
    test.use({ javaScriptEnabled: false });
    test("la variante por defecto (la ficha funciona igual)", async ({ page }) => {
      await page.goto(`${BASICO}?familia=Color%3Arojo`);
      expect(await checked(page)).toEqual(["Color:Azul", "Talla:S"]);
    });
  });
});
