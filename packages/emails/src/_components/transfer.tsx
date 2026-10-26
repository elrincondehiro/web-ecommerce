import { Section } from "react-email";
import { AmountRow } from "./blocks";
import { Paragraph } from "./ui";
import { color } from "../_lib/theme";

/** Datos para pagar un pedido por transferencia (Fase PG-3). */
export type TransferInfo = {
  /** IBAN en grupos de 4. */
  iban: string;
  holder: string;
  /** «Pedido 1042». */
  concept: string;
  /** Importe ya formateado («44,95 €»). */
  amount: string;
  /** Último día para pagar («28 de octubre de 2026»). */
  lastDay: string;
};

/** Recuadro con los datos de la transferencia (email del pedido y recordatorio). */
export function TransferBox({ transfer }: { transfer: TransferInfo }) {
  return (
    <Section
      style={{
        border: `2px solid ${color.border}`,
        borderRadius: 8,
        padding: "8px 16px",
        margin: "16px 0",
      }}
    >
      <Paragraph>
        Haz la transferencia antes del <strong>{transfer.lastDay}</strong> (incluido). Si no la
        recibimos, el pedido se cancelará.
      </Paragraph>
      <AmountRow label="Importe" value={transfer.amount} strong />
      <AmountRow label="IBAN" value={transfer.iban} />
      <AmountRow label="Titular" value={transfer.holder} />
      <AmountRow label="Concepto" value={transfer.concept} />
    </Section>
  );
}
