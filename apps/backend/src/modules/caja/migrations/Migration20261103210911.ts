import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261103210911 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "caja" drop constraint if exists "caja_line_item_id_unique";`,
    );
    this.addSql(
      `create table if not exists "caja" ("id" text not null, "order_id" text not null, "line_item_id" text not null, "estado" text check ("estado" in ('pendiente', 'rellena')) not null default 'pendiente', "intento" integer not null default 0, "rellenada_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "caja_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_caja_deleted_at" ON "caja" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_caja_order_id" ON "caja" ("order_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_caja_line_item_id_unique" ON "caja" ("line_item_id") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "caja" cascade;`);
  }
}
