// e2e del carrito (fase 4). Criterio de salida: todo funciona CON JS DESACTIVADO.
// Datos: catálogo mock de la BD local (`catalog:mock` + `catalog:import catalog/mock`). Cada test tiene su propio
// contexto (cookies nuevas → carrito nuevo).
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const SINGLE = "/producto/mock-clicker-esencial-018/"; // 1 variante, con stock (< 99)
const MULTI = "/producto/mock-champu-plus-020/"; // 2 variantes con stock
const SALE = "/producto/mock-lata-confort-005/"; // en oferta (precio_oferta del CSV)
const BULK = "/producto/mock-premios-plus-010/"; // granel (S-3): paso 5 g, mínimo 100 g, 20 €/kg
/** Productos de 1 variante con stock para llenar el panel. */
const EXTRA = [
  "/producto/mock-pelota-plus-028/",
  "/producto/mock-mordedor-premium-025/",
  "/producto/mock-alfombra-olfativa-original-027/",
];

// En la ficha, el formulario de compra (#comprar): las tarjetas de relacionados (Fase R) tienen
// sus propios «Añadir», «Cantidad» y − / +. En listados y en /carrito/ se acota en cada test.
const buy = (page: Page) => page.locator("#comprar");
const addButton = (page: Page) =>
  page.getByRole("button", { name: /^Añadir .* al carrito$/ }).and(page.locator("#comprar *"));
const addBulk = (page: Page) =>
  buy(page).getByRole("button", { name: "Añadir Premios Plus al carrito", exact: true });
