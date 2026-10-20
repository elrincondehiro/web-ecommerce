#!/bin/sh
# Prueba de RESTAURACIÓN (fase 11-7). Se ejecuta en el PORTÁTIL (tiene la clave privada de age):
# descarga el último dump de R2, lo descifra en una tubería (nunca en claro en disco) y lo restaura
# en una BD NUEVA `medusa_restore_test` del Postgres del VPS, por SSH. Compara recuentos con la BD
# real y borra la de prueba.
#
#   docker/backup/restore-test.sh <fichero-identidad-age> [ruta-en-R2]
#   (sin ruta: el último de postgres/ del mes actual)
#
# Credenciales de R2 de LECTURA del bucket de backups en ~/.config/hiro-backups.env (600):
#   R2_ENDPOINT=https://<account_id>.eu.r2.cloudflarestorage.com
#   R2_BUCKET=hiro-backups
#   R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…
# Acceso al VPS: VPS_SSH (por defecto deploy@10.77.0.1).
# Fuentes: context7 /websites/postgresql_17 (pg_restore en BD nueva, --no-owner,
# --single-transaction), /filosottile/age (age -d -i). docs/fases/fase11.md §4.8.
set -eu
ID="${1:?uso: restore-test.sh <identidad-age> [ruta-en-R2]}"
CONF="${RESTORE_CONF:-$HOME/.config/hiro-backups.env}"
# shellcheck disable=SC1090
. "$CONF"
VPS="${VPS_SSH:-deploy@10.77.0.1}"
S3="--aws-sigv4 aws:amz:auto:s3 --user $R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY"

KEY="${2:-}"
if [ -z "$KEY" ]; then
  # shellcheck disable=SC2086
  KEY=$(curl -fsS $S3 "$R2_ENDPOINT/$R2_BUCKET?list-type=2&prefix=${R2_PREFIX:-}postgres/$(date +%Y/%m)/" |
    grep -o '<Key>[^<]*' | cut -c6- | sort | tail -1)
fi
[ -n "$KEY" ] || { echo "No hay backups en R2 este mes"; exit 1; }
echo "Restaurando $KEY en medusa_restore_test…"

PG='./dc exec -T postgres sh -c'
ssh "$VPS" "cd /opt/ecommerce && $PG 'dropdb -U \"\$POSTGRES_USER\" --if-exists medusa_restore_test && createdb -U \"\$POSTGRES_USER\" -T template0 medusa_restore_test'"
# shellcheck disable=SC2086
curl -fsS $S3 "$R2_ENDPOINT/$R2_BUCKET/$KEY" | age -d -i "$ID" |
  ssh "$VPS" "cd /opt/ecommerce && ./dc exec -T postgres sh -c 'pg_restore -U \"\$POSTGRES_USER\" -d medusa_restore_test --no-owner --single-transaction'"

# La consulta va por stdin a psql (sin comillas anidadas por ssh y sh).
Q='select (select count(*) from product where deleted_at is null) as productos,
  (select count(*) from product_variant where deleted_at is null) as variantes,
  (select count(*) from "order") as pedidos, (select count(*) from customer) as clientes;'
for db in medusa_restore_test real; do
  target=$([ "$db" = real ] && echo '"$POSTGRES_DB"' || echo "$db")
  printf '%-11s ' "$([ "$db" = real ] && echo real || echo restaurada)"
  printf '%s\n' "$Q" | ssh "$VPS" "cd /opt/ecommerce && $PG 'psql -U \"\$POSTGRES_USER\" -d $target -tA -F \" · \"'"
done
ssh "$VPS" "cd /opt/ecommerce && $PG 'dropdb -U \"\$POSTGRES_USER\" medusa_restore_test'" && echo "medusa_restore_test borrada"
