// Accesibilidad automática con axe (WCAG 2.2 A/AA + buenas prácticas) en las páginas con más
// componentes propios, en tema claro y oscuro y en los dos proyectos (escritorio y móvil).
// La ficha con selector se analiza con una combinación AGOTADA elegida (tarjetas con rayas,
// foto en blanco y negro, «Agotado» y la cantidad desactivada). Contraste del texto sobre las
// rayas: axe no puede medirlo sobre un degradado (lo deja «incompleto», no falla); medido aparte
// en la ficha real: ≥ 5:1 en los dos temas.
// Fuente: context7 /dequelabs/axe-core-npm (@axe-core/playwright: AxeBuilder, withTags,
// analyze).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`.slice(0, 200)),
  }));
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`tema ${colorScheme === "light" ? "claro" : "oscuro"}`, () => {
    test.use({ colorScheme });

    test("home sin fallos de accesibilidad", async ({ page }) => {
      await page.goto("/");
      expect(await violations(page)).toEqual([]);
    });

    test("/buscar/ filtrado por familia (Fase FO) sin fallos de accesibilidad", async ({
      page,
    }) => {
      skipIfRemote("familias del catálogo local (prueba-arnes/familias.csv)");
      await page.goto("/buscar/?categoria=ropa-perro&familia=Color%3Aazul");
      expect(await violations(page)).toEqual([]);
    });

    test("categoría con el panel de familias abierto sin fallos de accesibilidad", async ({
      page,
    }) => {
      skipIfRemote("familias del catálogo local (prueba-arnes/familias.csv)");
      await page.goto("/categoria/ropa-perro/");
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.locator("#filtros details#f-color summary").click();
      await expect(page.locator("#filtros input[name=familia]").first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("ficha con selector y combinación agotada sin fallos de accesibilidad", async ({
      page,
    }) => {
      skipIfRemote("producto de prueba del catálogo local (prueba-arnes)");
      await page.goto("/producto/prueba-arnes-estampado/");
      await page.locator('label:has(input[value="Estampado:Rayas"])').click();
      await page.locator('label:has(input[value="Talla:M"])').click();
      await expect(
        page.locator("form[data-cart-form]").getByRole("button", { name: "Agotado" }),
      ).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
