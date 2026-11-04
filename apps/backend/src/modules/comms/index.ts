import { Module } from "@medusajs/framework/utils";
import CommsModuleService from "./service";

export const COMMS_MODULE = "comms";

export default Module(COMMS_MODULE, { service: CommsModuleService });
