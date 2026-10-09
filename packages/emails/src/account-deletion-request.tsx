import { Layout, type EmailLinks } from "./_components/Layout";
import { Muted, Paragraph, Title } from "./_components/ui";

/**
 * Solicitud de baja de un cliente (fase 9). Email INTERNO para la tienda (`SHOP_NOTIFY_EMAIL`):
 * la baja se tramita a mano desde el Admin (RGPD, art. 17). Lleva solo el id y el email del
 * cliente, lo mínimo para localizarlo.
 */
export type AccountDeletionRequestProps = EmailLinks & {
  customerId: string;
  customerEmail: string;
  /** Fecha de la solicitud (ISO 8601). */
  requestedAt: string;
  /** Motivo opcional que escribe el cliente (texto plano, máx. 500). */
  reason: string | null;
};

export const subject = (p: AccountDeletionRequestProps) =>
  `Solicitud de baja de cuenta: ${p.customerEmail}`;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));

export function AccountDeletionRequest(props: AccountDeletionRequestProps) {
  return (
    <Layout
      preview={`Un cliente pide eliminar su cuenta (${props.customerEmail}).`}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Solicitud de baja de cuenta</Title>
      <Paragraph>
        El cliente {props.customerEmail} (id {props.customerId}) ha pedido eliminar su cuenta el{" "}
        {formatDate(props.requestedAt)}.
      </Paragraph>
      {props.reason ? <Paragraph>Motivo: {props.reason}</Paragraph> : null}
      <Muted>
        Tienes un mes para atenderla (RGPD, art. 12.3). Elimina el cliente desde el Admin de Medusa
        y confírmale la baja por email. Conserva los pedidos el tiempo que exija la normativa
        fiscal.
      </Muted>
    </Layout>
  );
}

AccountDeletionRequest.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  customerId: "cus_01PREVIEW",
  customerEmail: "ana@example.com",
  requestedAt: "2026-10-09T10:30:00.000Z",
  reason: "Ya no voy a comprar más.",
} satisfies AccountDeletionRequestProps;

export default AccountDeletionRequest;
