"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createClient, type Client } from "@lab/client";

const ApiClientContext = createContext<Client | null>(null);

interface ApiClientProviderProps {
  children: ReactNode;
}

export function ApiClientProvider({ children }: ApiClientProviderProps) {
  const client = useMemo(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_API_URL must be set");
    }
    return createClient({ baseUrl });
  }, []);

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): Client {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used within an ApiClientProvider");
  }
  return client;
}
