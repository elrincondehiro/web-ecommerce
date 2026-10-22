/**
 * Tipos de la API de Loyverse v1.0 (solo los campos que se usan). Fuente: esquemas `Item`,
 * `Variant`, `store_override`, `Category`, `Supplier`, `Store`, `Tax`, `GETInventory_level`,
 * `Receipt` y `line_item` de https://developer.loyverse.com/docs/API-Reference__v1.0.yaml.
 */

export interface StoreOverride {
  store_id: string;
  pricing_type?: "FIXED" | "VARIABLE";
  price?: number | null;
  available_for_sale?: boolean;
  optimal_stock?: number | null;
  low_stock?: number | null;
}

export interface Variant {
  variant_id: string;
  item_id: string;
  sku?: string | null;
  reference_variant_id?: string | null;
  option1_value?: string | null;
  option2_value?: string | null;
  option3_value?: string | null;
  barcode?: string | null;
  cost?: number | null;
  purchase_cost?: number | null;
  default_pricing_type?: "FIXED" | "VARIABLE";
  default_price?: number | null;
  stores?: StoreOverride[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Item {
  id: string;
  handle?: string;
  item_name: string;
  description?: string | null;
  reference_id?: string | null;
  category_id?: string | null;
  track_stock?: boolean;
  sold_by_weight?: boolean;
  is_composite?: boolean;
  primary_supplier_id?: string | null;
  tax_ids?: string[];
  image_url?: string | null;
  option1_name?: string | null;
  option2_name?: string | null;
  option3_name?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  variants: Variant[];
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  deleted_at?: string | null;
}

export interface Store {
  id: string;
  name: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface Tax {
  id: string;
  name: string;
  rate: number;
  type?: "INCLUDED" | "ADDED";
  deleted_at?: string | null;
}

export interface InventoryLevel {
  variant_id: string;
  store_id: string;
  in_stock: number;
  updated_at?: string;
}

export interface LineItem {
  id?: string;
  item_id?: string | null;
  variant_id?: string | null;
  item_name?: string;
  variant_name?: string | null;
  sku?: string | null;
  quantity: number;
  price?: number;
  gross_total_money?: number;
  total_money?: number;
  cost?: number;
  cost_total?: number;
  total_discount?: number;
}

export interface Receipt {
  receipt_number: string;
  receipt_type: "SALE" | "REFUND";
  refund_for?: string | null;
  created_at: string;
  receipt_date?: string;
  updated_at?: string;
  cancelled_at?: string | null;
  source?: string;
  total_money?: number;
  total_tax?: number;
  total_discount?: number;
  customer_id?: string | null;
  employee_id?: string | null;
  store_id?: string;
  pos_device_id?: string | null;
  line_items: LineItem[];
  payments?: { payment_type_id?: string; name?: string; type?: string; money_amount?: number }[];
}
