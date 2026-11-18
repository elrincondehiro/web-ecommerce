import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Confirmar el email NUEVO de una cuenta (fase 13): lo pide el cliente en «Mis datos». El cambio
 * se hace al pulsar el botón de la página del enlace (un solo uso, caduca).
 */
export type EmailChangeProps = EmailLinks & {
  confirmUrl: string;
  /** Horas de validez del enlace. */
  expiresInHours: number;
};

export const subject = () => "Confirma tu nuevo email";

export function EmailChange(props: EmailChangeProps) {
  return (
    <Layout
      preview="Confirma que quieres usar este email en tu cuenta."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Confirma tu nuevo email</Title>
      <Paragraph>
        Has pedido usar este email en tu cuenta. Cuando lo confirmes, entrarás con él y te
        enviaremos aquí los avisos de tus pedidos en curso. El enlace caduca en{" "}
        {props.expiresInHours} horas y solo sirve una vez.
      </Paragraph>
      <CallToAction href={props.confirmUrl}>Confirmar mi nuevo email</CallToAction>
      <Muted>Si no lo has pedido tú, ignora este email: tu cuenta no cambia.</Muted>
    </Layout>
  );
}

EmailChange.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  confirmUrl: "http://localhost:4321/cuenta/email/?token=preview-token",
  expiresInHours: 24,
} satisfies EmailChangeProps;

export default EmailChange;
