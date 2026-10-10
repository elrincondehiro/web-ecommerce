// Servidor para Lighthouse CI (fase 10-3): arranca el storefront (`dist/`, fixtures) y delante un
// proxy que imita a Caddy en producción (fase 11): brotli y `/_astro/*` inmutable. Sin el proxy,
// Lighthouse mide el HTML y el CSS sin comprimir (auditoría pre-fase 10 §2: 91–94 en vez de 99).
// Sin dependencias: node:http + node:zlib. Lo lanza `lhci autorun` (lighthouserc.cjs).
//   PORT (4330) → proxy · APP_PORT (4331) → storefront
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { constants, createBrotliCompress } from "node:zlib";

const PORT = Number(process.env.PORT ?? 4330);
const APP_PORT = Number(process.env.APP_PORT ?? 4331);
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/;

const app = spawn(process.execPath, ["./dist/server/entry.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(APP_PORT) },
  stdio: "inherit",
});
app.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    app.kill(signal);
    process.exit(0);
  });
}

const proxy = createServer((req, res) => {
  const upstream = request(
    {
      host: "127.0.0.1",
      port: APP_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, "accept-encoding": "identity" },
    },
    (up) => {
      const headers = { ...up.headers };
      if (req.url?.startsWith("/_astro/")) {
        headers["cache-control"] = "public, max-age=31536000, immutable";
      }
      const type = String(headers["content-type"] ?? "");
      const brotli =
        COMPRESSIBLE.test(type) && /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""));
      if (!brotli) {
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
        return;
      }
      delete headers["content-length"];
      headers["content-encoding"] = "br";
      headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : "Accept-Encoding";
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});

// Espera a que el storefront responda antes de anunciar «listo» (startServerReadyPattern).
async function waitForApp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${APP_PORT}/health`);
      if (r.ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("El storefront no arranca");
}

await waitForApp();
proxy.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`lhci-server ready on http://127.0.0.1:${PORT}\n`);
});
