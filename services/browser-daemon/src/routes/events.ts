import type { RouteHandler } from "../utils/route-handler";

export const GET: RouteHandler = (_request, _params, context) => {
  const { daemonManager } = context;
  const state = { unsubscribe: null as (() => void) | null, pingInterval: null as Timer | null };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        if (controller.desiredSize === null) return;
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      state.unsubscribe = daemonManager.onEvent((event) => {
        send(JSON.stringify(event));
      });

      state.pingInterval = setInterval(() => {
        send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }, 15000);

      send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
    },
    cancel() {
      state.unsubscribe?.();
      if (state.pingInterval) clearInterval(state.pingInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
