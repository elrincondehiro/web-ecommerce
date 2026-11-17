import { Layout, type EmailLinks } from "./_components/Layout";
import { Muted, Paragraph, Title } from "./_components/ui";

/**
 * Baja de una cuenta (fase 13). Email INTERNO para la tienda (`SHOP_NOTIFY_EMAIL`): la cuenta ya
 * está eliminada (ficha anonimizada, sin acceso). Solo el id del cliente (su email ya no existe),
 * la fecha, desde dónde se hizo y el motivo opcional.
 */
export type AccountDeletedShopProps = EmailLinks & {
  customerId: string;
  /** Fecha de la baja (ISO 8601). */
  deletedAt: string;
  /** Motivo opcional que escribe el cliente (texto plano, máx. 500). */
  reason: string | null;
  via: "cuenta" | "admin";
};

export const subject = () => "Un cliente ha eliminado su cuenta";

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));

export function AccountDeletedShop(props: AccountDeletedShopProps) {
  return (
    <Layout
      preview="Una cuenta de cliente se ha eliminado."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>Cuenta eliminada</Title>
      <Paragraph>
        {props.via === "admin"
          ? "Se ha eliminado desde el Admin"
          : "El cliente ha eliminado su cuenta desde «Mi cuenta»"}{" "}
        el {formatDate(props.deletedAt)} (id {props.customerId}).
      </Paragraph>
      {props.reason ? <Paragraph>Motivo: {props.reason}</Paragraph> : null}
      <Muted>
        No hay que hacer nada: sus datos personales, direcciones, mascotas, lista de deseos y
        preferencias ya están borrados y el saldo de puntos se ha dado de baja. Sus pedidos se
        conservan por la normativa fiscal.
      </Muted>
    </Layout>
  );
}

AccountDeletedShop.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  customerId: "cus_01PREVIEW",
  deletedAt: "2026-11-17T10:30:00.000Z",
  reason: "Ya no voy a comprar más.",
  via: "cuenta",
} satisfies AccountDeletedShopProps;

export default AccountDeletedShop;
