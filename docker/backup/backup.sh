#!/bin/sh
# Backup diario de la tienda (fase 11-7). Lo lanza ecommerce-backup.timer (03:30, Europe/Madrid).
#
# Qué copia, CIFRADO con age (clave pública: el VPS solo puede cifrar, nunca descifrar):
#   - PostgreSQL: `pg_dump -Fc` dentro del contenedor → age → fichero. Nunca hay un dump en claro
#     en el disco.
#   - Configuración: .env.prod, certs/, compose*.yml, Caddyfile y dc → tar.gz → age.
# Dónde: R2 `hiro-backups` (jurisdicción EU, ciclo de vida 30 días) con curl --aws-sigv4 y una copia
# local de las últimas KEEP_LOCAL en BACKUP_DIR. Al terminar, heartbeat a Uptime Kuma (push) si
# KUMA_PUSH_URL está definida: status=up con el tamaño, o status=down con el paso que falló.
# Nada se escribe en el log que sea un secreto ni un dato personal (solo nombres y tamaños).
#
# Configuración: /opt/ecommerce/backup/backup.env (600; ver backup.env.example). No usa .env.prod
# salvo para copiarlo (cifrado) en la copia de configuración.
#
# Fuentes: context7 /websites/postgresql_17 (pg_dump -Fc, pg_restore), /filosottile/age (cifrado
# con -r), /louislam/uptime-kuma-wiki (push: /api/push/<token>?status=&msg=&ping=); cloudflare-docs
# (r2/api/tokens, data-location: endpoint .eu); docs/fases/fase11.md §4.8.
set -eu

CONF="${BACKUP_CONF:-/opt/ecommerce/backup/backup.env}"
# shellcheck disable=SC1090
. "$CONF"

: "${APP_DIR:=/opt/ecommerce}"
: "${BACKUP_DIR:=/var/backups/ecommerce}"
: "${KEEP_LOCAL:=3}"
: "${R2_PREFIX:=}"
: "${AGE_RECIPIENT:?falta AGE_RECIPIENT (clave pública age1…)}"
: "${R2_ENDPOINT:?falta R2_ENDPOINT}"
: "${R2_BUCKET:?falta R2_BUCKET}"
: "${R2_ACCESS_KEY_ID:?falta R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?falta R2_SECRET_ACCESS_KEY}"
: "${COMPOSE:=$APP_DIR/dc}"

STAMP=$(date +%Y%m%d-%H%M%S)
YM=$(date +%Y/%m)
STEP=inicio
START=$(date +%s)

log() { printf '%s [backup] %s\n' "$(date '+%F %T')" "$*"; }

kuma() {
  [ -n "${KUMA_PUSH_URL:-}" ] || return 0
  curl -fsS -m 15 -G "$KUMA_PUSH_URL" --data-urlencode "status=$1" --data-urlencode "msg=$2" \
    --data-urlencode "ping=$(($(date +%s) - START))" -o /dev/null || log "aviso: heartbeat no enviado"
}

fail() {
  log "ERROR en el paso «$STEP»"
  # Un fichero a medias no cuenta como copia local. Si falla la subida, las copias locales (ya
  # completas y cifradas) se conservan.
  case "$STEP" in
    postgres) rm -f "${DB:-}" "${DB:-}.err" ;;
    configuracion) rm -f "${CFG:-}" ;;
  esac
  kuma down "backup falló en: $STEP"
}
trap 'rc=$?; [ "$rc" -eq 0 ] || fail; exit "$rc"' EXIT

# PUT a R2 (API S3, firma SigV4) y comprobación del tamaño con HEAD.
put() {
  url="$R2_ENDPOINT/$R2_BUCKET/$R2_PREFIX$2"
  curl -fsS -m 600 --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
    -H "Content-Type: application/octet-stream" -T "$1" "$url" -o /dev/null
  remote=$(curl -fsS -m 60 -I --aws-sigv4 "aws:amz:auto:s3" \
    --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" "$url" |
    tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
  local_size=$(wc -c <"$1" | tr -d ' ')
  [ "$remote" = "$local_size" ] || { log "tamaño en R2 ($remote) ≠ local ($local_size)"; return 1; }
}

umask 077
mkdir -p "$BACKUP_DIR"

STEP=requisitos
command -v age >/dev/null || { log "falta age (apt install age)"; exit 1; }
[ -x "$COMPOSE" ] || { log "falta $COMPOSE"; exit 1; }

STEP=postgres
DB="$BACKUP_DIR/medusa-$STAMP.dump.age"
rm -f "$BACKUP_DIR"/*.err
# set -o pipefail no existe en dash: se comprueba el pg_dump con un fichero de estado.
( "$COMPOSE" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' ||
  echo fallo >"$DB.err" ) | age -r "$AGE_RECIPIENT" -o "$DB"
[ ! -e "$DB.err" ] || { rm -f "$DB" "$DB.err"; exit 1; }
[ "$(wc -c <"$DB")" -gt 1024 ] || { log "dump demasiado pequeño"; exit 1; }

STEP=configuracion
CFG="$BACKUP_DIR/config-$STAMP.tar.gz.age"
tar -C "$APP_DIR" -czf - --ignore-failed-read .env.prod certs dc Caddyfile \
  compose.prod.yml compose.prod.build.yml backup/backup.env 2>/dev/null |
  age -r "$AGE_RECIPIENT" -o "$CFG"

STEP=subida-postgres
put "$DB" "postgres/$YM/$(basename "$DB")"
STEP=subida-configuracion
put "$CFG" "config/$YM/$(basename "$CFG")"

STEP=limpieza-local
for kind in medusa config; do
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/"$kind"-*.age 2>/dev/null | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm -f
done

SIZE=$(du -h "$DB" | cut -f1)
log "OK: $(basename "$DB") ($SIZE) y $(basename "$CFG") en R2 y en $BACKUP_DIR"
kuma up "OK postgres $SIZE"
