import type { MedusaContainer } from "@medusajs/framework/types";
import { PETS_BIRTHDAY_DEFAULT_CRON, sendPetBirthdays } from "../lib/pets-birthday";

/** Cumpleaños de «Mis peques» (Fase MK-D): felicitación por email. Solo en el worker. */
export default async function petsBirthdayJob(container: MedusaContainer) {
  await sendPetBirthdays(container);
}

export const config = {
  name: "pets-birthday",
  schedule: process.env.PETS_BIRTHDAY_CRON || PETS_BIRTHDAY_DEFAULT_CRON,
};
