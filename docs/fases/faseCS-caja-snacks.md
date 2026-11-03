# Fase CS — Caja de snacks (propuesta)

> **Estado:** ⏳ propuesta: decisiones del usuario recogidas (3-nov-2026). Se planifica en detalle **después de la
> Fase DS** (la caja será su propio diseño de ficha).
> **Rama/PR:** `feat/caja-snacks` (cuando toque) · PR #…
> **Anterior:** [Fase DS — diseños](./faseDS-disenos.md)

## 0. Qué es

Un producto «Caja de snacks» sin stock propio. El cliente elige cuánto paga y para qué mascota es. Tras el pago, la
tienda la rellena desde el Admin con productos del catálogo (cuyo stock se descuenta solo) y el cliente acepta la
caja o dice qué no le gusta.

## 1. Decisiones del usuario

| Tema                 | Decisión                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precio               | **Pasos**: 15, 20, 25, 30, 40 y 50 €. Una variante por importe (`manage_inventory = false`). Si hay demanda, se pasa a precio libre (mín./máx.).                                                                                                                                                         |
| Varias cajas         | Sí, varias por pedido (una línea por caja, cada una con su mascota).                                                                                                                                                                                                                                     |
| IVA                  | **Reducido (10 %)**: tipo de producto `iva-reducido` (siempre son snacks).                                                                                                                                                                                                                               |
| Puntos               | **Genera puntos** (no lleva `sin_puntos`).                                                                                                                                                                                                                                                               |
| Descuentos           | Por ahora **sin** códigos ni promociones. Hace falta un flag nuevo, p. ej. `sin_descuentos` (§3): hoy solo existe `sin_puntos`. Pendiente decidir si también excluye **pagar con puntos** (el canje de puntos es una promoción sobre el pedido entero).                                                  |
| Mascota              | **Formulario genérico en la ficha; la mascota se elige en el carrito**: con sesión, sus mascotas («Mis peques») u «Otra»; sin sesión, nombre y características (edad, salud con consentimiento, experiencia previa…). El formulario completo se define al empezar la fase (tendrá más campos que estos). |
| Rellenar             | En el Admin, dentro del pedido: productos y cantidades; ver valor PVP frente a lo pagado. El stock se reserva y descuenta solo.                                                                                                                                                                          |
| Propuesta al cliente | Email con el contenido y dos botones: **Aceptar** (confirma) y **No me convence** (formulario: qué no le gusta).                                                                                                                                                                                         |
| Sin respuesta        | A las **24 h** se da por aceptada (`aceptada_auto`).                                                                                                                                                                                                                                                     |
| Rechazo              | Se **rehace** la caja (quitar y poner productos) y se vuelve a proponer con otras 24 h.                                                                                                                                                                                                                  |
| Envío                | **No se puede enviar** el pedido hasta que todas sus cajas estén `aceptada` / `aceptada_auto`.                                                                                                                                                                                                           |
| Aviso interno        | Si una caja lleva **48 h laborables** sin rellenar, aviso a la tienda. Laborables = lunes a viernes **sin festivos**; si contar festivos es complicado, basta con saltar los fines de semana (un viernes no avisa hasta el martes).                                                                      |
| Loyverse             | No se tiene en cuenta: desaparece al desplegar la web.                                                                                                                                                                                                                                                   |

## 2. Borrador técnico (a revisar con la documentación al empezar)

- **CS-1 Producto**: variantes por importe, `diseno = caja` (Fase DS), `iva-reducido`, peso fijo.
- **CS-2 Mascota en el carrito**: bloque «¿Para quién es?» por caja en `/carrito/` (on-demand). Metadata de la línea:
  `pet_id` (comprobado en el servidor: es del cliente) + **copia** de los datos (el pedido no cambia si luego editan
  la ficha). Salud solo con consentimiento (como la Fase M). No se puede pagar sin mascota en cada caja. Sin JS:
  `<form>` + action; con JS, `CartLive` (≤ 1 KB).
- **CS-3 Rellenar (Admin)**: widget en el pedido, una tarjeta por caja. Workflow con **edición de pedido** de Medusa:
  añadir líneas a 0 € (el total no cambia: nada que cobrar ni devolver), confirmarla; Medusa reserva y, al enviar,
  descuenta. Cada línea añadida guarda a qué caja pertenece. `allow_backorder` por línea (Medusa ≥ 2.19) si un snack
  está a 0 pero existe físicamente. **Spike**: en 2.22.2, `unit_price` en las líneas nuevas de la edición, reservas al
  confirmar, sin cobro en Stripe, eventos y emails que dispara.
- **CS-4 Aceptar / rechazar**: enlaces con token firmado de un solo uso (valen para invitados). Página `/caja/<token>/`:
  aceptar con `<form>` POST (no GET: los escáneres de enlaces del correo no deben aceptar). Estado por caja:
  `rellenando → propuesta → aceptada | rechazada | aceptada_auto` (`rechazada` vuelve a `rellenando`). Job programado
  para las 24 h y para el aviso de 48 h laborables. Aviso a la tienda por email y ntfy (Fase M).
- **Bloqueo del envío**: el fulfillment del pedido se rechaza si alguna caja no está aceptada (hook o validación en el
  workflow de fulfillment: a confirmar con la documentación).

## 3. Flag «sin descuentos» (puede ir antes, en una parte pequeña)

- Hoy: `metadata.sin_puntos` (no genera puntos, `backend/src/lib/points.ts`). No hay nada para excluir de códigos y
  promociones.
- Propuesta: `metadata.sin_descuentos` (columna en la hoja y en el Admin). El tope de puntos (`points-room`) y el de
  códigos no cuentan esas líneas; `validar-carrito` rechaza el pedido si una línea con el flag lleva un descuento.
- Por resolver: si las promociones de puntos pasan a `target_type: "items"` con reglas o basta con limitar el importe
  (spike). Y si el flag cubre códigos, puntos o los dos.

## 4. Pendiente de decidir al empezar

- Campos completos del formulario de la mascota.
- Alcance de `sin_descuentos` (¿también pagar con puntos?).
- Si el cliente recibe también la caja rehecha por email (por defecto sí, con otras 24 h).
