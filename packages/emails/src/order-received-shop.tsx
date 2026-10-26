import { Section } from "react-email";
import { AddressBlock, AmountRow, LineItems, SectionLabel } from "./_components/blocks";
import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";
import { formatDate, formatMoney } from "./_lib/format";
import type { EmailAddress, EmailLineItem } from "./_lib/types";

/**
 * Pedido nuevo (Fase M): email INTERNO para la tienda (`SHOP_NOTIFY_EMAIL`), para preparar el
 * pedido. Lleva los datos de contacto del cliente y sus mascotas (con la salud, si dio el
 * consentimiento): solo va al buzón de la tienda, nunca al cliente.
 */
export type ShopPet = {
  name: string;
  /** «Perro · Border collie · 5 años (aprox.) · 18,5 kg». */
  summary: string;
  diet?: string | null;
  health?: string | null;
};

export type OrderReceivedShopProps = EmailLinks & {
  displayId: number | string;
  createdAt: string;
  currencyCode: string;
  items: EmailLineItem[];
  total: number;
  shippingTotal: number;
  shippingMethod?: string | null;
  /** Código descuento o puntos usados, en una línea («Código HIRO10 · Puntos 2,00 €»). */
  discounts?: string | null;
  customerEmail: string;
  /** ¿Cliente con cuenta? (sin cuenta = invitado: no tiene mascotas guardadas). */
  hasAccount: boolean;
  shippingAddress?: EmailAddress | null;
  pets: ShopPet[];
  /** Método y estado del pago (Fase PG): «Bizum · cobrado», «Tarjeta · pendiente de capturar». */
  payment?: string | null;
  /** Ficha del pedido en el Admin. */
  adminOrderUrl?: string | null;
};

export const subject = (p: Pick<OrderReceivedShopProps, "displayId" | "total" | "currencyCode">) =>
  `Pedido nuevo n.º ${p.displayId} · ${formatMoney(p.total, p.currencyCode)}`;

export function OrderReceivedShop(props: OrderReceivedShopProps) {
  const c = props.currencyCode;
  const units = props.items.reduce((n, i) => n + (i.bulk ? 1 : i.quantity), 0);
  return (
    <Layout
      preview={`Pedido n.º ${props.displayId} · ${formatMoney(props.total, c)} · ${units} artículo(s)`}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Pedido nuevo n.º {props.displayId}</Title>
      <Paragraph>
        Recibido el {formatDate(props.createdAt)} de {props.customerEmail}
        {props.hasAccount ? " (con cuenta)" : " (sin cuenta)"}.
      </Paragraph>

      <SectionLabel>Artículos</SectionLabel>
      <LineItems items={props.items} currencyCode={c} />
      <Section style={{ marginTop: 12 }}>
        {props.discounts ? <AmountRow muted label="Descuentos" value={props.discounts} /> : null}
        <AmountRow
          label={props.shippingMethod ? `Envío (${props.shippingMethod})` : "Envío"}
          value={props.shippingTotal > 0 ? formatMoney(props.shippingTotal, c) : "Gratis"}
        />
        <AmountRow label="Total (IVA incluido)" value={formatMoney(props.total, c)} strong />
        {props.payment ? <AmountRow muted label="Pago" value={props.payment} /> : null}
      </Section>

      {props.shippingAddress ? (
        <>
          <SectionLabel>Enviar a</SectionLabel>
          <AddressBlock address={props.shippingAddress} />
        </>
      ) : null}

      {props.pets.length > 0 ? (
        <>
          <SectionLabel>Sus peques</SectionLabel>
          {props.pets.map((pet, i) => (
            <Paragraph key={i}>
              <strong>{pet.name}</strong>: {pet.summary}
              {pet.diet ? (
                <>
                  <br />
                  Come: {pet.diet}
                </>
              ) : null}
              {pet.health ? (
                <>
                  <br />
                  Salud: {pet.health}
                </>
              ) : null}
            </Paragraph>
          ))}
        </>
      ) : null}

      {props.adminOrderUrl ? (
        <CallToAction href={props.adminOrderUrl}>Abrir el pedido en el Admin</CallToAction>
      ) : null}
      <Muted>
        Aviso interno de la tienda. Contiene datos personales del cliente: no lo reenvíes fuera.
      </Muted>
    </Layout>
  );
}

OrderReceivedShop.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  displayId: 1042,
  createdAt: "2026-10-24T10:30:00.000Z",
  currencyCode: "eur",
  items: [
    {
      title: "Collar de cuero trenzado",
      variant: "M / Azul",
      quantity: 1,
      unitPrice: 24.9,
      total: 24.9,
    },
    {
      title: "Alas de pollo deshidratadas",
      variant: null,
      quantity: 50,
      unitPrice: 0.1,
      total: 5,
      bulk: { grams: 250, pricePerKg: 20 },
    },
  ],
  total: 34.85,
  shippingTotal: 4.95,
  shippingMethod: "Envío estándar",
  discounts: null,
  customerEmail: "lucia@example.com",
  hasAccount: true,
  shippingAddress: {
    name: "Lucía Martín",
    address1: "Calle Mayor 1",
    address2: "2.º B",
    postalCode: "28013",
    city: "Madrid",
    province: "Madrid",
    country: "España",
    phone: "+34 600 123 456",
  },
  pets: [
    {
      name: "Hiro",
      summary: "Perro · Border collie · 5 años (aprox.) · 18,5 kg",
      diet: "Pienso de salmón",
      health: "Alergia al pollo",
    },
    { name: "Nube", summary: "Gato · Común europeo · 2 años (aprox.)" },
  ],
  adminOrderUrl: "http://localhost:9000/app/orders/order_01PREVIEW",
  payment: "Tarjeta · pendiente de capturar",
} satisfies OrderReceivedShopProps;

export default OrderReceivedShop;
