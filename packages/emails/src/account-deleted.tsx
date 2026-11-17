import { Layout, type EmailLinks } from "./_components/Layout";
import { Muted, Paragraph, Title } from "./_components/ui";

/**
 * Despedida tras eliminar la cuenta (fase 13): confirma la baja (RGPD, art. 17) al email que tenía
 * la cuenta. Sin enlaces a la cuenta (ya no existe).
 */
export type AccountDeletedProps = EmailLinks & {
  firstName: string | null;
};

export const subject = () => "Hemos eliminado tu cuenta";

export function AccountDeleted(props: AccountDeletedProps) {
  return (
    <Layout
      preview="Tu cuenta y tus datos personales se han eliminado."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>{props.firstName ? `Hasta pronto, ${props.firstName}` : "Hasta pronto"}</Title>
      <Paragraph>
        Hemos eliminado tu cuenta. Ya no puedes entrar con ella y hemos borrado tus datos
        personales, tus direcciones, las fichas de tus mascotas, tu lista de deseos y tus
        preferencias de comunicaciones. El saldo de puntos que tuvieras se ha perdido.
      </Paragraph>
      <Paragraph>
        Conservamos los datos de tus pedidos el tiempo que exige la normativa fiscal. Si quieres
        volver, puedes crear una cuenta nueva cuando quieras.
      </Paragraph>
      <Muted>Si no has sido tú, responde a este email o escríbenos desde la web.</Muted>
    </Layout>
  );
}

AccountDeleted.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  firstName: "Ana",
} satisfies AccountDeletedProps;

export default AccountDeleted;
