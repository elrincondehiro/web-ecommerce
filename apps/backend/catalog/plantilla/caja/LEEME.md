# Caja de snacks

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/caja dry-run
pnpm --filter backend catalog:import catalog/plantilla/caja
```

Fase CS. Un producto con una variante por importe y el diseño `caja`: la ficha pide «¿Para quién es?» (tipo de animal, nombre, raza, edad o meses si es cachorro, peso, gustos, si quiere snacks con pelo, cómo mastica y, con consentimiento, alergias). Esos datos van con la línea del carrito y del pedido (carrito, checkout, página del pedido, emails y el Admin, widget «Caja de snacks» del pedido).

- El ejemplo: 15, 20, 25, 30, 40 y 50 €, IVA `reducido`, `diseno = caja` y `sin_stock = sí`.
- Una caja por envío del formulario: varias cajas (o para varias mascotas) son varias líneas.
- Los datos se validan en la tienda y otra vez en el backend (`apps/backend/src/lib/line-data.ts`).
