import { Layout, type EmailLinks } from "./_components/Layout";
import { Muted, Paragraph, Title } from "./_components/ui";

/**
 * Aviso al email ANTIGUO de que el email de la cuenta ha cambiado (fase 13). Enmascara el nuevo:
 * si alguien ha entrado en la cuenta, el aviso no le da más datos.
 */
export type EmailChangedProps = EmailLinks & {
  firstName: string | null;
  /** Email nuevo enmascarado (`a***@example.com`). */
  newEmail: string;
};

export const subject = () => "El email de tu cuenta ha cambiado";

export function EmailChanged(props: EmailChangedProps) {
  return (
    <Layout
      preview="Tu cuenta ya usa otro email."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>{props.firstName ? `Hola, ${props.firstName}` : "Hola"}</Title>
      <Paragraph>
        El email de tu cuenta ha cambiado a {props.newEmail}. A partir de ahora entrarás con él y
        los avisos de tus pedidos en curso irán allí. Este email ya no sirve para entrar.
      </Paragraph>
      <Muted>
        Si no has sido tú, escríbenos cuanto antes desde la web para que revisemos tu cuenta.
      </Muted>
    </Layout>
  );
}

EmailChanged.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  firstName: "Ana",
  newEmail: "a***@example.com",
} satisfies EmailChangedProps;

export default EmailChanged;
