import { buildSseHeaders } from "@lab/http-utilities";
import { TIMING } from "../config/constants";
import type { RouteHandler } from "../types/route";

export const GET: RouteHandler = ({ context: { daemonManager } }) => {
  const state: {
    unsubscribe: (() => void) | null;
    pingInterval: Timer | null;
  } = {
    unsubscribe: null,
    pingInterval: null,
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        if (controller.desiredSize === null) {
          return;
        }
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      state.unsubscribe = daemonManager.onEvent((event) => {
        send(JSON.stringify(event));
      });

      state.pingInterval = setInterval(() => {
        send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }, TIMING.SSE_PING_INTERVAL_MS);

      send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
    },
    cancel() {
      state.unsubscribe?.();
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
      }
    },
  });

  return new Response(stream, { headers: buildSseHeaders() });
};
