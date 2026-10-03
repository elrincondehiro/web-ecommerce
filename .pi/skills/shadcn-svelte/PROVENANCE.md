# Origen de este skill

- Fuente: repositorio oficial `huntabyte/shadcn-svelte`, carpeta `skills/shadcn-svelte/`.
- Versión: tag **`shadcn-svelte@1.7.0`** (misma versión que la CLI fijada en README §4).
- Descarga: `https://codeload.github.com/huntabyte/shadcn-svelte/tar.gz/refs/tags/shadcn-svelte@1.7.0`.
- Licencia: MIT (`LICENSE.md`).

## Cambios locales respecto al original

- `npx shadcn-svelte@latest` → `pnpm dlx shadcn-svelte@1.7.0` (AGENTS.md: pnpm siempre, versiones fijadas).
- `allowed-tools` limitado a `Bash(pnpm dlx shadcn-svelte@1.7.0 *)`.
- No se copian `assets/` (imágenes), `evals/` ni `agents/openai.yml` (no los usa pi).

## Actualizar

Al subir shadcn-svelte, descargar el tag nuevo, sustituir los ficheros y volver a aplicar los cambios de arriba.
