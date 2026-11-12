import { Module } from "@medusajs/framework/utils";
import SearchLogModuleService from "./service";

export const SEARCH_LOG_MODULE = "searchLog";

export default Module(SEARCH_LOG_MODULE, { service: SearchLogModuleService });
