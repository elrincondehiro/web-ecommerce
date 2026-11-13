#!/bin/sh
# Temporizador del LXC del runner de Gitea (homelab, fase 13): pregunta al backend del VPS (por
# WireGuard) si hay que publicar y, si toca, lanza el workflow `storefront-rebuild.yml` por la API
# de Gitea y avisa «en cola» (para no lanzarlo dos veces mientras espera runner).
# Config en /etc/storefront-rebuild.env (600): VPS_HOOK, STOREFRONT_REBUILD_SECRET, GITEA_API,
# GITEA_REPO, GITEA_TOKEN (scope write:repository). Nunca escribe secretos en el log.
set -eu
. /etc/storefront-rebuild.env
h="x-rebuild-secret: $STOREFRONT_REBUILD_SECRET"
answer="$(curl -fsS -m 15 -H "$h" "$VPS_HOOK")" || { echo "VPS no responde"; exit 0; }
case "$answer" in
  *'"publish":true'*) ;;
  *) exit 0 ;;
esac
reason="$(printf '%s' "$answer" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p')"
curl -fsS -m 20 -X POST "$GITEA_API/repos/$GITEA_REPO/actions/workflows/storefront-rebuild.yml/dispatches" \
  -H "Authorization: token $GITEA_TOKEN" -H 'content-type: application/json' \
  -d "{\"ref\":\"main\",\"inputs\":{\"reason\":\"$reason\"}}"
curl -fsS -m 15 -X POST "$VPS_HOOK" -H "$h" -H 'content-type: application/json' -d '{"event":"queued"}' >/dev/null
echo "workflow lanzado ($reason)"
