import { Module } from "@medusajs/framework/utils";
import PetsModuleService from "./service";

export const PETS_MODULE = "pets";

export default Module(PETS_MODULE, { service: PetsModuleService });
