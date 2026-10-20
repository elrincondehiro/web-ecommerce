// Prueba de carga de la tienda (fase 11-10) con k6 2.3.0 (grafana/k6:2.3.0, en la VM monitor-kbd).
//
// Simula el pico de un anuncio: VISITAS (recorridos de una persona, con su propio carrito por
// cookies) que llegan a un ritmo de PAGINAS_S páginas HTML por segundo.
//   88 % curiosear: home → listado → ficha (+ las server islands que pediría el navegador)
//   10 %  + añadir al carrito (POST sin JS → 303) → /carrito/
//    2 %  + /checkout/ (sin pagar ni rellenar datos)
//   20 % de las visitas buscan (/buscar/?q=…)
// Solo se piden HTML y server islands: imágenes, CSS y /_astro/ los sirve Cloudflare (no llegan al
// VPS) y el navegador los tiene en caché inmutable.
//
// Variables (-e): BASE (https://hirobordercollie.es), ORIGEN=1 (tanda B: directo a Caddy por el
// túnel, sitio de pruebas 10.77.0.1:8443), PAGINAS_S (50), MANTENER (10m), SUBIDA (2m), BAJADA
// (1m). Humo: -e PAGINAS_S=1 -e MANTENER=30s -e SUBIDA=10s -e BAJADA=5s.
//
// Fuentes: context7 /grafana/k6-docs v2.3.x (ramping-arrival-rate, thresholds + abortOnFail, tags,
// hosts, insecureSkipTLSVerify, setResponseCallback/expectedStatuses, res.html(), test lifecycle:
// setup, cookies por VU, web dashboard). docs/fases/fase11.md §5.7.
/* global __ENV */
/* eslint-disable no-console -- k6: el resumen del setup va a la consola de k6 */
import http from "k6/http";
import { check, group } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE || "https://hirobordercollie.es").replace(/\/$/, "");
const ORIGEN = __ENV.ORIGEN === "1";
const PAGINAS_S = Number(__ENV.PAGINAS_S || 50);
// Páginas HTML por visita (media): 3 + 0,2 búsqueda + 0,12 carrito + 0,02 checkout ≈ 3,34
const PAGINAS_POR_VISITA = 3.34;
const VISITAS_S = PAGINAS_S / PAGINAS_POR_VISITA;
const host = BASE.replace(/^https?:\/\//, "").split("/")[0];

const LISTADOS = [
  "/productos/",
  "/categoria/perro/",
  "/categoria/gato/",
  "/categoria/piensos-perro/",
  "/ofertas/",
];
const BUSQUEDAS = ["pienso", "cama", "collar", "premios", "juguete", "correa", "gato", "champu"];

const paginas = new Counter("paginas_html");
const islandDur = new Trend("island_duration", true);
// Tiempo de las páginas según la caché de Cloudflare (HIT, MISS, EXPIRED, BYPASS…; "-" sin Cloudflare)
const cacheDur = new Trend("pagina_cache", true);

export const options = {
  discardResponseBodies: false,
  // Tanda B: el nombre real (SNI y Host) pero contra el sitio de pruebas de Caddy en el túnel
  ...(ORIGEN
    ? {
        hosts: { [`${host}:443`]: __ENV.ORIGEN_ADDR || "10.77.0.1:8443" },
        insecureSkipTLSVerify: true,
      }
    : {}),
  scenarios: {
    visitas: {
      executor: "ramping-arrival-rate",
      startRate: Math.max(1, Math.round((5 / PAGINAS_POR_VISITA) * 60)),
      timeUnit: "1m",
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: Math.round(VISITAS_S * 60), duration: __ENV.SUBIDA || "2m" },
        { target: Math.round(VISITAS_S * 60), duration: __ENV.MANTENER || "10m" },
        { target: 0, duration: __ENV.BAJADA || "1m" },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
    "http_req_duration{tipo:estatica}": ["p(95)<500"],
    "http_req_duration{tipo:island}": ["p(95)<800"],
    "http_req_duration{tipo:dinamica}": ["p(95)<1500"],
    dropped_iterations: ["count<50"],
    // Solo para que el resumen desglose por estado de caché (k6 muestra las submétricas con umbral)
    "pagina_cache{cf:HIT}": ["max>=0"],
    "pagina_cache{cf:MISS}": ["max>=0"],
    "pagina_cache{cf:EXPIRED}": ["max>=0"],
    "pagina_cache{cf:DYNAMIC}": ["max>=0"],
    "pagina_cache{cf:BYPASS}": ["max>=0"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// Lo que el navegador hace al cargar una página estática: pedir sus server islands.
function islands(res) {
  if (res.status !== 200 || !res.body) return;
  const urls = [...String(res.body).matchAll(/fetch\("(\/_server-islands\/[^"]+)"/g)].map(
    (m) => m[1],
  );
  for (const u of urls) {
    const r = http.get(BASE + u, {
      headers: HEADERS,
      tags: { tipo: "island", name: u.split("?")[0] },
    });
    islandDur.add(r.timings.duration);
  }
}

function pagina(path, tipo, nombre) {
  const res = http.get(BASE + path, { headers: HEADERS, tags: { tipo, name: nombre } });
  paginas.add(1);
  cacheDur.add(res.timings.duration, { cf: res.headers["Cf-Cache-Status"] || "-", tipo });
  check(res, { [`${nombre} 200`]: (r) => r.status === 200 });
  return res;
}

// Como un navegador: sin esto k6 no pide compresión y descarga el HTML entero (290 KB en vez de
// 20 KB en /productos/), y la prueba mide el ancho de banda de quien la lanza.
const HEADERS = { "Accept-Encoding": "br, gzip" };

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  // Fichas reales: del sitemap (como llegaría un visitante desde el anuncio o un buscador)
  const res = http.get(`${BASE}/sitemap-0.xml`, { headers: HEADERS, tags: { tipo: "setup" } });
  const fichas = [...String(res.body).matchAll(/<loc>[^<]*?(\/producto\/[^<]+\/)<\/loc>/g)]
    .map((m) => m[1])
    .filter((p) => p !== "/producto/correa-a-medida/");
  if (fichas.length < 50) throw new Error(`Solo ${fichas.length} fichas en el sitemap`);
  console.log(
    `${fichas.length} fichas · ${VISITAS_S.toFixed(1)} visitas/s ≈ ${PAGINAS_S} páginas/s`,
  );
  return { fichas };
}

export default function (data) {
  const r = Math.random();
  group("curiosear", () => {
    islands(pagina("/", "estatica", "home"));
    islands(pagina(pick(LISTADOS), "estatica", "listado"));
    if (Math.random() < 0.2) {
      pagina(`/buscar/?q=${pick(BUSQUEDAS)}`, "busqueda", "buscar");
    }
  });
  const fichaRes = pagina(pick(data.fichas), "estatica", "ficha");
  islands(fichaRes);
  if (r >= 0.12) return; // 88 %: se va

  group("carrito", () => {
    // La primera variante con stock del formulario de compra (radio o hidden)
    const v = /name="variant_id" value="(variant_[A-Z0-9]+)"/.exec(String(fichaRes.body));
    if (!v) return;
    const add = http.post(
      `${BASE}/carrito/?_action=cart.add`,
      { variant_id: v[1], quantity: "1" },
      {
        redirects: 0,
        // checkOrigin de Astro: un POST de formulario necesita Origin del propio sitio
        headers: { ...HEADERS, Origin: BASE },
        tags: { tipo: "dinamica", name: "cart.add" },
        responseCallback: http.expectedStatuses(303),
      },
    );
    check(add, { "cart.add 303": (x) => x.status === 303 });
    pagina("/carrito/", "dinamica", "carrito");
  });
  if (r >= 0.02) return; // 10 %: deja el carrito

  pagina("/checkout/", "dinamica", "checkout"); // 2 %
}
