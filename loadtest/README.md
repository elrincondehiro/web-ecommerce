# Pruebas de carga (k6)

`k6/tienda.js`: el pico de un anuncio en la tienda (fase 11-10, `docs/fases/fase11.md` §5.7).
Visitas con su propio carrito (cookies por VU) a un ritmo fijo de páginas HTML por segundo
(`ramping-arrival-rate`): 88 % curiosean (home → listado → ficha, con sus server islands), 10 %
añaden al carrito (POST sin JS) y 2 % llegan al checkout (sin pagar); 20 % buscan. Solo HTML y
server islands: lo estático lo sirve Cloudflare.

Se ejecuta con Docker (`grafana/k6:2.3.0`), desde la VM de monitorización (fuera del VPS):

```bash
cd loadtest/k6
# Humo (30 s a 1 página/s)
docker run --rm --network host -v "$PWD:/s" -e PAGINAS_S=1 -e SUBIDA=10s -e MANTENER=30s -e BAJADA=5s grafana/k6:2.3.0 run /s/tienda.js
# Tanda A: vía Cloudflare (50 páginas/s, 2 min de subida + 10 min + 1 min de bajada)
docker run --rm --network host -u "$(id -u):$(id -g)" -v "$PWD:/s" -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_HOST=0.0.0.0 -e K6_WEB_DASHBOARD_EXPORT=/s/informe-A.html grafana/k6:2.3.0 run /s/tienda.js
# Tanda B: directo a Caddy por el túnel (requiere docker/compose.prod.loadtest.yml en el VPS)
docker run --rm --network host -u "$(id -u):$(id -g)" -v "$PWD:/s" -e ORIGEN=1 -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_HOST=0.0.0.0 -e K6_WEB_DASHBOARD_EXPORT=/s/informe-B.html grafana/k6:2.3.0 run /s/tienda.js
```

Variables: `BASE` (por defecto `https://hirobordercollie.es`), `ORIGEN=1` (+ `ORIGEN_ADDR`, por
defecto `10.77.0.1:8443`), `PAGINAS_S` (50), `SUBIDA` (2m), `MANTENER` (10m), `BAJADA` (1m). El panel
en vivo queda en `http://<VM>:5665`. Se para solo si los errores pasan del 1 %.

La IP desde la que se lanza necesita las reglas temporales de Cloudflare (Bypass de Access y Skip
del rate limiting). Los `informe-*.html` no se suben al repo.
