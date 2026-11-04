import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "react-email";
import { color, fontFamily, STORE_NAME } from "../_lib/theme";

/** URLs públicas que necesitan todas las plantillas (las pone el backend). */
export type EmailLinks = {
  /** URL pública del storefront, sin barra final (enlaces). */
  storefrontUrl: string;
  /** Origen público de los recursos de email (logo en `/email/logo.png`), sin barra final. */
  assetsUrl: string;
};

/**
 * Emails comerciales (Fase MK-A): por qué le llega y el enlace de baja de un clic (página
 * `/baja/` del storefront). Solo los emails comerciales lo llevan; los de pedido, no.
 */
export type EmailUnsubscribe = {
  /** URL de `/baja/?t=…` (la firma el backend). */
  url: string;
  /** Tema activado, p. ej. «Novedades y ofertas». */
  topic: string;
};

type LayoutProps = EmailLinks & {
  /** Texto de previsualización en la bandeja de entrada. */
  preview: string;
  /** Solo emails comerciales: pie con el motivo y la baja. */
  unsubscribe?: EmailUnsubscribe | undefined;
  children: ReactNode;
};

export function Layout({ preview, storefrontUrl, assetsUrl, unsubscribe, children }: LayoutProps) {
  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: color.background, fontFamily, margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: color.card,
            border: `1px solid ${color.border}`,
            borderRadius: 12,
            maxWidth: 600,
            padding: "32px 28px",
          }}
        >
          <Section style={{ textAlign: "center", marginBottom: 8 }}>
            <Link href={storefrontUrl}>
              <Img
                src={`${assetsUrl}/email/logo.png`}
                alt={STORE_NAME}
                width={120}
                height={112}
                style={{ display: "inline-block" }}
              />
            </Link>
          </Section>
          {children}
          <Hr style={{ borderColor: color.border, margin: "32px 0 16px" }} />
          {unsubscribe && <Unsubscribe {...unsubscribe} storefrontUrl={storefrontUrl} />}
          <Footer storefrontUrl={storefrontUrl} />
        </Container>
      </Body>
    </Html>
  );
}

const small = { color: color.mutedForeground, fontSize: 12, lineHeight: "18px", margin: "4px 0" };

/** Motivo del email comercial y baja (Fase MK-A). */
function Unsubscribe({ url, topic, storefrontUrl }: EmailUnsubscribe & { storefrontUrl: string }) {
  return (
    <Section>
      <Text style={small}>
        Recibes este email porque activaste «{topic}» en tu cuenta.{" "}
        <Link href={url} style={{ color: color.primary }}>
          Darme de baja
        </Link>{" "}
        o elegir qué recibir en{" "}
        <Link href={`${storefrontUrl}/cuenta/comunicaciones/`} style={{ color: color.primary }}>
          Mi cuenta → Comunicaciones
        </Link>
        .
      </Text>
    </Section>
  );
}

/** Pie legal: textos provisionales hasta que los revise la gestoría (fase 5 §8). */
function Footer({ storefrontUrl }: { storefrontUrl: string }) {
  return (
    <Section>
      <Text style={small}>
        Este es un correo automático: por favor, no respondas a este mensaje. Si necesitas ayuda,
        escríbenos desde{" "}
        <Link href={storefrontUrl} style={{ color: color.primary }}>
          nuestra web
        </Link>
        .
      </Text>
      <Text style={small}>
        {STORE_NAME} · Lorem ipsum S.L. · NIF B00000000 · Calle Lorem Ipsum 1, 00000 Ciudad
        (España).
      </Text>
      <Text style={small}>
        <Link href={`${storefrontUrl}/condiciones/`} style={{ color: color.mutedForeground }}>
          Condiciones
        </Link>
        {" · "}
        <Link href={`${storefrontUrl}/privacidad/`} style={{ color: color.mutedForeground }}>
          Privacidad
        </Link>
        {" · "}
        <Link href={`${storefrontUrl}/aviso-legal/`} style={{ color: color.mutedForeground }}>
          Aviso legal
        </Link>
      </Text>
    </Section>
  );
}
