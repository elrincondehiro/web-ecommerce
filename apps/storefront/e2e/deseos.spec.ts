// e2e de la lista de deseos (Fase L-1). Requisitos: los de playwright.config.ts y cuenta.spec.ts
// (backend con EMAIL_TRANSPORT=smtp → Mailpit en :8025 para verificar el email).
// - Sin JS: guardar sin sesión → «Entrar» → al entrar se guarda solo (cookie de 10 min) y vuelve
//   a la página; guardar con sesión (aviso :target, idempotente); /cuenta/deseos/ con quitar.
// - Con JS: toast sin recargar; sin sesión navega a «Entrar»; la página no carga bundles nuevos.
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

/** Ficha con tabla de variantes (2 variantes con stock, como MULTI de carrito.spec.ts). */
const TABLE_PRODUCT = "/producto/mock-champu-plus-020/";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";

async function verifyLink(page: Page, to: string): Promise<string> {
  const re = /\/cuenta\/verificar\/\?token=([\w.-]+)/;
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = re.exec(msg.Text);
      if (match) return `/cuenta/verificar/?token=${match[1]}`;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email de verificación para ${to}`);
}

/** Crea una cuenta verificada con la interfaz (sin JS no hace falta: los formularios son POST). */
async function createAccount(page: Page, email: string) {
  await page.goto("/cuenta/registro/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/cuenta\/entrar\/$/);
  await page.goto(await verifyLink(page, email));
  await page.getByRole("button", { name: "Confirmar mi email" }).click();
  await expect(page.getByText("¡Email confirmado!")).toBeVisible();
}

async function fillLogin(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/**
 * Un producto normal (con «Añadir» en la tarjeta) del listado: su ficha, su título y la tarjeta
 * (los mocks repiten títulos: el botón se busca dentro de la tarjeta).
 */
async function firstProduct(page: Page) {
  await page.goto("/productos/");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: /^Añadir/ }) })
    .first();
  const link = card.getByRole("heading").getByRole("link");
  const href = (await link.getAttribute("href"))!;
  const title = (await link.textContent())!.trim();
  const save = () =>
    page
      .locator("article")
      .filter({ has: page.locator(`a[href="${href}"]`) })
      .getByRole("button", { name: `Guardar ${title} en mi lista de deseos` });
  return { href, title, save };
}

test.describe("lista de deseos sin JS", () => {
  skipIfRemote();
  test.use({ javaScriptEnabled: false });
  test.describe.configure({ mode: "serial" });
  const email = testEmail("e2e-deseos");

  test("sin sesión → entrar → se guarda solo y vuelve a la ficha", async ({ page }) => {
    await createAccount(page, email);
    const { href, title } = await firstProduct(page);
    await page.goto(href);
    await page
      .locator("button[name=wish]")
      .and(page.getByRole("button", { name: `Guardar ${title} en mi lista de deseos` }))
      .click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/\?next=/);
    await expect(page.getByText(/Entra en tu cuenta para guardar productos/)).toBeVisible();
    await fillLogin(page, email);
    await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));

    await page.goto("/cuenta/deseos/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mi lista de deseos");
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  });

  test("con sesión: guardar desde el listado (idempotente) y quitar", async ({ page }) => {
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    const { title, save } = await firstProduct(page);
    await save().click();
    // Este producto puede estar ya guardado por el test anterior (misma cuenta).
    await expect(page).toHaveURL(/\/productos\/#deseos-wish_(added|already)$/);
    const code = new URL(page.url()).hash.slice(1);
    await expect(page.locator(`#${code}`)).toBeVisible();
    await save().click();
    await expect(page).toHaveURL(/#deseos-wish_already$/);
    await expect(page.getByText("Ya estaba en tu lista de deseos")).toBeVisible();

    await page.goto("/cuenta/deseos/");
    const rows = page.locator("main li");
    const before = await rows.count();
    await page
      .getByRole("button", { name: `Quitar ${title} de mi lista` })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cuenta\/deseos\/#deseos-wish_removed$/);
    await expect(page.getByText("Quitado de tu lista de deseos")).toBeVisible();
    await expect(rows).toHaveCount(Math.max(0, before - 1));
  });

  test("ficha con variantes guarda la elegida; la correa, el producto", async ({ page }) => {
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    // Ficha con tabla de variantes (una opción sin fotos ni colores; Fase O). El selector de
    // opciones se prueba en variantes.spec.ts.
    await page.goto(TABLE_PRODUCT);
    const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    const radios = page.locator("input[name=variant_id]");
    const second = radios.nth(1);
    const id = (await second.getAttribute("id"))!;
    const variantTitle = (await page.locator(`label[for="${id}"]`).textContent())!.trim();
    await second.check();
    await page
      .locator("button[name=wish]")
      .and(page.getByRole("button", { name: `Guardar ${title} en mi lista de deseos` }))
      .click();
    await expect(page).toHaveURL(/#deseos-wish_(added|already)$/);

    // Correa a medida: un color (producto), sin variante.
    await page.goto("/producto/correa-azul-nylon/");
    const correa = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    await page
      .locator("button[name=wish]")
      .and(page.getByRole("button", { name: `Guardar ${correa} en mi lista de deseos` }))
      .click();
    await expect(page).toHaveURL(/\/producto\/correa-azul-nylon\/#deseos-wish_(added|already)$/);

    await page.goto("/cuenta/deseos/");
    const variantRow = page
      .locator("main li")
      .filter({ hasText: variantTitle })
      .filter({
        has: page.getByRole("link", { name: title, exact: true }),
      });
    await expect(variantRow).toHaveCount(1);
    const correaRow = page
      .locator("main li")
      .filter({ has: page.getByRole("link", { name: correa, exact: true }) });
    await expect(correaRow.getByRole("link", { name: "Elegir medida" })).toBeVisible();
  });
});

