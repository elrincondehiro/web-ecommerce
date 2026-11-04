import { Section, Text } from "react-email";
import { SectionLabel } from "./_components/blocks";
import { Layout, type EmailLinks } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";
import { color } from "./_lib/theme";

/**
 * Caja de snacks propuesta (Fase CS-4): una sección por caja con su contenido (sin precios: ya
 * está pagada) y el enlace «Ver y responder» (de un solo uso, también para invitados). Si no
 * responde antes del plazo, la damos por buena (aceptación automática a las 24 h).
 */
export type CajaPropuestaItem = {
  /** «Toby». */
  name: string;
  /** «Caja de snacks · 25 €». */
  title: string;
  /** «3 × Orejas de cerdo», «150 g · Premios de pollo». */
  content: string[];
  url: string;
};

export type CajaPropuestaProps = EmailLinks & {
  displayId: number | string;
  customerName?: string | null;
  cajas: CajaPropuestaItem[];
  /** «el martes 4 de noviembre a las 18:30». */
  deadline: string;
};

export const subject = (p: CajaPropuestaProps) =>
  p.cajas.length === 1
    ? `Tu caja de snacks para ${p.cajas[0]!.name} está lista: ¿te convence?`
    : `Tus ${p.cajas.length} cajas de snacks están listas: ¿te convencen?`;

const box = {
  backgroundColor: color.secondary,
  borderRadius: 8,
  margin: "16px 0",
  padding: "4px 16px 16px",
};
const line = { color: color.foreground, fontSize: 14, margin: "4px 0" };

export function CajaPropuesta(props: CajaPropuestaProps) {
  const hello = props.customerName ? `Hola, ${props.customerName}. ` : "Hola. ";
  const many = props.cajas.length > 1;
  return (
    <Layout
      preview={subject(props)}
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
    >
      <Title>{many ? "Tus cajas de snacks están listas" : "Tu caja de snacks está lista"}</Title>
      <Paragraph>
        {hello}Hemos preparado {many ? "las cajas" : "la caja"} del pedido{" "}
        <strong>n.º {props.displayId}</strong>. Échale un vistazo y dinos si te convence; si algo no
        le va a gustar, la cambiamos.
      </Paragraph>
      {props.cajas.map((c, i) => (
        <Section key={i} style={box}>
          <SectionLabel>{`Para ${c.name}`}</SectionLabel>
          <Text style={{ ...line, color: color.mutedForeground }}>{c.title}</Text>
          {c.content.map((l, k) => (
            <Text key={k} style={line}>
              {l}
            </Text>
          ))}
          <CallToAction href={c.url}>Ver y responder</CallToAction>
        </Section>
      ))}
      <Paragraph>
        Si no nos dices nada antes de <strong>{props.deadline}</strong>, daremos{" "}
        {many ? "las cajas" : "la caja"} por buena{many ? "s" : ""} y te la
        {many ? "s" : ""} enviaremos.
      </Paragraph>
      <Muted>
        Cada enlace es personal y vale una vez: no lo reenvíes. Si tienes cualquier duda, contesta a
        este email.
      </Muted>
    </Layout>
  );
}

CajaPropuesta.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  displayId: 1042,
  customerName: "Ana",
  deadline: "el martes 4 de noviembre a las 18:30",
  cajas: [
    {
      name: "Toby",
      title: "Caja de snacks · 25 €",
      content: ["3 × Orejas de cerdo", "150 g · Premios de pollo", "1 × Hueso de búfalo"],
      url: "http://localhost:4321/cuenta/caja/?pedido=order_preview&caja=ordli_preview&token=preview",
    },
  ],
} satisfies CajaPropuestaProps;

export default CajaPropuesta;
