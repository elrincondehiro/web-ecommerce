import { expect, test } from "@playwright/test";

// Selector de tema (I-Marca): sigue al sistema; el botón fija claro/oscuro y se recuerda.
// Fase L-1: en escritorio, en la cabecera; en móvil (< lg), dentro del menú ☰.
test.describe("con JS", () => {
  test.use({ javaScriptEnabled: true, colorScheme: "light" });

  test("el botón cambia el tema, se guarda y se aplica antes de pintar en la siguiente página", async ({
    page,
  }) => {
    await page.goto("/");
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const claro = await bg();
    const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
    if (mobile) await page.getByRole("button", { name: "Menú" }).click();
    const btn = page.locator(
      mobile ? "#menu-movil [data-theme-toggle]" : "header [data-theme-toggle]",
    );
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAccessibleName("Cambiar a modo oscuro");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(btn).toHaveAccessibleName("Cambiar a modo claro");
    const oscuro = await bg();
    expect(oscuro).not.toBe(claro);
    await page.goto("/productos/");
    // el script del <head> ya fijó el tema antes de que el cuerpo se pintara
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bg()).toBe(oscuro);
  });
});

test.describe("cabecera estable al cargar", () => {
  test.use({ javaScriptEnabled: true });

  test("el selector de tema está desde el primer pintado: la búsqueda no se mueve", async ({
    page,
  }) => {
    // Posición de la búsqueda en cada frame pintado (requestAnimationFrame) durante 1,5 s, y los
    // layout shifts. Antes de pintar (HTML a medias, sin CSS) la medida no cuenta.
    await page.addInitScript(() => {
      const w = window as unknown as { __xs: number[] };
      w.__xs = [];
      const tick = () => {
        const r = document.querySelector("header [role=search]")?.getBoundingClientRect();
        if (r && r.width && performance.getEntriesByName("first-contentful-paint").length) {
          w.__xs.push(Math.round(r.x));
        }
        if (performance.now() < 1500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto("/");
    await page.waitForTimeout(1500);
    const xs = await page.evaluate(() => (window as unknown as { __xs: number[] }).__xs);
    expect(xs.length).toBeGreaterThan(0);
    expect(new Set(xs).size).toBe(1);
    // Ningún desplazamiento en la fila de la búsqueda (lo que provocaba el botón). Los cambios de
    // ancho por la fuente web (swap del menú, ~0,0002) no cuentan: van en el análisis de rendimiento.
    const moved = await page.evaluate(
      () =>
        new Promise<number>((done) => {
          let n = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              const sources = (e as unknown as { sources?: { node?: Node | null }[] }).sources;
              for (const src of sources ?? []) {
                let el = src.node ?? null;
                while (el && el.nodeType !== 1) el = el.parentNode;
                if ((el as Element | null)?.closest("[role=search], [data-theme-toggle]")) n++;
              }
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => done(n), 200);
        }),
    );
    expect(moved).toBe(0);
  });
});

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false, colorScheme: "dark" });

  test("sigue al sistema y el botón queda oculto", async ({ page }) => {
    await page.goto("/");
    for (const b of await page.locator("[data-theme-toggle]").all()) await expect(b).toBeHidden();
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toMatch(/^(oklch\(0\.3|rgb\(38)/);
  });
});
