#!/bin/sh
# Entorno «real» TEMPORAL (docs/entorno-real.md): ejecuta un comando en apps/<app> con las
# variables de apps/<app>/.env.real exportadas antes. Medusa (loadEnv → dotenv) y Vite/Astro no
# sobrescriben una variable ya definida, así que .env.real gana a .env.
# Uso: sh scripts/real-env.sh <backend|storefront> <comando…>
# ⚠️ Borrar junto con los scripts `real:*` del package.json raíz al pasar el catálogo a producción.
set -eu
app="$1"
shift
cd "$(dirname "$0")/../apps/$app"
if [ ! -f .env.real ]; then
  echo "Falta apps/$app/.env.real (ver docs/entorno-real.md)" >&2
  exit 1
fi
set -a
. ./.env.real
set +a
exec "$@"
