import { expect, test } from "@playwright/test";

// Selector de tema (I-Marca): sigue al sistema; el botón fija claro/oscuro y se recuerda.
test.describe("con JS", () => {
  test.use({ javaScriptEnabled: true, colorScheme: "light" });

  test("el botón cambia el tema, se guarda y se aplica antes de pintar en la siguiente página", async ({
    page,
  }) => {
    await page.goto("/");
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const claro = await bg();
    const btn = page.locator("[data-theme-toggle]");
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

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false, colorScheme: "dark" });

  test("sigue al sistema y el botón queda oculto", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-theme-toggle]")).toBeHidden();
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toMatch(/^(oklch\(0\.3|rgb\(38)/);
  });
});
