import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118075713 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "email_change" drop constraint if exists "email_change_token_hash_unique";`,
    );
    this.addSql(
      `create table if not exists "email_change" ("id" text not null, "customer_id" text not null, "new_email" text not null, "token_hash" text not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_change_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_email_change_deleted_at" ON "email_change" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_change_token_hash_unique" ON "email_change" ("token_hash") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_email_change_customer_id" ON "email_change" ("customer_id") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_change" cascade;`);
  }
}