const cartCount = (page: Page) => page.locator("header [data-cart-count]");

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("cantidad: campo numérico normal, sin botones − / +", async ({ page }) => {
    await page.goto(SINGLE);
    await expect(buy(page).getByLabel("Cantidad")).toBeVisible();
    await expect(buy(page).getByRole("button", { name: /una unidad/i })).toHaveCount(0);
  });

  test("añadir desde la ficha, cambiar cantidad y quitar hasta vaciar", async ({ page }) => {
    await page.goto(SINGLE);
    await buy(page).getByLabel("Cantidad").fill("2");
    await addButton(page).click();

    // PRG: vuelve a la ficha con el aviso (:target)
    await expect(page).toHaveURL(new RegExp(`${SINGLE}#carrito-added$`));
    await expect(page.locator("#carrito-added")).toBeVisible();
    await expect(page.locator("#carrito-stock")).toBeHidden();

    await page.locator("#carrito-added").getByRole("link", { name: "Ver carrito" }).click();
    await expect(page).toHaveURL(/\/carrito\/$/);
    await expect(cartCount(page)).toHaveText("2");
    await expect(page.getByRole("link", { name: "Clicker Esencial" })).toBeVisible();

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
      .filter({ has: page.getByRole("button", { name: /^Añadir .* al carrito$/ }) })
      .first();
    const title = (await card.getByRole("heading").textContent())?.trim() ?? "";
    await card.getByRole("button", { name: /^Añadir / }).click();
    await expect(page).toHaveURL(/\/productos\/3\/#carrito-added$/);
    await page.goto("/carrito/");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("error de stock", async ({ page }) => {
    await page.goto(SINGLE);
    await buy(page).getByLabel("Cantidad").fill("99");
    await addButton(page).click();
    await expect(page).toHaveURL(new RegExp(`${SINGLE}#carrito-stock$`));
    await expect(page.locator("#carrito-stock")).toHaveText("No hay stock suficiente");
    await expect(page.locator("#carrito-added")).toBeHidden();
  });

  test("granel (S-3): gramos en la ficha, acceso rápido y edición en gramos en el carrito", async ({
    page,
  }) => {
    await page.goto(BULK);
    await expect(page.locator("main")).toContainText("20,00 €/kg · mínimo 100 g");
    await expect(page.locator("main")).toContainText(/Quedan \d+(,\d)?\skg/);
    const grams = buy(page).getByLabel("Cantidad (g)");
    await expect(grams).toHaveValue("100");
    await grams.fill("250");
    await addBulk(page).click();
    await expect(page).toHaveURL(new RegExp(`${BULK}#carrito-added$`));
    // Acceso rápido: añade 100 g más, sin tocar el campo
    await page.getByRole("button", { name: "Añadir 100 g de Premios Plus al carrito" }).click();
    await expect(page).toHaveURL(new RegExp(`${BULK}#carrito-added$`));

    await page.goto("/carrito/");
    // Una línea a granel cuenta 1 artículo
    await expect(cartCount(page)).toHaveText("1");
    const line = page.locator("li").filter({ hasText: "Premios Plus" });
    await expect(line).toContainText(/350\sg\s·\s?20,00\s€\/kg/);
    await expect(line).toContainText("7,00 €");
    await page.getByLabel("Cantidad (g)").fill("500");
    await page.getByRole("button", { name: "Actualizar" }).click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-updated$/);
    await expect(line).toContainText("10,00 €");
    // Por debajo del mínimo: aviso y la línea no cambia
    await page.getByLabel("Cantidad (g)").fill("50");
    await page.getByRole("button", { name: "Actualizar" }).click();
    await expect(page).toHaveURL(/\/carrito\/#carrito-minimum$/);
    await expect(page.locator("#carrito-minimum")).toBeVisible();
    await expect(page.getByLabel("Cantidad (g)")).toHaveValue("500");
  });

  test("granel: por debajo del mínimo, no múltiplo del paso y por encima del máximo", async ({
    page,
  }) => {
    const grams = buy(page).getByLabel("Cantidad (g)");
    for (const [value, code] of [
      ["95", "minimum"],
      ["252", "invalid"],
      ["5005", "maximum"],
    ] as const) {
      await page.goto(BULK);
      // Sin la validación del navegador (min/max/step), para probar la del servidor
      await page.locator("form[data-cart-form]").evaluate((f) => f.setAttribute("novalidate", ""));
      await grams.fill(value);
      await addBulk(page).click();
      await expect(page).toHaveURL(new RegExp(`${BULK}#carrito-${code}$`));
    }
    await expect(page.locator("#carrito-maximum")).toHaveText(
      "El máximo de un producto a granel es 5 kg por pedido.",
    );
  });

  test("granel: la tarjeta lleva a la ficha («Elegir cantidad») con «Desde» y €/kg", async ({
    page,
  }) => {
    // Tarjeta de ESE producto (con 1000 mock hay varios «Premios Plus» y la paginación de
    // snacks-perro cambia): la página de la categoría donde está, por su enlace a la ficha.
    let found = false;
    for (let n = 1; n <= 6 && !found; n++) {
      await page.goto(`/categoria/snacks-perro/${n > 1 ? `${n}/` : ""}`);
      found = (await page.locator(`main article a[href="${BULK}"]`).count()) > 0;
    }
    expect(found).toBe(true);
    const card = page.locator("main article").filter({ has: page.locator(`a[href="${BULK}"]`) });
    await expect(card).toContainText("Desde");
    await expect(card).toContainText("20,00 €/kg · mínimo 100 g");
    await expect(card.getByRole("link", { name: "Elegir cantidad de Premios Plus" })).toBeVisible();
    await expect(card.getByRole("button", { name: /^Añadir/ })).toHaveCount(0);
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

    await buy(page).getByLabel("Cantidad").fill("2");
    await addButton(page).click();

    await expect(cartCount(page)).toHaveText("2");
    await expect(page.locator(".toast")).toContainText("Añadido: Clicker Esencial");
    expect(page.url()).toBe(url);
    expect(navigated).toBe(false);

    const flyout = page.locator("#cart-flyout");
    const icon = page.getByRole("link", { name: /^Carrito( \d+)?$/ });
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
    await expect(flyout).toContainText("Clicker Esencial");
    // Pulsar fuera (a la izquierda del panel) solo cierra: no activa lo de debajo (3.1)
    await page.mouse.click(10, 300);
    await expect(flyout).toBeHidden();
    expect(page.url()).toBe(url);
  });

  test("cantidad con − / +: respeta el mínimo y añade lo elegido", async ({ page }) => {
    await page.goto(SINGLE);
    await expect(cartCount(page)).toBeHidden();
    const qty = buy(page).getByLabel("Cantidad");
    const plus = buy(page).getByRole("button", { name: /^Una unidad más/ });
    const minus = buy(page).getByRole("button", { name: /^Una unidad menos/ });
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
    await page.getByRole("link", { name: /^Carrito( \d+)?$/ }).click();
    await expect(flyout.locator("li")).toHaveCount(2 + EXTRA.length);
    // 5.1: precio anterior tachado + descuento en la línea en oferta
    const sale = flyout.locator("li").filter({ hasText: "Lata Confort" });
    await expect(sale.locator("del")).toHaveText(/\d,\d{2}\s€/);
    await expect(sale).toContainText("%");
    // Tres partes: "Ver carrito" siempre a la vista aunque la lista tenga scroll
    const view = flyout.getByRole("link", { name: "Ver carrito" });
    await expect(view).toBeInViewport();
    await expect(flyout.getByText("Total", { exact: true }).last()).toBeInViewport();
    // 5.4: "Quitar" en el panel, sin cerrar ni navegar
    const url = page.url();
    await flyout.getByRole("button", { name: "Quitar Clicker Esencial del carrito" }).click();
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

  test("granel: − / + de paso en paso, total en vivo y aviso de mínimo como toast", async ({
    page,
  }) => {
    await page.goto(BULK);
    await expect(cartCount(page)).toBeHidden();
    const grams = buy(page).getByLabel("Cantidad (g)");
    const total = page.locator("[data-bulk-total]");
    await expect(total).toHaveText("Total: 2,00 €");
    await page.getByRole("button", { name: "5 g más de Premios Plus" }).click();
    await expect(grams).toHaveValue("105");
    await expect(total).toHaveText("Total: 2,10 €");
    await grams.fill("250");
    await expect(total).toHaveText("Total: 5,00 €");
    await addBulk(page).click();
    await expect(cartCount(page)).toHaveText("1");
    await expect(page.locator(".toast")).toContainText("Añadido: Premios Plus");
    // Acceso rápido con JS (el botón pulsado viaja en el fetch). En escritorio el panel se ha
    // abierto: un clic fuera solo lo cerraría (3.1), así que se cierra antes.
    const flyout = page.locator("#cart-flyout");
    if (await flyout.isVisible()) await page.keyboard.press("Escape");
    await expect(flyout).toBeHidden();
    await page.getByRole("button", { name: "Añadir 1 kg de Premios Plus al carrito" }).click();
    await expect(page.locator(".toast").nth(1)).toContainText("Añadido: Premios Plus");
    await page.goto("/carrito/");
    await expect(page.locator("li").filter({ hasText: "Premios Plus" })).toContainText(
      /1,25\skg\s·\s?20,00\s€\/kg/,
    );
  });

  test("error de stock como toast de alerta", async ({ page }) => {
    await page.goto(SINGLE);
    await buy(page).getByLabel("Cantidad").fill("99");
    await addButton(page).click();
    await expect(page.getByRole("alert")).toContainText("No hay stock suficiente");
    await expect(page.locator("#cart-flyout")).toBeHidden();
  });
});
