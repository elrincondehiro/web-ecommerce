import { Layout, type EmailLinks } from "./_components/Layout";
import { TransferBox, type TransferInfo } from "./_components/transfer";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Transferencia pendiente (Fase PG-3), del job diario `transfer-orders`:
 * - `remind`: el último día para pagar, recordatorio con los datos.
 * - `canceled`: al día siguiente, el pedido se ha cancelado por no recibirla.
 */
export type TransferReminderProps = EmailLinks & {
  kind: "remind" | "canceled";
  displayId: number | string;
  customerName?: string | null;
  transfer: TransferInfo;
  orderUrl?: string | null;
};

export const subject = (p: TransferReminderProps) =>
  p.kind === "remind"
    ? `Hoy es el último día para pagar el pedido n.º ${p.displayId}`
    : `Hemos cancelado el pedido n.º ${p.displayId}`;

export function TransferReminder(props: TransferReminderProps) {
  const hello = props.customerName ? `Hola, ${props.customerName}. ` : "Hola. ";
  return (
    <Layout
      preview={subject(props)}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      {props.kind === "remind" ? (
        <>
          <Title>Tu pedido espera la transferencia</Title>
          <Paragraph>
            {hello}Aún no hemos recibido la transferencia del pedido{" "}
            <strong>n.º {props.displayId}</strong>. Hoy es el último día para hacerla. Si ya la has
            hecho, no tienes que hacer nada: puede tardar un día en llegar.
          </Paragraph>
          <TransferBox transfer={props.transfer} />
        </>
      ) : (
        <>
          <Title>Pedido cancelado</Title>
          <Paragraph>
            {hello}No hemos recibido la transferencia del pedido{" "}
            <strong>n.º {props.displayId}</strong> ({props.transfer.amount}) a tiempo, así que lo
            hemos cancelado. Si la has hecho, contesta a este email y lo revisamos: te devolveremos
            el dinero o, si lo prefieres, prepararemos el pedido.
          </Paragraph>
        </>
      )}
      {props.orderUrl ? <CallToAction href={props.orderUrl}>Ver mi pedido</CallToAction> : null}
      <Muted>Si tienes cualquier duda, contesta a este email.</Muted>
    </Layout>
  );
}

TransferReminder.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  kind: "remind",
  displayId: 1042,
  customerName: "Ana",
  transfer: {
    iban: "ES91 2100 0418 4502 0005 1332",
    holder: "El Rincón de Hiro",
    concept: "Pedido 1042",
    amount: "44,95 €",
    lastDay: "28 de octubre de 2026",
  },
  orderUrl: "http://localhost:4321/cuenta/pedidos/order_01PREVIEW/",
} satisfies TransferReminderProps;

export default TransferReminder;
