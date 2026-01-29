"use client";

import type { ReactNode } from "react";
import { MultiplayerProvider } from "@/lib/multiplayer/client";
import { ApiClientProvider } from "@/lib/api";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  if (!process.env.NEXT_PUBLIC_WS_URL) {
    throw Error("A NEXT_PUBLIC_WS_URL must be set");
  }

  return (
    <ApiClientProvider>
      <MultiplayerProvider
        config={{
          url: process.env.NEXT_PUBLIC_WS_URL,
        }}
      >
        {children}
      </MultiplayerProvider>
    </ApiClientProvider>
  );
}
