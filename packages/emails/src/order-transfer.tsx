import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Solicitud para añadir un pedido hecho sin cuenta a una cuenta (Fase G-2). Va al email del
 * PEDIDO (no al de la cuenta que lo pide): quien lo recibe demuestra que es suyo al aceptar.
 * También la usa «Transfer ownership» del Admin. El email de la cuenta va enmascarado.
 */
export type OrderTransferProps = EmailLinks & {
  displayId: number | string;
  /** Email de la cuenta que lo pide, enmascarado («j***@gmail.com»). */
  requestedBy: string;
  transferUrl: string;
  /** Días que tiene para responder (después la solicitud caduca). */
  expiresInDays: number;
};

export const subject = (p: OrderTransferProps) =>
  `¿Añadir el pedido n.º ${p.displayId} a tu cuenta?`;

export function OrderTransfer(props: OrderTransferProps) {
  return (
    <Layout
      preview={`Confirma si quieres añadir el pedido n.º ${props.displayId} a una cuenta.`}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>¿Añadir tu pedido a una cuenta?</Title>
      <Paragraph>
        La cuenta {props.requestedBy} ha pedido añadir el pedido n.º {props.displayId}, que se hizo
        sin iniciar sesión con este email. Si la cuenta es tuya, acéptalo: verás el pedido en «Mis
        pedidos» y los avisos del envío te llegarán al email de la cuenta.
      </Paragraph>
      <CallToAction href={props.transferUrl}>Revisar la solicitud</CallToAction>
      <Muted>
        Tienes {props.expiresInDays} días para responder. Si no lo has pedido tú, rechaza la
        solicitud o ignora este email: el pedido no cambiará.
      </Muted>
    </Layout>
  );
}

OrderTransfer.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  displayId: 1042,
  requestedBy: "a***@example.com",
  transferUrl: "http://localhost:4321/cuenta/transferir/?pedido=order_preview&token=preview",
  expiresInDays: 7,
} satisfies OrderTransferProps;

export default OrderTransfer;
