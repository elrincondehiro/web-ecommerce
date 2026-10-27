import { expect, test, type Page } from "@playwright/test";

// I-Interficie: cabecera (menús popover sin JS, se oculta al bajar), barra de anuncios, pie,
// home, /ofertas/ (precio tachado) y /sobre-nosotros/. Datos: catalog:mock (Collection
// "destacados" y Price List sale de prueba).
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;
/** El panel móvil entra con una transición (translate): esperar a que termine antes del clic. */
const settled = (menu: ReturnType<Page["locator"]>) =>
  menu.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));

test.describe("sin JS", () => {
  test.use({ javaScriptEnabled: false });

  test("menú de navegación con popover: categorías, ofertas y sobre nosotros", async ({ page }) => {
    await page.goto("/");
    const opener = isMobile(page)
      ? page.getByRole("button", { name: "Menú", exact: true })
      : page.getByRole("button", { name: "Tienda" });
    await opener.click();
    const menu = page.locator(isMobile(page) ? "#menu-movil" : "#menu-tienda");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Todos los productos" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    if (isMobile(page)) {
      await opener.click();
      await settled(menu);
    }
    const nav = isMobile(page) ? menu : page.getByRole("navigation", { name: "Principal" });
    await nav.getByRole("link", { name: "Ofertas" }).click();
    await expect(page).toHaveURL(/\/ofertas\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ofertas" })).toBeVisible();
  });

  test("«Mi cuenta» enlaza a /cuenta/ (fase 9); sin fila de categorías antigua", async ({
    page,
  }) => {
    await page.goto("/");
    const account = page.getByRole("link", { name: "Mi cuenta" }).first();
    await expect(account).toHaveAttribute("href", "/cuenta/");
    await expect(page.getByRole("navigation", { name: "Categorías" })).toHaveCount(0);
  });

  test("barra de anuncios: copia duplicada fuera del árbol accesible", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("region", { name: "Anuncios" });
    await expect(bar.locator("ul")).toHaveCount(2);
    await expect(bar.locator("ul").nth(1)).toHaveAttribute("aria-hidden", "true");
    await expect(bar.locator("ul").nth(1)).toHaveAttribute("inert", "");
    await expect(bar.getByRole("link", { name: /Rebajas/ })).toHaveCount(1);
  });

  test("ficha (Fase R-1): solo la 1.ª foto con prioridad alta; logos 1×/2×", async ({ page }) => {
    await page.goto("/producto/mock-champu-plus-020/");
    const shots = page.locator("ul[aria-label^='Fotos de'] > li img");
    expect(await shots.count()).toBeGreaterThan(1);
    await expect(shots.first()).toHaveAttribute("fetchpriority", "high");
    for (const p of await shots.evaluateAll((ls) =>
      ls.slice(1).map((i) => i.getAttribute("fetchpriority")),
    ))
      expect(p).toBe("low");
    // 720 px en la foto principal (P2): el móvil típico ya no pide la de 800
    await expect(page.locator("ul[aria-label^='Fotos de'] source").first()).toHaveAttribute(
      "srcset",
      /720w/,
    );
    await expect(page.locator("header img").first()).toHaveAttribute("srcset", /@2x\.webp 2x/);
    await expect(page.locator("footer img").first()).toHaveAttribute("srcset", /@2x\.webp 2x/);
  });

  test("home: hero LCP, categorías, carrusel de destacados, ofertas y valores", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("main picture img").first();
    await expect(hero).toHaveAttribute("fetchpriority", "high");
    await expect(hero).toHaveAttribute("loading", "eager");
    await expect(page.getByRole("heading", { name: "Categorías" })).toBeVisible();
    const carousel = page.getByRole("region", { name: "Nuestros favoritos" });
    await expect(carousel).toHaveCount(1);
    await expect(carousel).toHaveAttribute("tabindex", "0");
    // Collection «destacados» (catalog:mock: 11), como mucho `maximo` (home.yaml: 12)
    const featured = await carousel.locator("article").count();
    expect(featured).toBeGreaterThan(0);
    expect(featured).toBeLessThanOrEqual(12);
    await expect(page.getByRole("link", { name: "Ver ofertas" })).toHaveAttribute(
      "href",
      "/ofertas/",
    );
    await expect(page.getByRole("heading", { name: "Cómo trabajamos" })).toBeVisible();
    // Fase H: bloques en el `orden` de home.yaml (categorías → destacados → ofertas → valores)
    const ids = await page
      .locator("main h2[id^='home-']")
      .evaluateAll((els) => els.map((e) => e.id));
    // (los bloques opcionales sin datos no salen: con fixtures, sin novedades ni etiquetas)
    const order = [
      "home-categorias",
      "home-destacados",
      "home-novedades",
      "home-colecciones",
      "home-ofertas",
      "home-etiquetas",
      "home-valores",
    ];
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    // «Ver los N» / «Ver todo» lleva a la página de la colección, no a /productos/
    await expect(page.getByRole("link", { name: /^Ver (los \d+|todo)$/ })).toHaveAttribute(
      "href",
      "/coleccion/destacados/",
    );
  });

  test("colección (Fase H): página propia con migas, listado paginado y LiveSync", async ({
    page,
  }) => {
    await page.goto("/coleccion/destacados/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /migas|breadcrumb/i })).toContainText(
      "Inicio",
    );
    const cards = page.locator("main article");
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(page.locator("main [data-pid]").first()).toBeAttached();
    // Sin «Filtrar» (/buscar/ no filtra por colección)
    await expect(page.getByRole("button", { name: /Filtrar/ })).toHaveCount(0);
  });

  test("/ofertas/: precio anterior tachado y descuento en cada tarjeta", async ({ page }) => {
    await page.goto("/ofertas/");
    const cards = page.locator("main article");
    expect(await cards.count()).toBeGreaterThan(0);
    const first = cards.first();
    await expect(first.locator("del")).toBeVisible();
    await expect(first.locator("[data-off]")).toHaveText(/^−\d+\u202f%$/);
    await expect(first.getByText("Oferta", { exact: true })).toBeVisible();
    // La ficha del mismo producto también muestra la oferta.
    await first.getByRole("heading").getByRole("link").click();
    await expect(page.locator("main del").first()).toBeVisible();
  });

  test("producto sin oferta: sin tachado", async ({ page }) => {
    await page.goto("/producto/mock-clicker-esencial-018/");
    await expect(page.locator("main del").first()).toBeHidden();
  });

  test("los manifiestos de listados no son públicos", async ({ page }) => {
    const paths = ["/listados/paginas.json", "/listados/categorias.json", "/listados/sitemap.json"];
    for (const path of paths) {
      expect((await page.request.get(path)).status()).toBe(404);
    }
  });

  test("ficha de pienso (S-2): €/kg por variante y componentes analíticos", async ({ page }) => {
    await page.goto("/producto/mock-pienso-premium-001/");
    const rows = page.locator("main tr.variant-row");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row.locator("[data-unit]")).toHaveText(/^\d+,\d{2}\s€\/kg$/);
    }
    const table = page.getByRole("table", { name: /Componentes analíticos/ });
    await expect(table.getByRole("columnheader", { name: "Materia seca" })).toBeVisible();
    const protein = table.getByRole("row", { name: /Proteína bruta/ });
    await expect(protein).toContainText("25\u202f%");
    await expect(protein).toContainText("27,5\u202f%"); // 25 / (100 − 9)
    await expect(table.getByRole("row", { name: /Calcio/ })).toContainText("1,1 %");
  });

  test("tarjetas con €/kg; productos sin contenido neto, sin él", async ({ page }) => {
    await page.goto("/categoria/piensos-perro/");
    await expect(page.locator("main article [data-unit]").first()).toHaveText(/€\/kg$/);
    await page.goto("/producto/mock-clicker-esencial-018/");
    await expect(page.locator("main [data-unit]")).toHaveCount(0);
    await expect(page.getByRole("table", { name: /Componentes analíticos/ })).toHaveCount(0);
  });

  test("subcategorías: el padre agrega a sus hijas; migas con la cadena", async ({ page }) => {
    await page.goto("/categoria/perro/");
    const subs = page.getByRole("navigation", { name: "Subcategorías de Perro" });
    await expect(subs.getByRole("link", { name: "Alimentación" })).toBeVisible();
    await expect(page.locator("main article").first()).toBeVisible();
    await subs.getByRole("link", { name: "Alimentación" }).click();
    await page
      .getByRole("navigation", { name: "Subcategorías de Alimentación" })
      .getByRole("link", { name: "Piensos" })
      .click();
    await expect(page).toHaveURL(/\/categoria\/piensos-perro\/$/);
    const crumbs = page.getByRole("navigation", { name: /migas/i });
    await expect(crumbs.getByRole("link", { name: "Perro" })).toHaveAttribute(
      "href",
      "/categoria/perro/",
    );
    await expect(crumbs.getByRole("link", { name: "Alimentación" })).toBeVisible();
    // Hoja: sin subcategorías
    await expect(page.getByRole("navigation", { name: /^Subcategorías/ })).toHaveCount(0);
  });

  test("descatalogado (Fase E): ficha con aviso y sustituto, fuera de listados y sitemap", async ({
    page,
  }) => {
    // catalog:mock: mock-guiso-eco-046 descatalogado, sustituto mock-guiso-eco-007
    await page.goto("/producto/mock-guiso-eco-046/");
    await expect(page.getByText("Este producto está descatalogado", { exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.getByRole("button", { name: /^Añadir/ })).toHaveCount(0);
    await page.getByRole("link", { name: /^Ver Guiso Eco/ }).click();
    await expect(page).toHaveURL(/\/producto\/mock-guiso-eco-007\/$/);
    await page.goto("/categoria/comida-cocinada-perro/");
    await expect(page.locator('main a[href="/producto/mock-guiso-eco-046/"]')).toHaveCount(0);
    const sitemap = await (await page.request.get("/sitemap-0.xml")).text();
    expect(sitemap).not.toContain("mock-guiso-eco-046");
    expect(sitemap).toMatch(/<loc>[^<]*\/producto\/mock-guiso-eco-007\/<\/loc><lastmod>/);
  });

  test("redirección 301 de /categorias/ a /categoria/ (Fase E)", async ({ page }) => {
    const res = await page.request.get("/categorias/piensos-perro/", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toMatch(/\/categoria\/piensos-perro\/$/);
  });

  test("/sobre-nosotros/ y pie con contacto, redes y pagos", async ({ page }) => {
    await page.goto("/sobre-nosotros/");
    await expect(page.getByRole("heading", { level: 1, name: "Sobre nosotros" })).toBeVisible();
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "tienda@elrincondehiro.com" })).toHaveAttribute(
      "href",
      "mailto:tienda@elrincondehiro.com",
    );
    await expect(footer.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/34640260110",
    );
    for (const alt of ["Visa", "Mastercard", "American Express"])
      await expect(footer.getByRole("img", { name: alt })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: "Transferencia" })).toHaveCount(0);
  });
});

