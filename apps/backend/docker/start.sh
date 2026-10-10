#!/bin/sh
# Arranque del contenedor del backend (fase 10). Misma imagen para server y worker.
# - server: `medusa db:migrate` (migraciones, scripts de datos, enlaces e índices de búsqueda) y
#   después `medusa start`. Es el "predeploy" de la guía de despliegue de Medusa.
# - worker: solo `medusa start` (nunca migra: dos procesos migrando a la vez se pisarían).
# Sin TTY, `db:migrate` no puede preguntar: `--execute-safe-*` aplica solo lo seguro y NO borra
# tablas de enlaces ni índices de búsqueda que ya no se declaren (eso, a mano y revisado).
# Fuente: context7 /medusajs/medusa (deployment/general, production/worker-mode) + código de
# @medusajs/medusa 2.21.2 (commands/db/sync-links.js, commands/db/migrate-search.js).
set -eu

MODE="${MEDUSA_WORKER_MODE:-shared}"

if [ "$MODE" = "server" ] || [ "$MODE" = "shared" ]; then
  echo "[start] Modo ${MODE}: migrando la base de datos…"
  ./node_modules/.bin/medusa db:migrate --execute-safe-links --execute-safe-search
fi

echo "[start] Arrancando Medusa en modo ${MODE}"
exec ./node_modules/.bin/medusa start
