import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261024165435 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pet" drop constraint if exists "pet_share_token_unique";`);
    this.addSql(
      `create table if not exists "pet" ("id" text not null, "customer_id" text not null, "name" text not null, "species" text check ("species" in ('perro', 'gato', 'conejo', 'huron', 'roedor', 'ave', 'reptil', 'otro')) not null, "species_other" text null, "breed" text null, "birth_year" integer null, "birth_month" integer null, "birth_day" integer null, "death_year" integer null, "death_month" integer null, "death_day" integer null, "sex" text check ("sex" in ('macho', 'hembra', 'desconocido')) null, "neutered" text check ("neutered" in ('si', 'no', 'desconocido')) null, "weight_kg" real null, "diet" text null, "origin" text check ("origin" in ('adoptado', 'rescatado', 'criador', 'tienda', 'familia', 'otro')) null, "health" text null, "health_consent_at" timestamptz null, "photo_url" text null, "photo_file_id" text null, "photo_consent_at" timestamptz null, "status" text check ("status" in ('casa', 'adopcion', 'acogida')) not null default 'casa', "share_token" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pet_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_deleted_at" ON "pet" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_customer_id" ON "pet" ("customer_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_share_token_unique" ON "pet" ("share_token") WHERE deleted_at IS NULL AND share_token IS NOT NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "pet" cascade;`);
  }
}
