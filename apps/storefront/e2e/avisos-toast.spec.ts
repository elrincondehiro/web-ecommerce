// Avisos como toast SIN JS: confirmaciones de la cuenta y de los POST sin JS (carrito, lista,
// avisos) abajo, con el aspecto de los toasts; se van solos (CSS) y se cierran con ✕. Los errores
// siguen arriba y fijos.
import { expect, test } from "@playwright/test";
import { skipIfRemote } from "./_remote";

test.beforeEach(() => skipIfRemote("catálogo mock local"));
test.use({ javaScriptEnabled: false });

test("añadir sin JS: toast abajo que se va solo; ✕ lo cierra", async ({ page }) => {
  await page.goto("/producto/mock-pienso-premium-001/");
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir/ })
    .click();
  await expect(page).toHaveURL(/#carrito-added$/);
  const toast = page.locator("#carrito-added");
  await expect(toast).toBeVisible();
  await expect(toast).toHaveClass(/toast/);
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast.getByRole("link", { name: "Ver carrito" })).toBeVisible();
  // Abajo de la pantalla (como los de JS)
  const box = await toast.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box!.y + box!.height).toBeGreaterThan(vh * 0.7);
  // Los demás avisos, ocultos
  await expect(page.locator("#carrito-removed")).toBeHidden();
  // Se va solo (4,5 s)
  await expect(toast).toBeHidden({ timeout: 6000 });

  // ✕
  await page.goto("/producto/mock-pienso-premium-001/");
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir/ })
    .click();
  await page.locator("#carrito-added").getByText("✕").click();
  await expect(page.locator("#carrito-added")).toBeHidden();
});

test("con movimiento reducido no se va solo", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/producto/mock-pienso-premium-001/");
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir/ })
    .click();
  await page.waitForTimeout(5000);
  await expect(page.locator("#carrito-added")).toBeVisible();
  await context.close();
});
