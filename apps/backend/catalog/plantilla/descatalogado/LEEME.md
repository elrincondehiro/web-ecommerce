# Descatalogar un producto

Hoja **mínima** (solo lo que cambia): `collar-cuero` se crea ya descatalogado con `collar-nylon` como sustituto. Carga
antes [producto-variantes](../producto-variantes/LEEME.md) (el sustituto tiene que existir en la hoja o en la tienda).

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/descatalogado dry-run
pnpm --filter backend catalog:import catalog/plantilla/descatalogado
```

Un producto que ya no se vende **no se borra ni se pasa a borrador**: su URL tiene visitas, enlaces y posición en Google. Se marca `descatalogado` = `sí` (Fase E):

- La ficha sigue en `/producto/<handle>/` con el aviso «Este producto está descatalogado», sin botón de compra, con `noindex` y un enlace al `sustituto` (si lo hay), a su categoría o a `/productos/`.
- Sale de categorías, `/productos/`, ofertas, carrusel de la home, búsqueda, sugerencias y sitemap.
- Medusa no deja añadirlo al carrito (400 «Este producto está descatalogado y ya no se puede comprar.»). Los carritos que ya lo tenían pueden pagarlo: si no quieres, quita el stock.
- `sustituto`: handle de otro producto de esta hoja o de la tienda; no puede ser él mismo. Se guardan `metadata.descatalogado` y `metadata.sustituto`.
- Volver a venderlo: `descatalogado` = `no`.
- El cambio llega a la búsqueda al momento y a las páginas en el siguiente build.
