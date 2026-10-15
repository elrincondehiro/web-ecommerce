import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014221841 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "points_transaction" drop constraint if exists "points_transaction_reference_unique";`,
    );
    this.addSql(
      `alter table if exists "points_account" drop constraint if exists "points_account_customer_id_unique";`,
    );
    this.addSql(
      `create table if not exists "points_account" ("id" text not null, "customer_id" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "points_account_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_points_account_deleted_at" ON "points_account" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_points_account_customer_id_unique" ON "points_account" ("customer_id") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `create table if not exists "points_transaction" ("id" text not null, "type" text check ("type" in ('credit', 'debit')) not null, "amount" numeric not null, "reference" text not null, "reference_id" text not null, "channel" text not null default 'web', "note" text null, "account_id" text not null, "metadata" jsonb null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "points_transaction_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_points_transaction_account_id" ON "points_transaction" ("account_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_points_transaction_deleted_at" ON "points_transaction" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_points_transaction_reference_unique" ON "points_transaction" ("reference", "reference_id", "type") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `alter table if exists "points_transaction" add constraint "points_transaction_account_id_foreign" foreign key ("account_id") references "points_account" ("id") on update cascade;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "points_transaction" drop constraint if exists "points_transaction_account_id_foreign";`,
    );

    this.addSql(`drop table if exists "points_account" cascade;`);

    this.addSql(`drop table if exists "points_transaction" cascade;`);
  }
}
