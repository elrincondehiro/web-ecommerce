import {
  Modules,
  ProductOptionValueWorkflowEvents,
  ProductOptionWorkflowEvents,
} from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import type { IProductModuleService } from "@medusajs/framework/types";
import { emitEventStep } from "@medusajs/medusa/core-flows";

/**
 * Familias de una opción desde el widget del Admin (Fase FO-5): la metadata de la opción y la de
 * sus valores en UN workflow (todo o nada: un fallo a mitad no deja la opción a medias). El plan
 * (qué cambia, metadata ya mezclada) lo calcula la ruta con `planFamilies`, como la hoja.
 * Cada paso guarda la metadata anterior y la restaura en la compensación; los eventos son los
 * mismos que los de updateProductOptionsWorkflow / updateProductOptionValuesWorkflow
 * (@medusajs/core-flows 2.22.1), que reindexan /buscar/ (src/search/product.ts).
 * Fuente: context7 /medusajs/medusa (createStep con compensación, transform, emitEventStep).
 */

type Metadata = Record<string, unknown>;
export interface OptionFamiliesInput {
  option: { id: string; metadata: Metadata } | null;
  values: { id: string; metadata: Metadata }[];
}

const updateOptionMetadataStep = createStep(
  "update-option-families-option",
  async (option: OptionFamiliesInput["option"], { container }) => {
    if (!option) return new StepResponse(null, null);
    const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
    const [before] = await productModule.listProductOptions(
      { id: option.id },
      { select: ["id", "metadata"] },
    );
    await productModule.updateProductOptions(option.id, { metadata: option.metadata });
    return new StepResponse(
      option.id,
      before ? { id: before.id, metadata: before.metadata ?? {} } : null,
    );
  },
  async (before, { container }) => {
    if (!before) return;
    await container
      .resolve<IProductModuleService>(Modules.PRODUCT)
      .updateProductOptions(before.id, { metadata: before.metadata });
  },
);

const updateValuesMetadataStep = createStep(
  "update-option-families-values",
  async (values: OptionFamiliesInput["values"], { container }) => {
    if (!values.length) return new StepResponse([] as string[], []);
    const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
    const before = await productModule.listProductOptionValues(
      { id: values.map((v) => v.id) },
      { select: ["id", "metadata"] },
    );
    for (const v of values) {
      await productModule.updateProductOptionValues(v.id, { metadata: v.metadata });
    }
    return new StepResponse(
      values.map((v) => v.id),
      before.map((b) => ({ id: b.id, metadata: (b.metadata as Metadata | null) ?? {} })),
    );
  },
  async (before, { container }) => {
    if (!before?.length) return;
    const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
    for (const b of before)
      await productModule.updateProductOptionValues(b.id, { metadata: b.metadata });
  },
);

export const updateOptionFamiliesWorkflow = createWorkflow(
  "update-option-families",
  (input: OptionFamiliesInput) => {
    const optionId = updateOptionMetadataStep(input.option);
    const valueIds = updateValuesMetadataStep(input.values);
    const optionEvents = transform({ optionId }, ({ optionId }) =>
      optionId ? [{ id: optionId }] : [],
    );
    const valueEvents = transform({ valueIds }, ({ valueIds }) => valueIds.map((id) => ({ id })));
    emitEventStep({ eventName: ProductOptionWorkflowEvents.UPDATED, data: optionEvents }).config({
      name: "emit-option-families-option",
    });
    emitEventStep({
      eventName: ProductOptionValueWorkflowEvents.UPDATED,
      data: valueEvents,
    }).config({
      name: "emit-option-families-values",
    });
    return new WorkflowResponse({ option: optionId, values: valueIds });
  },
);
