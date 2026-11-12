import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261104222147 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "comms_consent" drop constraint if exists "comms_consent_customer_id_topic_unique";`,
    );
    this.addSql(
      `create table if not exists "comms_consent" ("id" text not null, "customer_id" text not null, "topic" text check ("topic" in ('novedades', 'cumpleanos', 'gincana')) not null, "granted_at" timestamptz not null, "source" text check ("source" in ('cuenta', 'admin')) not null default 'cuenta', "text_version" integer not null, "revoked_at" timestamptz null, "revoked_via" text check ("revoked_via" in ('cuenta', 'baja', 'admin')) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "comms_consent_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_comms_consent_deleted_at" ON "comms_consent" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_comms_consent_customer_id" ON "comms_consent" ("customer_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_comms_consent_customer_id_topic_unique" ON "comms_consent" ("customer_id", "topic") WHERE deleted_at IS NULL AND revoked_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_comms_consent_topic" ON "comms_consent" ("topic") WHERE deleted_at IS NULL AND revoked_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "comms_consent" cascade;`);
  }
}
