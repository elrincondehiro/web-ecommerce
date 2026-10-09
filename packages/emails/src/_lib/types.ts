/** Tipos de datos comunes de las plantillas (el backend los construye desde Medusa). */

export type EmailAddress = {
  name: string;
  address1: string;
  address2?: string | null;
  postalCode: string;
  city: string;
  province?: string | null;
  country: string;
  phone?: string | null;
};

export type EmailLineItem = {
  title: string;
  /** Variante (p. ej. "M / Azul"); se omite si es la única. */
  variant?: string | null;
  quantity: number;
  /** Precio unitario con IVA, unidad principal. */
  unitPrice: number;
  /** Total de la línea con IVA tras descuentos. */
  total: number;
  /** URL absoluta de la miniatura (opcional). */
  thumbnail?: string | null;
};
