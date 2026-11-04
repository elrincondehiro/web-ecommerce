import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261103223940 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "caja" drop constraint if exists "caja_estado_check";`);

    this.addSql(
      `alter table if exists "caja" add column if not exists "token_hash" text null, add column if not exists "propuesta_at" timestamptz null, add column if not exists "respondida_at" timestamptz null, add column if not exists "motivo_rechazo" text null, add column if not exists "aviso_at" timestamptz null;`,
    );
    this.addSql(
      `alter table if exists "caja" add constraint "caja_estado_check" check("estado" in ('pendiente', 'rellena', 'propuesta', 'aceptada', 'aceptada_auto', 'rechazada'));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_caja_estado" ON "caja" ("estado") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "caja" drop constraint if exists "caja_estado_check";`);

    this.addSql(`drop index if exists "IDX_caja_estado";`);
    this.addSql(
      `alter table if exists "caja" drop column if exists "token_hash", drop column if exists "propuesta_at", drop column if exists "respondida_at", drop column if exists "motivo_rechazo", drop column if exists "aviso_at";`,
    );

    this.addSql(
      `alter table if exists "caja" add constraint "caja_estado_check" check("estado" in ('pendiente', 'rellena'));`,
    );
  }
}