test.describe("lista de deseos con JS", () => {
  test("sin sesión: el corazón lleva a «Entrar»", async ({ page }) => {
    const { save } = await firstProduct(page);
    await save().click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/\?next=%2Fproductos%2F$/);
  });

  test("con sesión: toast sin recargar y sin bundles nuevos", async ({ page }) => {
    skipIfRemote();
    const email = testEmail("e2e-deseos-js");
    await createAccount(page, email);
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);

    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
    });
    const { save } = await firstProduct(page);
    const url = page.url();
    await save().click();
    await expect(
      page.getByRole("status").getByText("Guardado en tu lista de deseos"),
    ).toBeVisible();
    expect(page.url()).toBe(url);
    const own = scripts.filter((s) => s.startsWith("/_astro/")).map((s) => s.split("/").pop()!);
    expect(
      own.every((s) => /^(CartClient|SiteClient)\./.test(s)),
      own.join(", "),
    ).toBe(true);
  });
});

test.describe("lista de deseos con JS: estado guardado", () => {
  skipIfRemote();
  test.describe.configure({ mode: "serial" });
  const email = testEmail("e2e-deseos-rojo");

  test("♥ rojo en tarjetas y ficha, iconos de la cabecera y lista con cantidad", async ({
    page,
  }) => {
    await createAccount(page, email);
    // Sin sesión: cuenta y ♡ de la cabecera vacíos.
    const heartLink = page.getByRole("link", { name: "Mi lista de deseos" }).first();
    await page.goto("/productos/");
    await expect(page.locator("html")).not.toHaveAttribute("data-auth", "");
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);

    // Con sesión, sin nada guardado: icono de cuenta relleno; ♡ de la cabecera vacío.
    const { href, title, save } = await firstProduct(page);
    await expect(page.locator("html")).toHaveAttribute("data-auth", "");
    await expect(page.locator("html")).not.toHaveAttribute("data-wish-any", "");

    // Guardar → toast, ♥ rojo (enlace a la lista) y ♡ de la cabecera relleno.
    await save().click();
    await expect(
      page.getByRole("status").getByText("Guardado en tu lista de deseos"),
    ).toBeVisible();
    const card = page.locator("article").filter({ has: page.locator(`a[href="${href}"]`) });
    const red = card.getByRole("link", {
      name: `${title} está en tu lista de deseos: ver mi lista`,
    });
    await expect(red).toBeVisible();
    await expect(save()).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-wish-any", "");

    // Al recargar sigue rojo (estado de la island de la cabecera).
    await page.reload();
    await expect(red).toBeVisible();

    // Sin parpadeo (fix antes de la fase 11): la pista de localStorage marca la cabecera ANTES
    // de que llegue la island. Se bloquea la island para ver solo lo que aplica el <head>.
    expect(await page.evaluate(() => localStorage.getItem("cabecera"))).toBe("aw");
    await page.route("**/_server-islands/**", (r) => r.abort());
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-auth", "");
    await expect(page.locator("html")).toHaveAttribute("data-wish-any", "");
    await page.unroute("**/_server-islands/**");
    await page.goto("/productos/");
    await expect(red).toBeVisible();
    // Pulsar el ♥ rojo NO quita: lleva a la lista (decisión A).
    await red.click();
    await expect(page).toHaveURL(/\/cuenta\/deseos\/$/);
    const row = page.locator("main li").filter({
      has: page.getByRole("link", { name: title, exact: true }),
    });
    await expect(row).toHaveCount(1);

    // Desde la lista: cantidad − / + y Añadir (variante única).
    await row.getByRole("button", { name: /^Una unidad más/ }).click();
    await expect(row.getByRole("spinbutton")).toHaveValue("2");
    await row.getByRole("button", { name: `Añadir ${title} al carrito` }).click();
    await expect(page.getByRole("status").getByText(/^Añadido/)).toBeVisible();
    await expect(heartLink).toBeVisible();
  });

  test("P6: tras entrar, la cuenta sale con sesión en el HTML y la pista ya está puesta", async ({
    page,
  }) => {
    await page.goto("/cuenta/entrar/");
    await page.evaluate(() => localStorage.clear());
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    // El HTML del servidor (on-demand) ya trae <html data-auth>: no depende del JS.
    const html = await (await page.request.get("/cuenta/")).text();
    expect(html).toMatch(/<html[^>]*\sdata-auth[\s>=]/);
    // La primera página estática tras entrar: con la island bloqueada, la pista lo marca.
    await expect.poll(() => page.evaluate(() => localStorage.getItem("cabecera"))).not.toBeNull();
    await page.route("**/_server-islands/**", (r) => r.abort());
    await page.goto("/condiciones/");
    await expect(page.locator("html")).toHaveAttribute("data-auth", "");
    await page.unroute("**/_server-islands/**");
  });

  test("cerrar sesión borra la pista de la cabecera; sesión caducada: la island la corrige", async ({
    page,
  }) => {
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("cabecera"))).toBe("aw");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\//);
    expect(await page.evaluate(() => localStorage.getItem("cabecera"))).toBeNull();

    // Pista vieja sin sesión (cookie caducada): el <head> la aplica y la island la corrige.
    await page.evaluate(() => localStorage.setItem("cabecera", "aw"));
    await page.goto("/productos/");
    await expect(page.locator("html")).not.toHaveAttribute("data-auth", "");
    await expect(page.locator("html")).not.toHaveAttribute("data-wish-any", "");
    expect(await page.evaluate(() => localStorage.getItem("cabecera"))).toBeNull();
  });

  test("ficha con variantes: el ♡ del título sigue a la variante elegida", async ({ page }) => {
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    await page.goto(TABLE_PRODUCT);
    const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    const radios = page.locator("input[name=variant_id]:visible");
    const save = page
      .locator("button[name=wish]")
      .and(page.getByRole("button", { name: `Guardar ${title} en mi lista de deseos` }));
    const red = page.getByRole("link", {
      name: `${title} está en tu lista de deseos: ver mi lista`,
    });

    await radios.nth(1).check();
    await save.click();
    await expect(page.getByRole("status").getByText(/en tu lista de deseos/)).toBeVisible();
    await expect(red).toBeVisible();
    // Otra variante (no guardada): vuelve el ♡ vacío; la guardada, rojo.
    await radios.nth(0).check();
    await expect(save).toBeVisible();
    await expect(red).toBeHidden();
    await radios.nth(1).check();
    await expect(red).toBeVisible();
    // Lejos de «Añadir»: el ♡ está en la fila del título (h1).
    const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
    const heart = await red.boundingBox();
    expect(Math.abs(heart!.y - h1!.y)).toBeLessThan(40);
  });
});

