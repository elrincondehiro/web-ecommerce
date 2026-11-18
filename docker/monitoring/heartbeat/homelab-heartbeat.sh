#!/bin/sh
# Latido del homelab hacia fuera (fase 12-A, docs/fases/fase12.md): ¿quién vigila al vigilante?
# Lo ejecuta un temporizador de systemd en la VM de monitorización cada 5 min. Si Uptime Kuma
# responde en local, hace ping al check de Healthchecks.io (gratis; el «Heartbeat» de UptimeRobot
# es de pago); si deja de recibir latidos, te avisa de que se ha caído la VM, Kuma o la conexión
# de casa.
# Config en /etc/homelab-heartbeat.env (600): HEARTBEAT_URL y, opcional, KUMA_URL
# (por defecto http://10.0.10.230:3001). Nunca escribe la URL (lleva el token) en el log.
# Fuente: curl de healthchecks.io/docs/bash (-fsS -m 10 --retry 5) y el endpoint de Kuma
# /api/entry-page (context7 /louislam/uptime-kuma-wiki: rutas públicas).
set -eu
# Con el servicio de systemd (LoadCredential); a mano, el fichero de /etc.
if [ -n "${CREDENTIALS_DIRECTORY:-}" ]; then
  . "$CREDENTIALS_DIRECTORY/env"
else
  . /etc/homelab-heartbeat.env
fi
kuma="${KUMA_URL:-http://10.0.10.230:3001}"
if ! curl -fsS -m 10 -o /dev/null "$kuma/api/entry-page"; then
  echo "Kuma no responde: no se envía el latido"
  exit 0
fi
curl -fsS -m 10 --retry 5 -o /dev/null "$HEARTBEAT_URL" || echo "Healthchecks.io no responde"
