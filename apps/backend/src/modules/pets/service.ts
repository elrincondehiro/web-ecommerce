import { MedusaService } from "@medusajs/framework/utils";
import { Pet } from "./models/pet";

export default class PetsModuleService extends MedusaService({ Pet }) {}
