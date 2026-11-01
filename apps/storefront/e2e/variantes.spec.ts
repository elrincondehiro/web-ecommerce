// e2e del selector de opciones (Fase O). Criterio de salida: con y SIN JS se elige estampado y
// talla, la galería enseña las fotos del estampado, las tallas agotadas salen tachadas, una
// combinación agotada no se puede añadir y «Añadir» mete la variante correcta en el carrito.
// Datos: `catalog:import catalog/prueba-arnes` + `images:import catalog/prueba-arnes/fotos`
// (apps/backend/catalog/prueba-arnes/LEEME.md). Agotadas: Rayas M y L, Huellas XS.
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

const ESTAMPADO = "/producto/prueba-arnes-estampado/";
const BASICO = "/producto/prueba-arnes-basico/";

const pick = (page: Page, value: string) => page.locator(`label:has(input[value="${value}"])`);
const add = (page: Page) =>
  page.locator("form[data-cart-form]").getByRole("button", { name: /^Añadir .* al carrito$/ });
const soldOut = (page: Page) =>
  page.locator("form[data-cart-form]").getByRole("button", { name: "Agotado" });
/** Ids de las fotos visibles de la galería. */
const shots = (page: Page) =>
  page
    .locator("ul[aria-label^='Fotos de'] > li")
    .evaluateAll((ls) => ls.filter((l) => getComputedStyle(l).display !== "none").map((l) => l.id));
/** Tallas tachadas (agotadas con el estampado elegido). */
const struck = (page: Page) =>
  page
    .locator(".vp-opt")
    .evaluateAll((ls) =>
      ls
        .filter((l) => getComputedStyle(l).textDecorationLine.includes("line-through"))
        .map((l) => l.querySelector("input")!.value),
    );

test.beforeEach(() => skipIfRemote("productos de prueba del catálogo local (prueba-arnes)"));

for (const js of [false, true]) {
  test.describe(js ? "con JS" : "sin JS", () => {
    test.use({ javaScriptEnabled: js });

    test("fotos del estampado, tallas agotadas y Añadir ↔ Agotado", async ({ page }) => {
      await page.goto(ESTAMPADO);
      // Sin tabla de variantes: dos grupos de muestras
      await expect(page.locator("input[name=variant_id]")).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Estampado" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Talla" })).toBeVisible();
      // Preselección: Flores / XS; sus 3 fotos + la general
      expect(await shots(page)).toEqual(["foto-1-1", "foto-1-2", "foto-1-3", "foto-1"]);
      await expect(add(page)).toBeVisible();

      await pick(page, "Estampado:Rayas").click();
      expect(await shots(page)).toEqual(["foto-3-1", "foto-3-2", "foto-3-3", "foto-1"]);
      expect(await struck(page)).toEqual(["Talla:M", "Talla:L"]);
      await pick(page, "Talla:M").click();
      await expect(soldOut(page)).toBeVisible();
      await expect(add(page)).toBeHidden();

      await pick(page, "Estampado:Huellas").click();
      expect(await struck(page)).toEqual(["Talla:XS"]);
      await expect(add(page)).toBeVisible();
    });

    test("añade la combinación elegida al carrito", async ({ page }) => {
      await page.goto(ESTAMPADO);
      await pick(page, "Estampado:Huellas").click();
      await pick(page, "Talla:L").click();
      await add(page).click();
      if (js) await expect(page.getByRole("status").getByText(/^Añadido/)).toBeVisible();
      else await expect(page).toHaveURL(/#carrito-added$/);
      await page.goto("/carrito/");
      await expect(page.locator("main")).toContainText("Huellas / L");
    });
  });
}

test.describe("guías (sin JS)", () => {
  test.use({ javaScriptEnabled: false });
  test("guía de tallas y «Cómo medir» en un panel", async ({ page }) => {
    await page.goto(BASICO);
    await page.getByRole("button", { name: "Guía de tallas" }).click();
    const panel = page.getByRole("dialog", { name: "Tallas del arnés Modelo B" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("table")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: "Cómo medir" }).click();
    await expect(page.getByRole("dialog", { name: "Cómo medir a tu perro" })).toBeVisible();
  });
});

