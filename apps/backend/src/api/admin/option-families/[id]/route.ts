import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IProductModuleService } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  FAMILY_ID_RE,
  MAX_FAMILIES,
  MAX_FAMILIES_PER_VALUE,
  valuesWithoutFamily,
} from "../../../../lib/option-families";
import { planFamilies, type DbFamilyOption } from "../../../../scripts/lib/families-plan";
import type { FamiliesSheet } from "../../../../scripts/lib/families-sheet";
import { updateOptionFamiliesWorkflow } from "../../../../workflows/option-families";

/**
 * POST /admin/option-families/:id (Fase FO-5): familias de una opción GLOBAL y a cuáles
 * pertenece cada valor, desde el widget del Admin (`product_option.details.after`). Mismo plan
 * que `familias.csv` (scripts/lib/families-plan.ts: mezcla la metadata, conserva el resto de
 * claves y solo escribe lo que cambia) y un workflow con compensación. Admin (Medusa protege
 * /admin). Validación del body en middlewares.ts. Responde lo escrito y los valores sin familia.
 */
const HEX = /^#[0-9a-f]{6}$/i;

export const AdminOptionFamiliesBody = z.object({
  familias: z
    .array(
      z.object({
        id: z.string().regex(FAMILY_ID_RE, "id: minúsculas, números y guiones").max(40),
        nombre: z.string().trim().min(1).max(40),
        color: z.string().regex(HEX, "color: #rrggbb").nullable().optional(),
      }),
    )
    .max(MAX_FAMILIES)
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, "Familias repetidas"),
  valores: z
    .array(
      z.object({
        id: z.string().min(1),
        familias: z.array(z.string().regex(FAMILY_ID_RE)).max(MAX_FAMILIES_PER_VALUE),
        // Color de la muestra del selector (Fase O, `metadata.color`); null = quitarlo
        color: z.string().regex(HEX, "color: #rrggbb").nullable(),
      }),
    )
    .max(500),
});
type Body = z.infer<typeof AdminOptionFamiliesBody>;

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const { familias, valores } = req.validatedBody;
  const productModule = req.scope.resolve<IProductModuleService>(Modules.PRODUCT);
  const [option] = await productModule.listProductOptions(
    { id: req.params.id ?? "" },
    { relations: ["values"] },
  );
  if (!option) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Opción no encontrada");
  if (option.is_exclusive) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Las opciones exclusivas de un producto no se agrupan en familias",
    );
  }
  const db: DbFamilyOption = {
    id: option.id,
    title: option.title,
    metadata: (option.metadata as Record<string, unknown> | null) ?? null,
    values: (option.values ?? []).map((v) => ({
      id: v.id,
      value: v.value,
      metadata: (v.metadata as Record<string, unknown> | null) ?? null,
    })),
  };
  const byId = new Map(db.values.map((v) => [v.id, v]));
  const foreign = valores.filter((v) => !byId.has(v.id));
  if (foreign.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Valores que no son de la opción «${option.title}»: ${foreign.map((v) => v.id).join(", ")}`,
    );
  }
  // El mismo formato que lee planFamilies desde la hoja (por valor, con su texto)
  const sheet: FamiliesSheet = {
    definitions: [
      {
        option: option.title,
        line: 0,
        families: familias.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          color: f.color?.toLowerCase() ?? null,
        })),
      },
    ],
    assignments: valores.map((v) => ({
      option: option.title,
      value: byId.get(v.id)!.value,
      line: 0,
      families: v.familias,
      swatch: v.color ? v.color.toLowerCase() : null,
    })),
    errors: [],
  };
  const plan = planFamilies(sheet, [db]);
  if (plan.errors.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      plan.errors.map((e) => e.message).join(" "),
    );
  }
  const write = plan.options[0];
  const { result } = await updateOptionFamiliesWorkflow(req.scope).run({
    input: {
      option: write ? { id: write.id, metadata: write.metadata } : null,
      values: plan.values.map((v) => ({ id: v.id, metadata: v.metadata })),
    },
  });
  // Estado final para el widget: valores sin familia (no saldrán en el filtro)
  const finalMeta = new Map(plan.values.map((v) => [v.id, v.metadata]));
  const missing = valuesWithoutFamily({
    title: option.title,
    metadata: write?.metadata ?? db.metadata,
    values: db.values.map((v) => ({ value: v.value, metadata: finalMeta.get(v.id) ?? v.metadata })),
  });
  res.json({
    option_updated: Boolean(result.option),
    values_updated: result.values.length,
    without_family: missing,
  });
}
