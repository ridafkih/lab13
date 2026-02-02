import { server, browserService, shutdownBrowserService } from "./clients/server";
import { createContainerMonitor } from "./utils/monitors/container.monitor";
import { createOpenCodeMonitor } from "./utils/monitors/opencode.monitor";
import { cleanupOrphanedSessions } from "./utils/browser/state-store";
import { cleanupOrphanedNetworks } from "./utils/docker/network";

console.log(`API server running on http://localhost:${server.port}`);

cleanupOrphanedSessions().catch((error) => {
  console.warn("[Startup] Failed to cleanup orphaned browser sessions:", error);
});

cleanupOrphanedNetworks()
  .then((count) => {
    if (count > 0) {
      console.log(`[Startup] Cleaned up ${count} orphaned network(s)`);
    }
  })
  .catch((error) => {
    console.warn("[Startup] Failed to cleanup orphaned networks:", error);
  });

const containerMonitor = createContainerMonitor();
const openCodeMonitor = createOpenCodeMonitor();

containerMonitor.start();
openCodeMonitor.start();

function gracefulShutdown() {
  containerMonitor.stop();
  openCodeMonitor.stop();
  shutdownBrowserService(browserService);
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
