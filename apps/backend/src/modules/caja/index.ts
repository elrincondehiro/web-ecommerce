import { Module } from "@medusajs/framework/utils";
import CajaModuleService from "./service";

export const CAJA_MODULE = "caja";

export default Module(CAJA_MODULE, { service: CajaModuleService });
