import { MedusaService } from "@medusajs/framework/utils";
import { StockAlert } from "./models/stock-alert";

export default class StockAlertModuleService extends MedusaService({ StockAlert }) {}
