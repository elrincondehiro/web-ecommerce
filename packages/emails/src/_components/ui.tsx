import type { ReactNode } from "react";
import { Button, Heading, Link, Text } from "react-email";
import { color } from "../_lib/theme";

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{ color: color.foreground, fontSize: 24, lineHeight: "32px", margin: "16px 0 8px" }}
    >
      {children}
    </Heading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: color.foreground, fontSize: 15, lineHeight: "24px", margin: "12px 0" }}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{ color: color.mutedForeground, fontSize: 13, lineHeight: "20px", margin: "12px 0" }}
    >
      {children}
    </Text>
  );
}

/** Botón principal + el enlace en texto, por si el cliente de correo no muestra el botón. */
export function CallToAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <Button
        href={href}
        style={{
          backgroundColor: color.primary,
          borderRadius: 8,
          color: color.primaryForeground,
          display: "inline-block",
          fontSize: 15,
          fontWeight: 600,
          margin: "16px 0",
          padding: "12px 24px",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
      <Muted>
        Si el botón no funciona, copia y pega este enlace en tu navegador:{" "}
        <Link href={href} style={{ color: color.primary, wordBreak: "break-all" }}>
          {href}
        </Link>
      </Muted>
    </>
  );
}
