import { Module } from "@medusajs/framework/utils";
import StorefrontPublishModuleService from "./service";

export const STOREFRONT_PUBLISH_MODULE = "storefrontPublish";

export default Module(STOREFRONT_PUBLISH_MODULE, { service: StorefrontPublishModuleService });
