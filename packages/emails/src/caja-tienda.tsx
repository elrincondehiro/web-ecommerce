import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";

/**
 * Aviso INTERNO de la caja de snacks (Fase CS-4) para `SHOP_NOTIFY_EMAIL`:
 * - `rechazada`: el cliente ha dicho «No me convence» (con su motivo): rehacerla y proponerla.
 * - `aceptada_auto`: 24 h sin respuesta, se da por buena.
 * - `sin_preparar`: 48 h laborables sin prepararla (desde el pedido o el rechazo).
 * - `aceptada`: el cliente la ha aceptado (y, si es la última, el pedido se puede enviar).
 * El motivo es texto libre del cliente: solo va al buzón de la tienda.
 */
export type CajaTiendaProps = EmailLinks & {
  kind: "rechazada" | "aceptada" | "aceptada_auto" | "sin_preparar";
  displayId: number | string;
  /** «Toby». */
  name: string;
  motivo?: string | null;
  /** ¿Están ya todas las cajas del pedido aceptadas? (se puede enviar). */
  readyToShip?: boolean;
  adminOrderUrl?: string | null;
};

const TITLES: Record<CajaTiendaProps["kind"], string> = {
  rechazada: "Caja rechazada: hay que rehacerla",
  aceptada: "Caja aceptada",
  aceptada_auto: "Caja aceptada automáticamente (24 h)",
  sin_preparar: "Caja sin preparar (48 h laborables)",
};

export const subject = (p: CajaTiendaProps) =>
  `${TITLES[p.kind]} · pedido n.º ${p.displayId} · ${p.name}`;

export function CajaTienda(props: CajaTiendaProps) {
  return (
    <Layout
      preview={subject(props)}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>{TITLES[props.kind]}</Title>
      <Paragraph>
        Pedido <strong>n.º {props.displayId}</strong>, caja para <strong>{props.name}</strong>.
      </Paragraph>
      {props.kind === "rechazada" ? (
        <>
          <Paragraph>Lo que nos dice el cliente:</Paragraph>
          <Paragraph>
            <em>«{props.motivo ?? ""}»</em>
          </Paragraph>
          <Paragraph>
            Cambia el contenido en el Admin y vuelve a pulsar «Proponer al cliente».
          </Paragraph>
        </>
      ) : null}
      {props.kind === "sin_preparar" ? (
        <Paragraph>Lleva 48 horas laborables esperando a que la preparemos.</Paragraph>
      ) : null}
      {props.readyToShip ? (
        <Paragraph>
          <strong>Todas las cajas del pedido están aceptadas: ya se puede enviar.</strong>
        </Paragraph>
      ) : null}
      {props.adminOrderUrl ? (
        <CallToAction href={props.adminOrderUrl}>Abrir el pedido en el Admin</CallToAction>
      ) : null}
      <Muted>Aviso automático de la tienda online.</Muted>
    </Layout>
  );
}

CajaTienda.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  kind: "rechazada",
  displayId: 1042,
  name: "Toby",
  motivo: "No le gustan las orejas: le sientan mal. Mejor algo de pescado.",
  adminOrderUrl: "http://localhost:9000/app/orders/order_preview",
} satisfies CajaTiendaProps;

export default CajaTienda;
