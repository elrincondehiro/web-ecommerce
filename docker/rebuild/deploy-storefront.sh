#!/bin/sh
# Rebuild del storefront (fase 13): lo ÚNICO que puede hacer la clave del workflow de Gitea en el
# VPS. Va como `command=` en ~deploy-storefront/.ssh/authorized_keys (con `restrict`): cualquier
# otro comando que pida el cliente se ignora. Baja la imagen `:live` y recrea el storefront.
# Instalación: docs/fases/fase13-rebuild.md §R-2. Necesita STOREFRONT_IMAGE_TAG=live en .env.prod.
set -eu
cd /opt/ecommerce
exec sudo -n -u deploy /opt/ecommerce/dc-storefront
