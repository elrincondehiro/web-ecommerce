import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Restablecer contraseña (subscriber `auth.password_reset`). Sirve para clientes (página del
 * storefront, fase 9) y para usuarios del Admin. El token de Medusa caduca a los 15 min.
 */
export type PasswordResetProps = EmailLinks & {
  resetUrl: string;
  /** Minutos de validez del enlace. */
  expiresInMinutes: number;
};

export const subject = () => "Restablece tu contraseña";

export function PasswordReset(props: PasswordResetProps) {
  return (
    <Layout
      preview="Enlace para crear una contraseña nueva."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Restablece tu contraseña</Title>
      <Paragraph>
        Hemos recibido una solicitud para cambiar la contraseña de tu cuenta. Pulsa el botón para
        crear una nueva. El enlace caduca en {props.expiresInMinutes} minutos y solo se puede usar
        una vez.
      </Paragraph>
      <CallToAction href={props.resetUrl}>Crear contraseña nueva</CallToAction>
      <Muted>
        Si no lo has pedido tú, ignora este email: tu contraseña no cambiará. No compartas este
        enlace con nadie.
      </Muted>
    </Layout>
  );
}

PasswordReset.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  resetUrl: "http://localhost:4321/cuenta/restablecer/?token=preview-token",
  expiresInMinutes: 15,
} satisfies PasswordResetProps;

export default PasswordReset;
