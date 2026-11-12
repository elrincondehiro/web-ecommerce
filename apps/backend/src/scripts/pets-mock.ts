import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { PETS_MODULE } from "../modules/pets";
import type PetsModuleService from "../modules/pets/service";
import { setPetPhotoWorkflow } from "../workflows/pets";

/**
 * Mascotas de PRUEBA para el escaparate «Vuestros peques» (Fase MK-D), solo desarrollo.
 *
 *   pnpm --filter backend pets:mock [N=60] [borrar]
 *
 * - Crea N mascotas (≈15 % fallecidas) repartidas entre clientes `peques-mock-<n>@example.com`
 *   (se crean; sin cuenta de acceso), con foto de picsum.photos (WebP 800 px: paisajes, NO
 *   animales), casilla del escaparate y la mayoría ya aprobadas (≈20 % pendientes, para probar la
 *   moderación). Algunas cumplen años hoy (para el aviso y el email).
 * - IDEMPOTENTE por nombre: si ya existe la mascota de prueba, no la repite.
 * - `borrar`: quita estas mascotas (y sus fotos) y sus clientes de prueba.
 * Nunca con NODE_ENV=production.
 */
const NAMES = [
  "Hiro",
  "Luna",
  "Nala",
  "Coco",
  "Toby",
  "Lola",
  "Simba",
  "Kira",
  "Rocky",
  "Mia",
  "Thor",
  "Lua",
  "Bimba",
  "Max",
  "Canela",
  "Nube",
  "Zeus",
  "Frida",
  "Bruno",
  "Maya",
  "Leo",
  "Kiara",
  "Duna",
  "Rufo",
  "Chispa",
  "Pipo",
  "Greta",
  "Ozzy",
  "Brisa",
  "Lúa",
  "Kai",
  "Trufa",
  "Pancho",
  "Olivia",
  "Nico",
  "Sasha",
  "Tango",
  "Mora",
  "Gala",
  "Pepa",
];
const SPECIES = ["perro", "perro", "perro", "gato", "gato", "conejo"] as const;
const PREFIX = "peques-mock-";

export default async function petsMock({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (process.env.NODE_ENV === "production") throw new Error("pets:mock solo en desarrollo");
  const customers = container.resolve(Modules.CUSTOMER);
  const pets = container.resolve<PetsModuleService>(PETS_MODULE);
  const mine = await customers.listCustomers({ email: { $like: `${PREFIX}%` } });

  if (args?.includes("borrar")) {
    const rows = await pets.listPets({ customer_id: mine.map((c) => c.id) });
    for (const p of rows) {
      if (p.photo_file_id) {
        await setPetPhotoWorkflow(container).run({
          input: { customer_id: p.customer_id, pet_id: p.id, content: null },
        });
      }
    }
    if (rows.length) await pets.deletePets(rows.map((p) => p.id));
    if (mine.length) await customers.deleteCustomers(mine.map((c) => c.id));
    logger.info(`pets:mock: ${rows.length} mascotas y ${mine.length} clientes de prueba borrados.`);
    return;
  }

  const n = Math.max(1, Math.min(300, Number.parseInt(args?.[0] ?? "60", 10) || 60));
  const owners = Math.ceil(n / 3);
  const byEmail = new Map(mine.map((c) => [c.email, c]));
  for (let i = 1; i <= owners; i++) {
    const email = `${PREFIX}${i}@example.com`;
    if (!byEmail.has(email)) {
      const [c] = await customers.createCustomers([{ email, first_name: `Prueba ${i}` }]);
      byEmail.set(email, c!);
    }
  }
  const now = new Date();
  const today = { month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  let created = 0;
  for (let i = 0; i < n; i++) {
    const owner = byEmail.get(`${PREFIX}${(i % owners) + 1}@example.com`)!;
    const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""}`;
    const [existing] = await pets.listPets({ customer_id: owner.id, name });
    if (existing) continue;
    const gone = i % 7 === 3;
    const birthYear = 2008 + (i % 17);
    const birthday = i % 11 === 0; // algunas cumplen hoy
    const pet = await pets.createPets({
      customer_id: owner.id,
      name,
      species: SPECIES[i % SPECIES.length]!,
      birth_year: birthYear,
      birth_month: birthday ? today.month : (i % 12) + 1,
      birth_day: birthday ? today.day : i % 3 === 0 ? null : (i % 27) + 1,
      death_year: gone ? Math.min(birthYear + 8 + (i % 6), now.getUTCFullYear()) : null,
      showcase_consent_at: now,
    });
    const res = await fetch(`https://picsum.photos/seed/${PREFIX}${i}/800/800.webp`);
    if (!res.ok) throw new Error(`picsum ${res.status}`);
    const content = Buffer.from(await res.arrayBuffer()).toString("base64");
    await setPetPhotoWorkflow(container).run({
      input: { customer_id: owner.id, pet_id: pet.id, content },
    });
    // La foto deja la mascota «pendiente»: ~80 % aprobadas para ver el escaparate lleno.
    if (i % 5 !== 4) {
      await pets.updatePets({ id: pet.id, showcase_status: "aprobada", showcase_reviewed_at: now });
    }
    created += 1;
  }
  logger.info(`pets:mock: ${created} mascotas de prueba creadas (${owners} clientes).`);
}
