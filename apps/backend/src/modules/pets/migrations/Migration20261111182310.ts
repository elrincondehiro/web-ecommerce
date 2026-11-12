import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111182310 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "pet" add column if not exists "showcase_consent_at" timestamptz null, add column if not exists "showcase_status" text check ("showcase_status" in ('pendiente', 'aprobada', 'rechazada')) null, add column if not exists "showcase_reviewed_at" timestamptz null;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_showcase_status" ON "pet" ("showcase_status") WHERE deleted_at IS NULL AND showcase_consent_at IS NOT NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_pet_showcase_status";`);
    this.addSql(
      `alter table if exists "pet" drop column if exists "showcase_consent_at", drop column if exists "showcase_status", drop column if exists "showcase_reviewed_at";`,
    );
  }
}
