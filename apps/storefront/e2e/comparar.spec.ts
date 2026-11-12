// e2e del comparador de alimentación (Fase MK-C): vista tabla de la búsqueda en /comparar/.
// Catálogo mock local (piensos y comida húmeda de perro con datos analíticos).
// - Sin JS: el ejemplo del usuario (pienso + húmeda, proteína MS ≥ 10, grasa MS ≤ 10), cambiar de
//   vista conservando filtros, ordenar por proteína MS, marcar 2 → elegidos, > 4 → aviso, < 2.
// - Enlace desde la ficha (fila marcada) y desde la categoría hoja; «Comparar» en la cabecera.
// - Con JS: filtros en el sitio (SearchLive) en /comparar/; axe y CSP.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

// El ejemplo del usuario con los datos del mock (la grasa MS de estos piensos va del 13 %).
const EJEMPLO =
  "/comparar/?categoria=comida-humeda-perro&categoria=piensos-perro&proteina_min=30&grasa_max=20";
const table = (page: Page) => page.getByRole("table", { name: /Comparativa de componentes/ });
const rows = (page: Page) => table(page).locator("tbody tr");
/** Valor numérico de una celda («27,5 %» → 27.5; «—» → null). */
const num = (t: string) =>
  /\d/.test(t) ? Number(t.replace(/[^\d,]/g, "").replace(",", ".")) : null;

test.beforeEach(() => skipIfRemote("catálogo mock local"));

test.describe("comparador sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("filtros del ejemplo, hidratos con su nota y cambio de vista", async ({ page }) => {
    await page.goto(EJEMPLO);
    await expect(page).toHaveURL(EJEMPLO);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Comparar alimentación");
    const n = await rows(page).count();
    expect(n).toBeGreaterThan(0);
    // Proteína MS (1.ª columna de datos) ≥ 30 y grasa MS ≤ 20 en todas las filas
    for (const r of await rows(page).all()) {
      const cells = r.locator("td");
      expect(num(await cells.nth(1).innerText())!).toBeGreaterThanOrEqual(30);
      expect(num(await cells.nth(2).innerText())!).toBeLessThanOrEqual(20);
    }
    // Tabla compacta: proteína y grasa MS, €/kg y €/kg MS (el resto, en «elegidos»)
    await expect(table(page).getByRole("columnheader")).toHaveText([
      "Comparar",
      "Producto",
      /Proteína MS/,
      /Grasa MS/,
      "€/kg",
      /€\/kg MS/,
    ]);
    await expect(page.getByText(/Hidratos estimados/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tabla comparativa" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Mismos filtros en tarjetas (/buscar/) y vuelta a la tabla
    await page.getByRole("link", { name: "Tarjetas" }).click();
    await expect(page).toHaveURL(
      "/buscar/?categoria=comida-humeda-perro&categoria=piensos-perro&proteina_min=30&grasa_max=20",
    );
    await expect(page.locator("main article")).toHaveCount(n);
    await page.getByRole("link", { name: "Tabla comparativa" }).click();
    await expect(page).toHaveURL(EJEMPLO);
  });

  test("ordenar: proteína MS de más a menos y grasa MS de menos a más", async ({ page }) => {
    const column = async (i: number) =>
      (
        await rows(page).evaluateAll(
          (trs, col) => trs.map((tr) => tr.querySelectorAll("td")[col]!.textContent!.trim()),
          i,
        )
      )
        .map(num)
        .filter((v): v is number => v !== null);
    await page.goto("/comparar/?categoria=piensos-perro");
    await page.getByLabel(/Ordenar por/).selectOption("proteina");
    await page.getByRole("button", { name: "Ordenar" }).click();
    await expect(page).toHaveURL(/orden=proteina/);
    const protein = await column(1);
    expect(protein.length).toBeGreaterThan(1);
    expect([...protein].sort((a, b) => b - a)).toEqual(protein);

    await page.getByLabel(/Ordenar por/).selectOption({ label: "Menos grasa (MS)" });
    await page.getByRole("button", { name: "Ordenar" }).click();
    await expect(page).toHaveURL(/orden=grasa/);
    const fat = await column(2);
    expect(fat.length).toBeGreaterThan(1);
    expect([...fat].sort((a, b) => a - b)).toEqual(fat);
  });

  test("marcar 2 → lado a lado; más de 4 → aviso; menos de 2 → vuelta", async ({ page }) => {
    await page.goto("/comparar/?categoria=piensos-perro");
    const ids: string[] = [];
    for (const i of [0, 1]) {
      const row = rows(page).nth(i);
      ids.push((await row.getAttribute("data-pid"))!);
      await row.getByRole("checkbox").check();
    }
    await page.getByRole("button", { name: "Comparar seleccionados" }).click();
    await expect(page).toHaveURL(`/comparar/elegidos/?p=${ids[0]}&p=${ids[1]}`);
    const cmp = page.getByRole("table", { name: "Comparación de los productos elegidos" });
    await expect(cmp.locator("thead th")).toHaveCount(2);
    await expect(cmp.getByRole("rowheader", { name: /Proteína MS/ })).toBeVisible();
    await expect(cmp.getByRole("rowheader", { name: /€\/kg MS/ })).toBeVisible();
    for (const name of [/Fibra MS/, /Cenizas MS/, /Hidratos MS/, /Humedad/]) {
      await expect(cmp.getByRole("rowheader", { name })).toBeVisible();
    }
    // Miniaturas del build (no el placeholder)
    await expect(cmp.locator("thead img").first()).toHaveAttribute("src", /\/_astro\//);
    await expect(page.getByText(/Hidratos estimados: los calculamos nosotros/)).toBeVisible();

    await page.goto("/comparar/?categoria=piensos-perro");
    for (const i of [0, 1, 2, 3, 4]) await rows(page).nth(i).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Comparar seleccionados" }).click();
    await expect(page.getByText(/Se comparan como mucho 4 productos/)).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: "Comparación de los productos elegidos" })
        .locator("thead th"),
    ).toHaveCount(4);

    await page.goto("/comparar/?categoria=piensos-perro");
    await rows(page).nth(0).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Comparar seleccionados" }).click();
    await expect(page.getByText("Marca al menos 2 productos para compararlos.")).toBeVisible();
  });

  test("entradas: cabecera (todos con datos), categoría hoja y ficha", async ({ page }) => {
    await page.goto("/categoria/piensos-perro/");
    // «Comparar» (cabecera y menú móvil) → /comparar/: todos los productos con datos, sin
    // categoría elegida; se filtra desde ahí.
    await expect(page.locator('header a[href="/comparar/"]')).not.toHaveCount(0);
    await page.goto("/comparar/");
    await expect(page).toHaveURL("/comparar/");
    expect(await rows(page).count()).toBeGreaterThanOrEqual(2);
    await expect(table(page).getByText("Sin datos analíticos")).toHaveCount(0);

    await page.goto("/categoria/piensos-perro/");
    await page.getByRole("link", { name: "Tabla comparativa" }).click();
    await expect(page).toHaveURL("/comparar/?categoria=piensos-perro");

    await page.goto("/producto/mock-pienso-premium-001/");
    await page.getByRole("link", { name: /^Comparar con otros de/ }).click();
    await expect(page).toHaveURL(/\/comparar\/\?categoria=[a-z-]+&marcar=prod_\w+$/);
    await expect(table(page).getByRole("checkbox", { checked: true })).toHaveCount(1);
  });
});

