import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261113134053 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "storefront_publish_state" ("id" text not null, "pending_since" timestamptz null, "last_change_at" timestamptz null, "requested_at" timestamptz null, "status" text check ("status" in ('idle', 'queued', 'running', 'ok', 'failed')) not null default 'idle', "started_at" timestamptz null, "finished_at" timestamptz null, "run_url" text null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "storefront_publish_state_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_storefront_publish_state_deleted_at" ON "storefront_publish_state" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "storefront_publish_state" cascade;`);
  }
}
