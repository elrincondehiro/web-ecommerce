import { Module } from "@medusajs/framework/utils";
import StockAlertModuleService from "./service";

export const STOCK_ALERT_MODULE = "stockAlert";

export default Module(STOCK_ALERT_MODULE, { service: StockAlertModuleService });
