"use client";

import { createOpencodeClient, type Event } from "@opencode-ai/sdk/client";

type EventListener = (event: Event) => void;

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

export function subscribeToSessionEvents(sessionId: string, listener: EventListener): () => void {
  const abortController = new AbortController();
  const signal = abortController.signal;

  const client = createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": sessionId },
  });

  const directory = `/workspaces/${sessionId}`;

  const connect = async () => {
    while (!signal.aborted) {
      try {
        const { stream } = await client.event.subscribe({ query: { directory }, signal });

        for await (const event of stream) {
          if (signal.aborted) break;
          listener(event);
        }
      } catch {
        if (signal.aborted) return;
      }

      if (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  connect();

  return () => abortController.abort();
}

export type { Event };
