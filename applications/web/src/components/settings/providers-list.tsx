"use client";

import { createContext, use, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle } from "lucide-react";
import useSWR from "swr";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/use-session-client";

type Provider = {
  id: string;
  name: string;
};

type ProvidersListData = {
  providers: Provider[];
  connected: string[];
};

interface ProvidersListContextValue {
  state: {
    providers: Provider[];
    connected: string[];
    isLoading: boolean;
    error: Error | null;
  };
  actions: {
    refetch: () => void;
  };
}

const ProvidersListContext = createContext<ProvidersListContextValue | null>(null);

function useProvidersList() {
  const context = use(ProvidersListContext);
  if (!context) {
    throw new Error("ProvidersList components must be used within ProvidersList.Provider");
  }
  return context;
}

async function fetchProvidersList(): Promise<ProvidersListData> {
  const client = createClient();
  const response = await client.provider.list();

  const providersData = response.data;
  if (!providersData) {
    throw new Error("Failed to fetch providers");
  }

  const providers = providersData.all
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    providers,
    connected: providersData.connected,
  };
}

function ProvidersListProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR("providers-list", fetchProvidersList);

  const contextValue: ProvidersListContextValue = {
    state: {
      providers: data?.providers ?? [],
      connected: data?.connected ?? [],
      isLoading,
      error: error ?? null,
    },
    actions: {
      refetch: mutate,
    },
  };

  return <ProvidersListContext value={contextValue}>{children}</ProvidersListContext>;
}

function ProvidersListRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function ProvidersListHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <span className="text-xs text-text-secondary">{children}</span>
    </div>
  );
}

function ProvidersListLoading() {
  const { state } = useProvidersList();
  if (!state.isLoading) return null;
  return <span className="px-2 py-1.5 text-xs text-text-muted">Loading...</span>;
}

function ProvidersListError() {
  const { state } = useProvidersList();
  if (!state.error) return null;
  return <span className="px-2 py-1.5 text-xs text-red-500">Failed to load</span>;
}

function ProvidersListEmpty() {
  const { state } = useProvidersList();
  if (state.isLoading || state.error || state.providers.length > 0) return null;
  return <span className="px-2 py-1.5 text-xs text-text-muted">No providers available</span>;
}

const itemStyles = tv({
  base: "flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-bg-hover",
  variants: {
    active: {
      true: "bg-bg-muted",
      false: "",
    },
  },
});

function ProvidersListItem({ provider }: { provider: Provider }) {
  const pathname = usePathname();
  const { state } = useProvidersList();

  const isConnected = state.connected.includes(provider.id);
  const href = `/settings/providers/${provider.id}`;
  const isActive = pathname === href;

  return (
    <Link href={href} className={itemStyles({ active: isActive })}>
      <Circle
        size={6}
        className={cn(
          "shrink-0",
          isConnected ? "text-green-500 fill-green-500" : "text-text-muted",
        )}
      />
      <span className="text-text truncate">{provider.name}</span>
    </Link>
  );
}

function ProvidersListItems() {
  const { state } = useProvidersList();
  if (state.isLoading || state.error || state.providers.length === 0) return null;

  return (
    <div className="flex flex-col">
      {state.providers.map((provider) => (
        <ProvidersListItem key={provider.id} provider={provider} />
      ))}
    </div>
  );
}

function ProvidersListView() {
  return (
    <ProvidersListProvider>
      <ProvidersListRoot>
        <ProvidersListHeader>Providers</ProvidersListHeader>
        <ProvidersListLoading />
        <ProvidersListError />
        <ProvidersListEmpty />
        <ProvidersListItems />
      </ProvidersListRoot>
    </ProvidersListProvider>
  );
}

const ProvidersList = {
  Provider: ProvidersListProvider,
  Root: ProvidersListRoot,
  Header: ProvidersListHeader,
  Loading: ProvidersListLoading,
  Error: ProvidersListError,
  Empty: ProvidersListEmpty,
  Item: ProvidersListItem,
  Items: ProvidersListItems,
  View: ProvidersListView,
};

export { ProvidersList };
