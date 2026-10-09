import { Column, Img, Row, Section, Text } from "react-email";
import { formatMoney } from "../_lib/format";
import { color } from "../_lib/theme";
import type { EmailAddress, EmailLineItem } from "../_lib/types";

const label = {
  color: color.mutedForeground,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  margin: "24px 0 8px",
  textTransform: "uppercase" as const,
};

export function SectionLabel({ children }: { children: string }) {
  return <Text style={label}>{children}</Text>;
}

/** Líneas del pedido. `showPrices = false` en el email de envío (solo qué se envía). */
export function LineItems({
  items,
  currencyCode,
  showPrices = true,
}: {
  items: EmailLineItem[];
  currencyCode: string;
  showPrices?: boolean;
}) {
  return (
    <Section>
      {items.map((item, i) => (
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
            <Text style={{ color: color.foreground, fontSize: 14, fontWeight: 600, margin: 0 }}>
              {item.title}
            </Text>
            <Text style={{ color: color.mutedForeground, fontSize: 13, margin: "2px 0 0" }}>
              {item.variant ? `${item.variant} · ` : ""}
              {item.quantity} × {showPrices ? formatMoney(item.unitPrice, currencyCode) : "ud."}
            </Text>
          </Column>
          {showPrices ? (
            <Column style={{ textAlign: "right", verticalAlign: "top", width: 100 }}>
              <Text style={{ color: color.foreground, fontSize: 14, margin: 0 }}>
                {formatMoney(item.total, currencyCode)}
              </Text>
            </Column>
          ) : null}
        </Row>
      ))}
    </Section>
  );
}

export function AddressBlock({ address }: { address: EmailAddress }) {
  const line = { color: color.foreground, fontSize: 14, lineHeight: "20px", margin: 0 };
  return (
    <Section>
      <Text style={line}>{address.name}</Text>
      <Text style={line}>{address.address1}</Text>
      {address.address2 ? <Text style={line}>{address.address2}</Text> : null}
      <Text style={line}>
        {address.postalCode} {address.city}
        {address.province ? ` (${address.province})` : ""}
      </Text>
      <Text style={line}>{address.country}</Text>
    </Section>
  );
}

/** Fila de importe: etiqueta a la izquierda, valor a la derecha. */
export function AmountRow({
  label: text,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  const style = {
    color: muted ? color.mutedForeground : color.foreground,
    fontSize: strong ? 16 : muted ? 13 : 14,
    fontWeight: strong ? 700 : 400,
    margin: "4px 0",
  };
  return (
    <Row>
      <Column>
        <Text style={style}>{text}</Text>
      </Column>
      <Column style={{ textAlign: "right" }}>
        <Text style={style}>{value}</Text>
      </Column>
    </Row>
  );
}
