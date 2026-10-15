import { Module } from "@medusajs/framework/utils";
import PointsModuleService from "./service";

export const POINTS_MODULE = "points";

export default Module(POINTS_MODULE, { service: PointsModuleService });
