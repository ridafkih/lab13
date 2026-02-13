import { runMigrations } from "@lab/database/migrate";
import type { env } from "./env";
import type { setup } from "./setup";

interface MainOptions {
  env: typeof env.inferOut;
  extras: ReturnType<typeof setup>;
}

type MainFunction = (options: MainOptions) => unknown;

export const main = (async ({ env, extras }) => {
  const {
    server,
    redis,
    deferredPublisher,
    browserService,
    sessionLifecycle,
    poolManager,
    logMonitor,
    containerMonitor,
    acpMonitor,
    networkReconcileMonitor,
  } = extras;

  await runMigrations();

  await browserService.initialize();
  await sessionLifecycle.initialize();

  const publisher = await server.start(env.API_PORT);
  deferredPublisher.resolve(publisher);

  browserService.startReconciler();
  await networkReconcileMonitor.start();
  poolManager.initialize();
  logMonitor.start();
  containerMonitor.start(logMonitor);
  acpMonitor.start();

  return () => {
    containerMonitor.stop();
    acpMonitor.stop();
    logMonitor.stop();
    networkReconcileMonitor.stop();
    server.shutdown();
    redis.close();
  };
}) satisfies MainFunction;
