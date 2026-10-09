import { AddressBlock, LineItems, SectionLabel } from "./_components/blocks";
import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Paragraph, Title } from "./_components/ui";
import type { EmailAddress, EmailLineItem } from "./_lib/types";

export type TrackingInfo = {
  number: string;
  /** Enlace de seguimiento del transportista (opcional). */
  url?: string | null;
};

/** Pedido enviado (subscriber `shipment.created`). Solo lo que va en este envío. */
export type OrderShippedProps = EmailLinks & {
  displayId: number | string;
  customerName?: string | null;
  currencyCode: string;
  items: EmailLineItem[];
  tracking: TrackingInfo[];
  shippingAddress?: EmailAddress | null;
};

export const subject = (p: Pick<OrderShippedProps, "displayId">) =>
  `Tu pedido n.º ${p.displayId} está en camino`;

export function OrderShipped(props: OrderShippedProps) {
  const withUrl = props.tracking.find((t) => t.url);
  return (
    <Layout
      preview={`Tu pedido n.º ${props.displayId} ya ha salido.`}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Tu pedido está en camino</Title>
      <Paragraph>
        {props.customerName ? `Hola, ${props.customerName}. ` : "Hola. "}
        Hemos enviado {props.items.length > 1 ? "estos productos" : "este producto"} de tu pedido{" "}
        <strong>n.º {props.displayId}</strong>.
      </Paragraph>

      {props.tracking.length > 0 ? (
        <>
          <SectionLabel>Seguimiento</SectionLabel>
          {props.tracking.map((t) => (
            <Paragraph key={t.number}>
              Número de seguimiento: <strong>{t.number}</strong>
            </Paragraph>
          ))}
          {withUrl?.url ? <CallToAction href={withUrl.url}>Seguir mi envío</CallToAction> : null}
        </>
      ) : null}

      <SectionLabel>En este envío</SectionLabel>
      <LineItems items={props.items} currencyCode={props.currencyCode} showPrices={false} />

      {props.shippingAddress ? (
        <>
          <SectionLabel>Dirección de entrega</SectionLabel>
          <AddressBlock address={props.shippingAddress} />
        </>
      ) : null}
    </Layout>
  );
}

OrderShipped.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  displayId: 1042,
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
  ],
  tracking: [{ number: "PK123456789ES", url: "https://www.correos.es/" }],
  shippingAddress: {
    name: "Lucía Martínez",
    address1: "Calle Mayor 12, 3.º B",
    postalCode: "28013",
    city: "Madrid",
    province: "Madrid",
    country: "España",
  },
} satisfies OrderShippedProps;

export default OrderShipped;
