import { Section } from "react-email";
import { AddressBlock, AmountRow, LineItems, SectionLabel } from "./_components/blocks";
import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";
import { formatDate, formatMoney, formatRate } from "./_lib/format";
import type { TaxBreakdownRow } from "./_lib/tax";
import type { EmailAddress, EmailLineItem } from "./_lib/types";

/** Confirmación de pedido (subscriber `order.placed`). Importes con IVA incluido. */
export type OrderPlacedProps = EmailLinks & {
  displayId: number | string;
  createdAt: string;
  customerName?: string | null;
  currencyCode: string;
  items: EmailLineItem[];
  /** Suma de productos con IVA, tras descuentos. */
  itemTotal: number;
  shippingTotal: number;
  shippingMethod?: string | null;
  discountTotal: number;
  total: number;
  taxTotal: number;
  /** IVA agrupado por tipo (`buildTaxBreakdown`). */
  taxBreakdown: TaxBreakdownRow[];
  shippingAddress?: EmailAddress | null;
  /** Página del pedido en el storefront (opcional). */
  orderUrl?: string | null;
};

export const subject = (p: Pick<OrderPlacedProps, "displayId">) =>
  `Hemos recibido tu pedido n.º ${p.displayId}`;

export function OrderPlaced(props: OrderPlacedProps) {
  const c = props.currencyCode;
  return (
    <Layout
      preview={`Gracias por tu compra. Pedido n.º ${props.displayId} · ${formatMoney(props.total, c)}`}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>¡Gracias por tu pedido!</Title>
      <Paragraph>
        {props.customerName ? `Hola, ${props.customerName}. ` : "Hola. "}
        Hemos recibido tu pedido <strong>n.º {props.displayId}</strong> del{" "}
        {formatDate(props.createdAt)}. Te avisaremos por email cuando salga hacia tu casa.
      </Paragraph>

      <SectionLabel>Resumen</SectionLabel>
      <LineItems items={props.items} currencyCode={c} />

      <Section style={{ marginTop: 12 }}>
        <AmountRow label="Productos" value={formatMoney(props.itemTotal, c)} />
        {props.discountTotal > 0 ? (
          <AmountRow label="Descuentos" value={`−${formatMoney(props.discountTotal, c)}`} />
        ) : null}
        <AmountRow
          label={props.shippingMethod ? `Envío (${props.shippingMethod})` : "Envío"}
          value={props.shippingTotal > 0 ? formatMoney(props.shippingTotal, c) : "Gratis"}
        />
        <AmountRow label="Total (IVA incluido)" value={formatMoney(props.total, c)} strong />
        {props.taxBreakdown.map((row) => (
          <AmountRow
            key={row.rate}
            muted
            label={`IVA ${formatRate(row.rate)} sobre ${formatMoney(row.base, c)}`}
            value={formatMoney(row.tax, c)}
          />
        ))}
        {props.taxBreakdown.length > 1 ? (
          <AmountRow muted label="Total IVA" value={formatMoney(props.taxTotal, c)} />
        ) : null}
      </Section>

      {props.shippingAddress ? (
        <>
          <SectionLabel>Dirección de envío</SectionLabel>
          <AddressBlock address={props.shippingAddress} />
        </>
      ) : null}

      {props.orderUrl ? <CallToAction href={props.orderUrl}>Ver mi pedido</CallToAction> : null}

      <Muted>
        Este email no es una factura. Si necesitas factura, solicítala indicando el número de
        pedido.
      </Muted>
    </Layout>
  );
}

OrderPlaced.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  displayId: 1042,
  createdAt: "2026-10-09T10:30:00.000Z",
  customerName: "Lucía",
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
      title: "Libro: Adiestramiento en positivo",
      variant: null,
      quantity: 2,
      unitPrice: 15.6,
      total: 31.2,
    },
  ],
  itemTotal: 56.1,
  shippingTotal: 4.95,
  shippingMethod: "Estándar",
  discountTotal: 0,
  total: 61.05,
  taxTotal: 6.34,
  taxBreakdown: [
    { rate: 21, base: 24.67, tax: 5.18 },
    { rate: 4, base: 30, tax: 1.2 },
  ],
  shippingAddress: {
    name: "Lucía Martínez",
    address1: "Calle Mayor 12, 3.º B",
    postalCode: "28013",
    city: "Madrid",
    province: "Madrid",
    country: "España",
  },
  orderUrl: "http://localhost:4321/pedido/order_01PREVIEW/",
} satisfies OrderPlacedProps;

export default OrderPlaced;