test.describe("cabecera", () => {
  test("móvil: tema en el menú y ♡ + cuenta + carrito caben a 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    const header = page.locator("[data-site-header]");
    await expect(header.getByRole("link", { name: "Mi lista de deseos" })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Cambiar a modo/ })).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Menú" }).click();
    const toggle = page.locator("#menu-movil").getByRole("button", { name: /^Cambiar a modo/ });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
  });
});

test.describe("compartir la lista (L-1b)", () => {
  skipIfRemote();
  test.describe.configure({ mode: "serial" });
  const email = testEmail("e2e-deseos-share");
  let shareUrl = "";

  test("sin JS: crear enlace, ver la lista sin sesión (noindex, sin email) y añadir al carrito", async ({
    browser,
  }) => {
    const owner = await browser.newContext({ javaScriptEnabled: false });
    const page = await owner.newPage();
    await createAccount(page, email);
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    const { title, save } = await firstProduct(page);
    await save().click();
    await page.goto("/cuenta/deseos/");
    await page.getByRole("button", { name: "Crear enlace para compartir" }).click();
    await expect(page).toHaveURL(/\/cuenta\/deseos\/#deseos-wish_shared$/);
    shareUrl = await page.getByLabel("Enlace de tu lista").inputValue();
    expect(shareUrl).toMatch(/\/deseos\/[A-Za-z0-9_-]{43}\/$/);
    // Sin JS no hay «Copiar» (se copia del campo).
    await expect(page.getByRole("button", { name: "Copiar enlace" })).toBeHidden();

    const guest = await browser.newContext({ javaScriptEnabled: false });
    const g = await guest.newPage();
    const res = await g.goto(new URL(shareUrl).pathname);
    expect(res?.headers()["cache-control"]).toBe("private, no-store");
    expect(res?.headers()["referrer-policy"]).toBe("same-origin");
    await expect(g.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(g.getByRole("heading", { level: 1 })).toHaveText("Lista de deseos");
    expect(await g.content()).not.toContain(email);
    const row = g
      .locator("main li")
      .filter({ has: g.getByRole("link", { name: title, exact: true }) });
    await expect(row.getByRole("button", { name: /^Quitar/ })).toHaveCount(0);
    await row.getByRole("button", { name: `Añadir ${title} al carrito` }).click();
    await expect(g).toHaveURL(/#carrito-added$/);
    await guest.close();
    await owner.close();
  });

  test("con JS: copiar enlace; dejar de compartir → 404", async ({ browser, browserName }) => {
    const ctx = await browser.newContext(
      browserName === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {},
    );
    const page = await ctx.newPage();
    await page.goto("/cuenta/entrar/");
    await fillLogin(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);
    await page.goto("/cuenta/deseos/");
    await page.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(page.getByRole("status").getByText("Enlace copiado")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareUrl);

    await page.getByRole("button", { name: "Dejar de compartir" }).click();
    await expect(page).toHaveURL(/#deseos-wish_unshared$/);
    await expect(page.getByRole("button", { name: "Crear enlace para compartir" })).toBeVisible();
    const gone = await page.request.get(new URL(shareUrl).pathname);
    expect(gone.status()).toBe(404);
    await ctx.close();
  });
});
