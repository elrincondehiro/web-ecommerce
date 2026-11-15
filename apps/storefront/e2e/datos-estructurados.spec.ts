// Datos estructurados de la ficha (fase 13: offers en el JSON-LD para Google y Merchant Center).
// Fuente: Google Search Central (merchant-listing, product-variants). Catálogo mock local.
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

test.beforeEach(() => skipIfRemote("catálogo mock local"));

async function jsonLd(page: Page, type: string) {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => JSON.parse(e.textContent!)));
  return blocks.find((b) => b["@type"] === type);
}

test("ficha con variantes: ProductGroup con una Offer por variante", async ({ page }) => {
  await page.goto("/producto/mock-pienso-premium-001/");
  const ld = await jsonLd(page, "ProductGroup");
  expect(ld.productGroupID).toBe("mock-pienso-premium-001");
  expect(ld.hasVariant.length).toBeGreaterThan(1);
  for (const v of ld.hasVariant) {
    expect(v.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "EUR",
      itemCondition: "https://schema.org/NewCondition",
    });
    expect(v.offers.price).toBeGreaterThan(0);
    expect(v.offers.availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
  }
});

test("caja de snacks (configurable): sin precio en el JSON-LD", async ({ page }) => {
  await page.goto("/producto/caja-snacks/");
  const ld = await jsonLd(page, "Product");
  expect(ld).toBeTruthy();
  expect(ld).not.toHaveProperty("offers");
});
