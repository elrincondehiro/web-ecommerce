// Comprobaciones previas de los e2e (auditoría pre-fase 10, B2). Los fallos "aleatorios" que
// se vieron venían del entorno, no del código: `medusa develop` reiniciándose a mitad de suite
// (su watcher reacciona a cambios en apps/backend/src, p. ej. un `medusa exec` o un cambio de
// rama) y stock agotado por los pedidos de los e2e de checkout. Aquí se ESPERA a que el backend
// responda de forma estable y se avisa del stock; no se ejecuta nada en el backend (un
// `medusa exec` desde aquí reiniciaría el `medusa develop` en marcha).
// Fuente: context7 /microsoft/playwright (global setup).
const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:9000";

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${BACKEND}/health`)).ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  // 3 respuestas seguidas con 1 s de separación: un develop que se está reiniciando falla alguna.
  const deadline = Date.now() + 90_000;
  let streak = 0;
  while (streak < 3) {
    if (Date.now() > deadline) {
      throw new Error(
        `El backend (${BACKEND}) no responde de forma estable: arranca \`pnpm dev:backend\` y no ` +
          "cambies de rama ni ejecutes `medusa exec` mientras corren los e2e.",
      );
    }
    streak = (await healthy()) ? streak + 1 : 0;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