test.describe("comparador: solo productos con datos", () => {
  test.use({ javaScriptEnabled: false });

  test("todas las filas con datos; las facetas no ofrecen categorías sin datos", async ({
    page,
  }) => {
    await page.goto("/comparar/?categoria=perro");
    await expect(table(page).getByText("Sin datos analíticos")).toHaveCount(0);
    // «Perro» tiene juguetes, ropa, paseo…: en el comparador solo salen las de alimentación.
    // En el HTML del panel (en móvil es un popover cerrado): enlaces que añaden esa categoría.
    const offered = (handle: string) => page.locator(`#filtros a[href*="categoria=${handle}"]`);
    await expect(offered("alimentacion-perro")).not.toHaveCount(0);
    for (const h of ["juguetes-perro", "accesorios-perro", "descanso-perro"]) {
      await expect(offered(h)).toHaveCount(0);
    }
    // En /buscar/ con la misma categoría, sí
    await page.goto("/buscar/?categoria=perro");
    await expect(offered("juguetes-perro")).not.toHaveCount(0);
  });

  test("sin salto: la fila de resultados mide lo mismo con y sin el interruptor", async ({
    page,
  }) => {
    const top = async (url: string) => {
      await page.goto(url);
      return page
        .locator("#resultados > div")
        .nth(1)
        .evaluate((e) => e.getBoundingClientRect().top);
    };
    // Con interruptor (alimentación) y sin él (juguetes)
    const withToggle = await top("/buscar/?categoria=alimentacion-perro&categoria=perro");
    await expect(page.getByRole("navigation", { name: "Vista de los resultados" })).toBeVisible();
    const without = await top("/buscar/?categoria=juguetes-perro");
    await expect(page.getByRole("navigation", { name: "Vista de los resultados" })).toHaveCount(0);
    expect(withToggle).toBe(without);
    // /buscar/ y /comparar/: el título y la fila, en el mismo sitio
    const comparar = await top("/comparar/?categoria=alimentacion-perro&categoria=perro");
    expect(comparar).toBe(withToggle);
  });
});

test.describe("comparador con JS", () => {
  test("filtros en el sitio, sin desbordar la página; axe y CSP", async ({ page }) => {
    const csp: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    });
    await page.goto("/comparar/?categoria=piensos-perro");
    await expect(rows(page).first()).toBeVisible();
    // La tabla se desplaza dentro de su caja; la página no.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const axe = () =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze()
        .then((r) => r.violations.map((v) => v.id));
    expect(await axe()).toEqual([]);
    await rows(page).nth(0).getByRole("checkbox").check();
    await rows(page).nth(1).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Comparar seleccionados" }).click();
    await expect(page).toHaveURL(/\/comparar\/elegidos\//);
    expect(await axe()).toEqual([]);
    expect(csp).toEqual([]);
  });
});
