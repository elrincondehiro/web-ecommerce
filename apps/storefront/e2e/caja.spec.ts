// e2e de la caja de snacks (Fase CS, diseño `caja`). Datos: `catalog:import catalog/plantilla/caja`
// (6 importes sin stock, diseno = caja). Criterio: añadir con y sin JS, la salud solo con
// consentimiento, cachorro en meses, varias cajas = varias líneas (también con los mismos datos:
// `caja_ref`), cantidad fija en el carrito («1 caja») y la ficha sin bundles propios.
// Tras la batería: `pnpm backend:orders:cancel` (no crea pedidos, pero deja carritos).
import { expect, test, type Page } from "@playwright/test";

const CAJA = "/producto/caja-snacks/";
const form = (page: Page) => page.locator("form.caja-form");
const add = (page: Page) => page.getByRole("button", { name: "Añadir caja al carrito" });
const line = (page: Page, name: string) =>
  page
    .locator("main li", { hasText: "Caja de snacks" })
    .filter({ has: page.locator("summary", { hasText: `Para ${name}` }) });

async function fillBasics(page: Page, name: string, edad = "3", peso = "12.5") {
  await form(page).getByLabel("Nombre").fill(name);
  await form(page).getByLabel("Edad").fill(edad);
  await form(page).getByLabel("Peso").fill(peso);
}

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("ficha: 6 importes, «¿Para quién es?» (perro o gato) y lo que depende de otro campo con CSS", async ({
    page,
  }) => {
    await page.goto(CAJA);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Caja de snacks");
    await expect(form(page).locator("input[name=variant_id]")).toHaveCount(6);
    await expect(form(page).locator(".caja-amount").first()).toContainText("15,00");
    await expect(page.getByRole("group", { name: "¿Para quién es?" })).toBeVisible();
    // Edad en años; con «Es cachorro», en meses
    await expect(form(page).locator(".caja-age-years")).toBeVisible();
    await expect(form(page).locator(".caja-age-months")).toBeHidden();
    await form(page)
      .getByLabel(/Es cachorro/)
      .check();
    await expect(form(page).locator(".caja-age-months")).toBeVisible();
    await expect(form(page).locator(".caja-age-years")).toBeHidden();
    // Solo perro o gato (sin «Otro»)
    await expect(form(page).locator("input[name=animal]")).toHaveCount(2);
    await expect(form(page).locator("[name=animal_otro]")).toHaveCount(0);
    // Salud: siempre visible (sin salto de layout), en gris y sin poder escribir hasta marcar la
    // casilla (CSS); al marcarla, normal
    const salud = form(page).locator("[name=salud]");
    await expect(salud).toBeVisible();
    // Posición relativa al formulario (el scroll al marcar la casilla mueve la ventana)
    const offset = () =>
      salud.evaluate((el) => {
        const f = el.closest("form")!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { top: r.top - f.top, height: r.height };
      });
    const box = await offset();
    await expect(salud).toHaveCSS("pointer-events", "none");
    await form(page)
      .getByLabel(/Quiero contaros alergias/)
      .check();
    await expect(salud).toHaveCSS("pointer-events", "auto");
    expect(await offset()).toEqual(box);
  });

  test("añadir: datos en el carrito; cachorro en meses y salud con consentimiento", async ({
    page,
  }) => {
    await page.goto(CAJA);
    await form(page).locator("input[name=animal][value=gato]").check();
    await fillBasics(page, "Nube", "4", "1.5");
    await form(page)
      .getByLabel(/Es cachorro/)
      .check();
    await form(page)
      .getByLabel(/Raza o mezcla/)
      .fill("Albino");
    await form(page).locator("input[name=pelo][value=no]").check();
    await form(page).locator("input[name=mastica][value=engulle]").check();
    await form(page).locator("[name=mastica_otro]").fill("a trozos");
    await form(page)
      .getByLabel(/Quiero contaros alergias/)
      .check();
    await form(page)
      .getByLabel(/Alergias o condiciones/)
      .fill("alergia al pollo");
    await form(page).locator("input[name=variant_id]").nth(1).check();
    await add(page).click();
    await expect(page).toHaveURL(new RegExp(`${CAJA}#carrito-added$`));

    await page.goto("/carrito/");
    const nube = line(page, "Nube");
    await expect(nube).toContainText("20 €");
    // Los datos van en un <details> «Para Nube» (la línea no se ensancha): cerrado, ocultos
    await expect(nube.getByText("Mastica: engulle, a trozos")).toBeHidden();
    await nube.locator("summary", { hasText: "Para Nube" }).click();
    await expect(nube).toContainText("Gato, Albino");
    await expect(nube).toContainText("Cachorro de 4 meses · 1,5 kg aprox.");
    await expect(nube).toContainText("Snacks con pelo: no");
    await expect(nube).toContainText("Mastica: engulle, a trozos");
    await expect(nube).toContainText("Alergias o condiciones: alergia al pollo");
  });

  test("sin el consentimiento la salud no se guarda; dos cajas = dos líneas", async ({ page }) => {
    await page.goto(CAJA);
    await fillBasics(page, "Toby");
    // Escrita sin consentimiento (sin CSS el campo se ve): se descarta en el servidor
    await form(page)
      .locator("[name=salud]")
      .evaluate((el: HTMLInputElement) => {
        el.value = "no debería guardarse";
      });
    await add(page).click();
    await expect(page).toHaveURL(new RegExp(`${CAJA}#carrito-added$`));
    await page.goto(CAJA);
    await fillBasics(page, "Luna", "8", "25");
    await add(page).click();

    await page.goto("/carrito/");
    await expect(line(page, "Toby")).toHaveCount(1);
    await expect(line(page, "Luna")).toHaveCount(1);
    await line(page, "Toby").locator("summary").click();
    await expect(line(page, "Toby")).toContainText("3 años · 12,5 kg aprox.");
    await expect(page.locator("main")).not.toContainText("no debería guardarse");
  });

  test("mismos datos dos veces = dos cajas; en el carrito, «1 caja» sin cantidad", async ({
    page,
  }) => {
    for (let i = 0; i < 2; i++) {
      await page.goto(CAJA);
      await fillBasics(page, "Gemelo", "5", "10");
      await add(page).click();
      await expect(page).toHaveURL(new RegExp(`${CAJA}#carrito-added$`));
    }
    await page.goto("/carrito/");
    await expect(line(page, "Gemelo")).toHaveCount(2);
    for (const l of await line(page, "Gemelo").all()) {
      await expect(l).toContainText("1 caja");
      await expect(l.getByLabel("Cantidad")).toHaveCount(0);
      await expect(l.getByRole("button", { name: /Quitar/ })).toBeVisible();
    }
    // Quitar una: queda la otra
    await line(page, "Gemelo")
      .first()
      .getByRole("button", { name: /Quitar/ })
      .click();
    await expect(line(page, "Gemelo")).toHaveCount(1);
  });

  test("datos que no valen (peso 12,3 kg, edad 30): aviso y no se añade", async ({ page }) => {
    await page.goto(CAJA);
    await fillBasics(page, "Rex", "30", "12.3");
    // Sin las comprobaciones del navegador (min/max/step), como un envío a mano
    await form(page).evaluate((f: HTMLFormElement) => (f.noValidate = true));
    await add(page).click();
    await expect(page).toHaveURL(new RegExp(`${CAJA}#carrito-caja$`));
    await expect(page.locator("#carrito-caja")).toBeVisible();
    await page.goto("/carrito/");
    await expect(line(page, "Rex")).toHaveCount(0);
  });
});

test.describe("con JS", () => {
  test("ficha: solo los bundles comunes (0 KB propios) y añadir sin recargar", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
    });
    await page.goto(CAJA);
    await fillBasics(page, "Kira", "2", "7");
    const own = scripts.filter((s) => s.startsWith("/_astro/"));
    const names = own.map((s) => s.split("/").pop()!.split(".")[0]).sort();
    // ScrollDrag: la galería de la ficha (data-drag-scroll), como en todas las fichas
    expect(names.filter((n) => n !== "ScrollDrag")).toEqual(["CartClient", "SiteClient"]);
    await add(page).click();
    await expect(page.locator("#toasts")).toContainText(/Añadido/);
    await expect(page).toHaveURL(new RegExp(`${CAJA}$`));
    await page.goto("/carrito/");
    await expect(line(page, "Kira")).toContainText("2 años · 7 kg aprox.");
  });
});
