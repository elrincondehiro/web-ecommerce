import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Bienvenida (fase 9): se envía cuando se crea el cliente con cuenta (`customer.created` con
 * `has_account`), es decir, tras verificar el email e iniciar sesión por primera vez.
 */
export type WelcomeProps = EmailLinks & {
  /** Enlace a "Mi cuenta" (`<storefront>/cuenta/`). */
  accountUrl: string;
};

export const subject = () => "¡Bienvenido a El Rincón de Hiro!";

export function Welcome(props: WelcomeProps) {
  return (
    <Layout
      preview="Tu cuenta ya está activa. Te contamos qué puedes hacer con ella."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>¡Bienvenido a la familia!</Title>
      <Paragraph>
        Tu cuenta ya está activa. Desde «Mi cuenta» puedes guardar tus direcciones para comprar más
        rápido, completar tus datos y consultar tus pedidos cuando quieras.
      </Paragraph>
      <CallToAction href={props.accountUrl}>Ir a mi cuenta</CallToAction>
      <Muted>Si no has creado tú esta cuenta, escríbenos desde la web y la eliminaremos.</Muted>
    </Layout>
  );
}

Welcome.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  accountUrl: "http://localhost:4321/cuenta/",
} satisfies WelcomeProps;

export default Welcome;
