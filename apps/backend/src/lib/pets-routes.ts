import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { isWebp, PET_PHOTO_MAX_BYTES } from "./pets";
import { toPetFields, type PetBodyInput } from "./pets-schema";
import { listCustomerPets, petView } from "./pets-view";
import {
  createPetWorkflow,
  deletePetsWorkflow,
  setPetPhotoWorkflow,
  updatePetWorkflow,
} from "../workflows/pets";

/**
 * Lógica común de las rutas de mascotas (Fase M): la Store API (`/store/customers/me/pets*`, el
 * cliente sale del token) y el Admin (`/admin/customers/:id/pets*`). Las rutas solo validan y
 * llaman a estos helpers, que llaman a los workflows.
 */
export const petsApi = {
  list: async (scope: MedusaContainer, customerId: string) => ({
    pets: await listCustomerPets(scope, customerId),
  }),

  create: async (scope: MedusaContainer, customerId: string, body: PetBodyInput) => {
    const { result } = await createPetWorkflow(scope).run({
      input: { customer_id: customerId, fields: toPetFields(body) },
    });
    return { pet: petView(result as unknown as Record<string, unknown>) };
  },

  update: async (scope: MedusaContainer, customerId: string, petId: string, body: PetBodyInput) => {
    const { result } = await updatePetWorkflow(scope).run({
      input: { customer_id: customerId, pet_id: petId, fields: toPetFields(body) },
    });
    return { pet: petView(result as unknown as Record<string, unknown>) };
  },

  remove: async (scope: MedusaContainer, customerId: string, petId: string) => {
    await deletePetsWorkflow(scope).run({ input: { customer_id: customerId, pet_id: petId } });
    return { id: petId, deleted: true };
  },

  setPhoto: async (
    scope: MedusaContainer,
    customerId: string,
    petId: string,
    content: string | null,
  ) => {
    if (content) {
      const buf = Buffer.from(content, "base64");
      if (buf.length > PET_PHOTO_MAX_BYTES || !isWebp(buf)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "La foto debe llegar en WebP reducido",
        );
      }
    }
    const { result } = await setPetPhotoWorkflow(scope).run({
      input: { customer_id: customerId, pet_id: petId, content },
    });
    return { pet: petView(result as unknown as Record<string, unknown>) };
  },
};
