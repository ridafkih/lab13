"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { MultiplayerProvider } from "@/lib/multiplayer";

interface ProvidersProps {
  children: ReactNode;
  fallback?: Record<string, unknown>;
}

const SWR_CONFIG = {
  dedupingInterval: 2000,
  revalidateOnFocus: false,
  shouldRetryOnError: true,
  errorRetryCount: 3,
} as const;

const MultiplayerEnabledContext = createContext(false);

export function useMultiplayerEnabled() {
  return use(MultiplayerEnabledContext);
}

export function Providers({ children, fallback = {} }: ProvidersProps) {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;

  const swrValue = useMemo(() => ({ ...SWR_CONFIG, fallback }), [fallback]);

  const swrContent = <SWRConfig value={swrValue}>{children}</SWRConfig>;

  if (!wsUrl) {
    return <MultiplayerEnabledContext value={false}>{swrContent}</MultiplayerEnabledContext>;
  }

  return (
    <MultiplayerEnabledContext value={true}>
      <MultiplayerProvider config={{ url: wsUrl }}>{swrContent}</MultiplayerProvider>
    </MultiplayerEnabledContext>
  );
}