test("guía con esquema: imagen del Markdown, solo se descarga al abrir la guía", async ({
  page,
}) => {
  // Con JS: sin JS Chromium descarga las imágenes `lazy` igualmente (lazy-load desactivado)
  const loaded: string[] = [];
  page.on("requestfinished", (r) => {
    if (r.resourceType() === "image") loaded.push(r.url());
  });
  await page.goto(ESTAMPADO, { waitUntil: "networkidle" });
  const scheme = /marca-m-arnes-a-medidas/;
  expect(loaded.filter((u) => scheme.test(u))).toEqual([]);
  await page.getByRole("button", { name: "Guía de tallas" }).click();
  const img = page
    .getByRole("dialog", { name: "Tallas del arnés Modelo A" })
    .getByRole("img", { name: /Esquema de las medidas/ });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /\.webp$/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});

test("elegir una combinación agotada no mueve la página (misma altura del formulario)", async ({
  page,
}) => {
  await page.goto(ESTAMPADO);
  const form = page.locator("form[data-cart-form]");
  const height = () => form.evaluate((f) => Math.round(f.getBoundingClientRect().height));
  await pick(page, "Estampado:Rayas").click();
  await pick(page, "Talla:S").click();
  await expect(add(page)).toBeVisible();
  const inStock = await height();
  await pick(page, "Talla:M").click();
  await expect(soldOut(page)).toBeVisible();
  expect(await height()).toBe(inStock);
  // La réplica de la cantidad no se envía ni se puede enfocar
  await expect(form.locator("input[name=quantity]")).toHaveCount(1);
  await expect(form.locator(".qty input:disabled")).toHaveCount(1);
});

test("agotadas bien visibles: talla con rayas y estampado sin ninguna talla también", async ({
  page,
}) => {
  await page.goto(ESTAMPADO);
  const striped = (sel: string) =>
    page.locator(sel).evaluateAll((ls) =>
      ls
        // Rayas en la capa de encima (::after: también sobre la foto)
        .filter((l) =>
          getComputedStyle(l, "::after").backgroundImage.includes("repeating-linear-gradient"),
        )
        .map((l) => l.querySelector("input")!.value),
    );
  await pick(page, "Estampado:Rayas").click();
  expect(await striped(".vp fieldset:last-of-type .vp-opt")).toEqual(["Talla:M", "Talla:L"]);
  expect(await striped(".vp fieldset:first-of-type .vp-opt")).toEqual([]);
  // Si se agotan TODAS las tallas de Rayas (como haría LiveSync), su tarjeta también se marca
  const rayas = await pick(page, "Estampado:Rayas").locator("input").getAttribute("data-ai");
  await page
    .locator(`.vp-opt > [data-pa="${rayas}"][data-vstock]`)
    .evaluateAll((cells) => cells.forEach((c) => c.setAttribute("data-vstock", "out")));
  expect(await striped(".vp fieldset:first-of-type .vp-opt")).toEqual(["Estampado:Rayas"]);
  // …y su foto, en blanco y negro
  await expect(pick(page, "Estampado:Rayas").locator("img")).toHaveCSS("filter", /grayscale\(1\)/);
  await expect(pick(page, "Estampado:Flores").locator("img")).toHaveCSS("filter", "none");
});

test("combinación que no existe: aviso y nada en el carrito", async ({ page }) => {
  await page.goto(ESTAMPADO);
  const res = await page.evaluate(async () => {
    const f = document.querySelector<HTMLFormElement>("form[data-cart-form]")!;
    const fd = new FormData(f);
    fd.set("opcion_1", "Estampado:Lunares");
    const r = await fetch(f.action, {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" },
    });
    return (await r.json()) as { code: string };
  });
  expect(res.code).toBe("variant");
});

test("móvil: muchas miniaturas no ensanchan la página; tarjetas del selector iguales", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(ESTAMPADO);
  const thumbs = page.locator("nav[aria-label='Elegir foto'] ul");
  // 20 miniaturas más (como un producto con muchas fotos): la fila hace scroll, la página no
  await thumbs.evaluate((ul) => {
    const li = ul.querySelector("li")!;
    for (let i = 0; i < 20; i++) ul.append(li.cloneNode(true));
  });
  expect(await thumbs.evaluate((ul) => ul.scrollWidth > ul.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await expect(thumbs).toHaveAttribute("data-drag-scroll", "");
  // Rejilla: dentro de cada opción, todas las tarjetas con el mismo ancho y alto
  for (const fs of await page.locator(".vp fieldset").all()) {
    const sizes = await fs
      .locator("label")
      .evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect()))
      .then((rs) => ({
        w: new Set(rs.map((r) => Math.round(r.width))).size,
        h: new Set(rs.map((r) => Math.round(r.height))).size,
      }));
    expect(sizes).toEqual({ w: 1, h: 1 });
  }
});
