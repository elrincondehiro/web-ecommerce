import { MedusaService } from "@medusajs/framework/utils";
import { EmailChange } from "./models/email-change";

export default class EmailChangeModuleService extends MedusaService({ EmailChange }) {}
