import { MedusaService } from "@medusajs/framework/utils";
import { CommsConsent } from "./models/comms-consent";

export default class CommsModuleService extends MedusaService({ CommsConsent }) {}