test.describe("con JS", () => {
  test.use({ javaScriptEnabled: true });

  test("clic fuera de un menú abierto: solo lo cierra, no activa lo de debajo", async ({
    page,
  }) => {
    test.skip(isMobile(page), "el menú Tienda es de escritorio");
    await page.goto("/");
    await page.getByRole("button", { name: "Tienda" }).click();
    const menu = page.locator("#menu-tienda");
    await expect(menu).toBeVisible();
    const card = page.locator(".carousel article a[href^='/producto/']").first();
    await card.click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await card.click();
    await expect(page).toHaveURL(/\/producto\//);
  });

  test("carrusel: arrastrar con el ratón desplaza y no abre el producto", async ({ page }) => {
    test.skip(isMobile(page), "solo ratón");
    await page.goto("/");
    const carousel = page.locator(".carousel[data-drag-scroll]").first();
    await carousel.scrollIntoViewIfNeeded();
    const box = (await carousel.boundingBox())!;
    const y = box.y + 80;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => carousel.evaluate((e) => e.scrollLeft)).toBeGreaterThan(100);
    await expect(page).toHaveURL(/\/$/);
  });

  test("la cabecera se oculta al bajar y vuelve al subir", async ({ page }) => {
    await page.goto("/productos/");
    const header = page.locator("[data-site-header]");
    await page.mouse.wheel(0, 1200);
    await expect(header).toHaveAttribute("data-hide", "");
    await page.mouse.wheel(0, -300);
    await expect(header).not.toHaveAttribute("data-hide");
  });

  test("/ofertas/: la island recibe una clave corta y devuelve los datos de la página", async ({
    page,
  }) => {
    const island = page.waitForResponse((r) => r.url().includes("/_server-islands/LiveSyncData"));
    await page.goto("/ofertas/");
    const res = await island;
    // Props de tamaño fijo (clave, no ids): URL corta y GET cacheable (astro-docs § Caching).
    expect(res.request().method()).toBe("GET");
    expect(res.url().length).toBeLessThan(600);
    const data = (await res.text()).match(/<template data-live-sync>(.*?)<\/template>/s)?.[1];
    const entries = Object.keys(JSON.parse(data ?? "{}"));
    expect(entries.length).toBeGreaterThanOrEqual(await page.locator("main article").count());
    await expect(page.locator("main article").first().locator("del")).toBeVisible();
  });

  test("Speculation Rules (Fase R-3): prefetch de fichas al pasar el ratón, sin violaciones de CSP", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|speculation/i.test(m.text())) violations.push(m.text());
    });
    await page.goto("/categoria/perro/");
    const rules = JSON.parse(
      (await page.locator('head script[type="speculationrules"]').textContent()) ?? "{}",
    ) as { prefetch?: { eagerness?: string }[] };
    expect(rules.prefetch?.[0]?.eagerness).toBe("moderate");
    // Con JS (sin JS Chromium no las aplica). Al pasar el ratón por una tarjeta, pide la ficha
    // (cabecera Sec-Purpose: prefetch).
    const card = page.locator("main article a[href^='/producto/']").first();
    const href = (await card.getAttribute("href"))!;
    const prefetch = page.waitForRequest(
      (r) => r.url().endsWith(href) && /prefetch/.test(r.headers()["sec-purpose"] ?? ""),
      { timeout: 5000 },
    );
    await card.hover();
    await prefetch;
    expect(violations).toEqual([]);
  });
});
