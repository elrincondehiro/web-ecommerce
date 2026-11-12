import { Img, Section, Text } from "react-email";
import { Layout, type EmailLinks, type EmailUnsubscribe } from "./_components/Layout";
import { CallToAction, Muted, Paragraph, Title } from "./_components/ui";
import { color } from "./_lib/theme";

/**
 * Felicitación de cumpleaños de las mascotas de «Mis peques» (Fase MK-D). Comercial: solo con el
 * tema «Cumpleaños de mis peques» activado (MK-A, `sendMarketingEmail`), con pie y cabeceras de
 * baja. Un email por cliente y día con todas las que cumplen. Respetuoso: sin ofertas ni prisa.
 */
export type PetBirthdayItem = {
  name: string;
  /** Años que cumple; null si solo se sabe el mes («este mes»). */
  age: number | null;
  /** Foto pública (URL absoluta, WebP del bucket) o null. */
  photo: string | null;
  /** Solo se sabe el mes: «este mes» en vez de «hoy». */
  thisMonth: boolean;
};

export type PetBirthdayProps = EmailLinks & {
  pets: PetBirthdayItem[];
  /** «Mis peques» de la cuenta. */
  petsUrl: string;
  unsubscribe?: EmailUnsubscribe | undefined;
};

const years = (n: number) => (n === 1 ? "1 año" : `${n} años`);
const line = (p: PetBirthdayItem) =>
  `¡${p.name} cumple ${p.age ? years(p.age) : "años"} ${p.thisMonth ? "este mes" : "hoy"}!`;

export const subject = (p: PetBirthdayProps) =>
  p.pets.length === 1 ? `🎂 ${line(p.pets[0]!)}` : "🎂 ¡Hoy es día de cumpleaños en casa!";

export function PetBirthday(props: PetBirthdayProps) {
  return (
    <Layout
      preview="Una felicitación de parte de El Rincón de Hiro."
      storefrontUrl={props.storefrontUrl}
      assetsUrl={props.assetsUrl}
      unsubscribe={props.unsubscribe}
    >
      <Title>¡Feliz cumpleaños!</Title>
      {props.pets.map((p, i) => (
        <Section key={i} style={{ margin: "12px 0" }}>
          {p.photo ? (
            <Img
              src={p.photo}
              alt={p.name}
              width={160}
              height={160}
              style={{ borderRadius: 12, objectFit: "cover", border: `2px solid ${color.border}` }}
            />
          ) : null}
          <Text
            style={{ color: color.foreground, fontSize: 18, fontWeight: 700, margin: "8px 0 0" }}
          >
            {line(p)}
          </Text>
        </Section>
      ))}
      <Paragraph>
        Desde El Rincón de Hiro os deseamos un día lleno de mimos, paseos y premios. Gracias por
        dejarnos formar parte de la vida de vuestros peques.
      </Paragraph>
      <CallToAction href={props.petsUrl}>Ver Mis peques</CallToAction>
      <Muted>
        Te escribimos porque guardaste su fecha de nacimiento en «Mis peques». Si algo no es
        correcto, puedes cambiarlo en su ficha.
      </Muted>
    </Layout>
  );
}

PetBirthday.PreviewProps = {
  storefrontUrl: "http://localhost:4321",
  assetsUrl: "http://localhost:4321",
  petsUrl: "http://localhost:4321/cuenta/mascotas/",
  pets: [
    { name: "Hiro", age: 5, photo: null, thisMonth: false },
    { name: "Luna", age: 2, photo: null, thisMonth: true },
  ],
  unsubscribe: { url: "http://localhost:4321/baja/?t=preview", topic: "Cumpleaños de mis peques" },
} satisfies PetBirthdayProps;

export default PetBirthday;
