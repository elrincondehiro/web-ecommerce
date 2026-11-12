import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112093849 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "search_term" drop constraint if exists "search_term_term_week_unique";`,
    );
    this.addSql(
      `create table if not exists "search_term" ("id" text not null, "term" text not null, "week" timestamptz not null, "count" integer not null default 0, "zero_count" integer not null default 0, "last_total" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "search_term_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_search_term_deleted_at" ON "search_term" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_search_term_term_week_unique" ON "search_term" ("term", "week") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_search_term_week" ON "search_term" ("week") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "search_term" cascade;`);
  }
}
