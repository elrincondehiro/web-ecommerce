import { Module } from "@medusajs/framework/utils";
import EmailChangeModuleService from "./service";

export const EMAIL_CHANGE_MODULE = "emailChange";

export default Module(EMAIL_CHANGE_MODULE, { service: EmailChangeModuleService });
