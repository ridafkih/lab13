import { createContext, useEffect, useMemo, type ReactNode } from "react";
import { Provider as JotaiProvider, useSetAtom } from "jotai";
import type { z } from "zod";

type AnyChannelConfig = {
  path: string;
  snapshot: z.ZodType;
  default: unknown;
  delta?: z.ZodType;
  event?: z.ZodType;
};
import { ConnectionManager, type ConnectionConfig } from "./connection";
import { connectionStateAtom } from "./atoms";
import { createHooks } from "./hooks";

export interface MultiplayerContextValue {
  connection: ConnectionManager;
}

export const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

interface MultiplayerProviderInnerProps {
  connection: ConnectionManager;
  children: ReactNode;
}

function MultiplayerProviderInner({ connection, children }: MultiplayerProviderInnerProps) {
  const setConnectionState = useSetAtom(connectionStateAtom);

  useEffect(() => {
    const unsubscribe = connection.onStateChange(setConnectionState);
    connection.connect();

    return () => {
      unsubscribe();
      connection.disconnect();
    };
  }, [connection, setConnectionState]);

  const contextValue = useMemo(() => ({ connection }), [connection]);

  return <MultiplayerContext.Provider value={contextValue}>{children}</MultiplayerContext.Provider>;
}

export function createMultiplayerProvider<
  TChannels extends Record<string, AnyChannelConfig>,
  TClientMessages extends z.ZodType,
>(schema: { channels: TChannels; clientMessages: TClientMessages }) {
  const { useMultiplayer } = createHooks(schema);

  interface ProviderProps {
    config: ConnectionConfig;
    children: ReactNode;
  }

  function MultiplayerProvider({ config, children }: ProviderProps) {
    const connection = useMemo(() => new ConnectionManager(config), [config.url]);

    return (
      <JotaiProvider>
        <MultiplayerProviderInner connection={connection}>{children}</MultiplayerProviderInner>
      </JotaiProvider>
    );
  }

  return {
    MultiplayerProvider,
    useMultiplayer,
  };
}
