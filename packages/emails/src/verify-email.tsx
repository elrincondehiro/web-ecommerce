import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Confirmar el email al registrarse (subscriber `auth.verification_requested`). La cuenta queda
 * pendiente hasta que el cliente pulsa el enlace (`authVerificationsPerActor`, fase 9).
 */
export type VerifyEmailProps = EmailLinks & {
  verifyUrl: string;
  /** Minutos de validez del enlace. */
  expiresInMinutes: number;
};

export const subject = () => "Confirma tu email para activar tu cuenta";

export function VerifyEmail(props: VerifyEmailProps) {
  return (
    <Layout
      preview="Un paso más: confirma tu email para activar tu cuenta."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Confirma tu email</Title>
      <Paragraph>
        ¡Gracias por registrarte! Para activar tu cuenta, confirma que este email es tuyo. El enlace
        caduca en {props.expiresInMinutes} minutos; si caduca, inicia sesión y te enviaremos otro.
      </Paragraph>
      <CallToAction href={props.verifyUrl}>Confirmar mi email</CallToAction>
      <Muted>
        Consejo: si este email te ha llegado a la carpeta de spam, márcalo como «No es spam» para
        recibir bien los avisos de tus pedidos.
      </Muted>
      <Muted>Si no has creado una cuenta, ignora este email.</Muted>
    </Layout>
  );
}

VerifyEmail.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  verifyUrl: "http://localhost:4321/cuenta/verificar/?token=preview-token",
  expiresInMinutes: 15,
} satisfies VerifyEmailProps;

export default VerifyEmail;
