"use client";

import { useState, useRef, useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Check, ExternalLink } from "lucide-react";
import { FormInput } from "@/components/form-input";
import { Button } from "@/components/button";
import { createClient } from "@/lib/use-session-client";

type AuthMethod = {
  type: "oauth" | "api";
  label: string;
};

type ProviderData = {
  id: string;
  name: string;
  env: string[];
  isConnected: boolean;
  authMethods: AuthMethod[];
};

async function fetchProviderData(providerId: string): Promise<ProviderData> {
  const client = createClient();
  const [providersResponse, authMethodsResponse] = await Promise.all([
    client.provider.list(),
    client.provider.auth(),
  ]);

  const providersData = providersResponse.data;
  const authMethodsData = authMethodsResponse.data;

  if (!providersData || !authMethodsData) {
    throw new Error("Failed to fetch provider data");
  }

  const provider = providersData.all.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error("Provider not found");
  }

  return {
    id: provider.id,
    name: provider.name,
    env: provider.env,
    isConnected: providersData.connected.includes(provider.id),
    authMethods: authMethodsData[provider.id] ?? [],
  };
}

function hasApiKeyEnvVar(env: string[]): boolean {
  return env.some(
    (envVar) =>
      envVar.includes("API_KEY") ||
      envVar.includes("APIKEY") ||
      envVar.includes("TOKEN") ||
      envVar.includes("SECRET") ||
      envVar.includes("ACCESS_KEY") ||
      envVar.includes("CREDENTIALS") ||
      envVar.includes("SERVICE_KEY"),
  );
}

function hasEndpointEnvVar(env: string[]): boolean {
  return env.some(
    (envVar) => envVar.includes("ENDPOINT") || envVar.includes("_URL") || envVar.includes("BASE"),
  );
}

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-2 max-w-sm">{children}</div>
    </div>
  );
}

type ApiKeyFormProps = {
  providerId: string;
  refetch: () => void;
};

function ApiKeyForm({ providerId, refetch }: ApiKeyFormProps) {
  const { mutate } = useSWRConfig();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const client = createClient();
      await client.auth.set({
        providerID: providerId,
        auth: {
          type: "api",
          key: apiKey,
        },
      });
      await client.global.dispose();
      setApiKey("");
      refetch();
      mutate("providers-list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <FormInput.Label>API Key</FormInput.Label>
      <div className="flex gap-1">
        <div className="flex-1">
          <FormInput.Password
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Enter API key"
          />
        </div>
        <FormInput.Submit
          onClick={handleSave}
          disabled={!apiKey.trim()}
          loading={saving}
          loadingText="Saving..."
        >
          Save
        </FormInput.Submit>
      </div>
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

type EndpointFormProps = {
  providerId: string;
  refetch: () => void;
};

function EndpointForm({ providerId, refetch }: EndpointFormProps) {
  const [endpoint, setEndpoint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!endpoint.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const client = createClient();
      await client.config.update({
        config: {
          provider: {
            [providerId]: {
              options: {
                baseURL: endpoint,
              },
            },
          },
        },
      });
      setEndpoint("");
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save endpoint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <FormInput.Label>Endpoint URL</FormInput.Label>
      <div className="flex gap-1">
        <div className="flex-1">
          <FormInput.Text
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://api.example.com"
          />
        </div>
        <FormInput.Submit
          onClick={handleSave}
          disabled={!endpoint.trim()}
          loading={saving}
          loadingText="Saving..."
        >
          Save
        </FormInput.Submit>
      </div>
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

type OAuthButtonProps = {
  providerId: string;
  authMethods: AuthMethod[];
  refetch: () => void;
};

function OAuthButton({ providerId, authMethods, refetch }: OAuthButtonProps) {
  const { mutate } = useSWRConfig();
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const oauthMethodIndex = authMethods.findIndex((method) => method.type === "oauth");
  const oauthMethod = oauthMethodIndex !== -1 ? authMethods[oauthMethodIndex] : null;

  if (!oauthMethod) {
    return null;
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  };

  const refreshAll = () => {
    refetch();
    mutate("providers-list");
  };

  const startPolling = () => {
    let attempts = 0;
    const maxAttempts = 60;

    setPolling(true);

    pollingRef.current = setInterval(async () => {
      attempts++;

      try {
        const client = createClient();
        const response = await client.provider.list();
        const isConnected = response.data?.connected.includes(providerId);

        if (isConnected) {
          stopPolling();
          refreshAll();
          return;
        }
      } catch {
        // Continue polling on error
      }

      if (attempts >= maxAttempts) {
        stopPolling();
      }
    }, 2000);
  };

  const handleOAuthClick = async () => {
    setError(null);

    try {
      const client = createClient();
      const response = await client.provider.oauth.authorize({
        providerID: providerId,
        method: oauthMethodIndex,
      });

      const oauthData = response.data;
      if (!oauthData) {
        throw new Error("Failed to start OAuth flow");
      }

      window.open(oauthData.url, "_blank");

      if (oauthData.method === "auto") {
        startPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth flow");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {polling ? (
        <Button onClick={stopPolling} variant="ghost">
          Cancel
        </Button>
      ) : (
        <Button onClick={handleOAuthClick}>
          <ExternalLink size={12} />
          {oauthMethod.label}
        </Button>
      )}
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

type ProviderDetailProps = {
  providerId: string;
};

export function ProviderDetail({ providerId }: ProviderDetailProps) {
  const { data, error, isLoading, mutate } = useSWR(`provider-${providerId}`, () =>
    fetchProviderData(providerId),
  );

  if (isLoading) {
    return (
      <SettingsPanel>
        <span className="text-xs text-text-muted">Loading...</span>
      </SettingsPanel>
    );
  }

  if (error || !data) {
    return (
      <SettingsPanel>
        <FormInput.Error>Failed to load provider</FormInput.Error>
      </SettingsPanel>
    );
  }

  const hasOAuth = data.authMethods.some((method) => method.type === "oauth");
  const hasApiKey =
    data.authMethods.some((method) => method.type === "api") ||
    (data.authMethods.length === 0 && hasApiKeyEnvVar(data.env));
  const hasEndpoint = hasEndpointEnvVar(data.env);
  const hasMultipleMethods = hasOAuth && hasApiKey;

  return (
    <SettingsPanel>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text">{data.name}</span>
        {data.isConnected && (
          <span className="flex items-center gap-1 text-xs text-green-500">
            <Check size={12} />
            Connected
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hasOAuth && (
          <OAuthButton providerId={data.id} authMethods={data.authMethods} refetch={mutate} />
        )}
        {hasMultipleMethods && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}
        {hasApiKey && <ApiKeyForm providerId={data.id} refetch={mutate} />}
        {hasEndpoint && <EndpointForm providerId={data.id} refetch={mutate} />}
      </div>
    </SettingsPanel>
  );
}
