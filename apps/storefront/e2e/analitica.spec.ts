// Analítica Umami (Fase MK-E). Solo si el build lleva Umami (UMAMI_URL + UMAMI_WEBSITE_ID): si no,
// comprueba que no hay script. Los envíos se interceptan (no llegan a Umami) para ver qué sale:
// la URL sin tokens ni ids, solo `q` y `utm_*`; el evento de «Añadir»; sin violaciones de CSP; el
// script ≤ 3 KB gzip (excepción de AGENTS §3.4) y con `defer`.
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote } from "./_remote";

type Sent = { type: string; payload: Record<string, unknown> };

async function capture(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("**/api/send", async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    await route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } });
  });
  return sent;
}

test.beforeEach(() => skipIfRemote("Umami de desarrollo"));

test("visitas y eventos sin datos de más", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
  });
  await page.goto("/");
  const tag = page.locator("script[data-website-id]");
  if ((await tag.count()) === 0) {
    test.skip(true, "build sin Umami (UMAMI_URL/UMAMI_WEBSITE_ID)");
    return;
  }
  await expect(tag).toHaveAttribute("defer", "");
  await expect(tag).toHaveAttribute("data-before-send", "umamiFiltro");
  const src = (await tag.getAttribute("src"))!;
  const body = await (await page.request.get(src)).body();
  expect(gzipSync(body).length).toBeLessThanOrEqual(3 * 1024);

  const sent = await capture(page);
  // `q` sí (qué se busca); `utm_*` sí (campañas); lo demás no
  await page.goto("/buscar/?q=pienso");
  await page.goto("/?utm_source=news&utm_campaign=otono&token=secreto&ref=x#y");
  await expect.poll(() => sent.length).toBeGreaterThan(1);
  const urls = sent.map((s) => String(s.payload.url));
  expect(urls).toContainEqual(expect.stringMatching(/\/buscar\/\?q=pienso$/));
  expect(urls).toContainEqual(expect.stringMatching(/\/\?utm_source=news&utm_campaign=otono$/));

  await page.goto("/cuenta/verificar/?token=abc.def");
  await expect
    .poll(() => sent.some((s) => String(s.payload.url).endsWith("/cuenta/verificar/")))
    .toBe(true);
  expect(JSON.stringify(sent)).not.toContain("abc.def");

  // Evento del botón «Añadir» (atributos data-umami-event; 0 JS nuestro)
  await page.goto("/producto/mock-pienso-premium-001/");
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir/ })
    .click();
  await expect
    .poll(() => sent.find((s) => s.payload.name === "anadir-carrito")?.payload.data)
    .toMatchObject({ producto: expect.any(String) });
  expect(csp).toEqual([]);
});
