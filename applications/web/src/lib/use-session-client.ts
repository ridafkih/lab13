"use client";

import { useRef } from "react";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

export function createSessionClient(labSessionId: string): OpencodeClient {
  return createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": labSessionId },
  });
}

export function createClient(): OpencodeClient {
  return createOpencodeClient({ baseUrl: `${getApiUrl()}/opencode` });
}

export function useSessionClient(sessionId: string | null): OpencodeClient | null {
  const clientRef = useRef<{ client: OpencodeClient; sessionId: string } | null>(null);

  if (sessionId && clientRef.current?.sessionId !== sessionId) {
    clientRef.current = { client: createSessionClient(sessionId), sessionId };
  } else if (!sessionId) {
    clientRef.current = null;
  }

  return clientRef.current?.client ?? null;
}
