import { Column, Img, Link, Row, Section, Text } from "react-email";
import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";
import { color } from "./_lib/theme";

/**
 * Ha vuelto lo que esperabas (Fase MK-B): un email por cliente con todo lo que ha vuelto desde la
 * última pasada. Lo pidió el cliente con «Avísame cuando vuelva» (solo con cuenta); se envía una
 * vez y el aviso se borra. «Puede agotarse pronto» si lo repuesto no llega para todos los que lo
 * esperaban. No lleva pie de baja de comunicaciones (es lo que pidió, no publicidad; ver
 * docs/fases/faseMK-marketing.md §2).
 */
export type StockBackItem = {
  title: string;
  variant: string | null;
  url: string;
  /** Miniatura con URL absoluta (JPG/PNG), o null. */
  thumbnail: string | null;
  mayRunOut: boolean;
};

export type StockBackProps = EmailLinks & {
  items: StockBackItem[];
  /** «Mis avisos» de la cuenta. */
  alertsUrl: string;
};

export const subject = (p: StockBackProps) =>
  p.items.length === 1
    ? `Ha vuelto: ${p.items[0]!.title}`
    : `Han vuelto ${p.items.length} productos que esperabas`;

export function StockBack(props: StockBackProps) {
  const one = props.items.length === 1;
  return (
    <Layout
      preview={one ? "Ya puedes comprarlo de nuevo." : "Ya puedes comprarlos de nuevo."}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>{one ? "¡Ha vuelto!" : "¡Han vuelto!"}</Title>
      <Paragraph>
        {one
          ? "Nos pediste que te avisáramos cuando volviera a haber stock de este producto:"
          : "Nos pediste que te avisáramos cuando volviera a haber stock de estos productos:"}
      </Paragraph>
      <Section>
        {props.items.map((item, i) => (
          <Row key={i} style={{ borderBottom: `1px solid ${color.border}`, padding: "10px 0" }}>
            {item.thumbnail ? (
              <Column style={{ width: 64, verticalAlign: "top", paddingRight: 12 }}>
                <Img
                  src={item.thumbnail}
                  alt=""
                  width={56}
                  height={56}
                  style={{ borderRadius: 6, objectFit: "cover" }}
                />
              </Column>
            ) : null}
            <Column style={{ verticalAlign: "top" }}>
              <Text style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                <Link href={item.url} style={{ color: color.foreground }}>
                  {item.title}
                </Link>
              </Text>
              {item.variant ? (
                <Text style={{ color: color.mutedForeground, fontSize: 13, margin: "2px 0 0" }}>
                  {item.variant}
                </Text>
              ) : null}
              {item.mayRunOut ? (
                <Text style={{ color: color.primary, fontSize: 13, margin: "2px 0 0" }}>
                  Hay pocas unidades para todos los que lo esperaban: puede agotarse pronto.
                </Text>
              ) : null}
            </Column>
          </Row>
        ))}
      </Section>
      {one && <CallToAction href={props.items[0]!.url}>Ver el producto</CallToAction>}
      <Muted>
        Este aviso se envía una sola vez y ya lo hemos quitado de{" "}
        <Link href={props.alertsUrl} style={{ color: color.mutedForeground }}>
          tus avisos de stock
        </Link>
        . Si vuelve a agotarse, puedes pedirlo otra vez desde la ficha.
      </Muted>
    </Layout>
  );
}

StockBack.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  alertsUrl: "http://localhost:4321/cuenta/avisos/",
  items: [
    {
      title: "Arnés acolchado",
      variant: "Rayas / M",
      url: "http://localhost:4321/producto/prueba-arnes-estampado/",
      thumbnail: null,
      mayRunOut: true,
    },
    {
      title: "Premios de pollo",
      variant: null,
      url: "http://localhost:4321/producto/premios-pollo/",
      thumbnail: null,
      mayRunOut: false,
    },
  ],
} satisfies StockBackProps;

export default StockBack;
