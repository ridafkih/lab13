"use client";

import { createContext, use, useState, type ReactNode } from "react";
import useSWR from "swr";
import { FormInput } from "@/components/form-input";
import {
  getGitHubSettings,
  saveGitHubSettings,
  disconnectGitHub,
  getGitHubAuthUrl,
} from "@/lib/api";

type Edits = {
  pat?: string;
  username?: string;
  authorName?: string;
  authorEmail?: string;
  attributeAgent?: boolean;
};

interface GitHubSettingsState {
  pat: string;
  username: string;
  authorName: string;
  authorEmail: string;
  attributeAgent: boolean;
  hasPatConfigured: boolean;
  isOAuthConnected: boolean;
  oauthConnectedAt: string | null;
  saving: boolean;
  disconnecting: boolean;
  error: string | null;
  success: boolean;
}

interface GitHubSettingsActions {
  updateField: <K extends keyof Edits>(field: K) => (value: Edits[K]) => void;
  save: () => Promise<void>;
  disconnect: () => Promise<void>;
  connectWithGitHub: () => void;
}

interface GitHubSettingsContextValue {
  state: GitHubSettingsState;
  actions: GitHubSettingsActions;
}

const GitHubSettingsContext = createContext<GitHubSettingsContextValue | null>(null);

function useGitHubSettingsContext() {
  const context = use(GitHubSettingsContext);
  if (!context)
    throw new Error("GitHubSettings components must be used within GitHubSettings.Provider");
  return context;
}

function GitHubSettingsProvider({ children }: { children: ReactNode }) {
  const { data: settings, mutate } = useSWR("github-settings", getGitHubSettings);

  const [edits, setEdits] = useState<Edits>({});
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const state: GitHubSettingsState = {
    pat: edits.pat ?? "",
    username: edits.username ?? settings?.username ?? "",
    authorName: edits.authorName ?? settings?.authorName ?? "",
    authorEmail: edits.authorEmail ?? settings?.authorEmail ?? "",
    attributeAgent: edits.attributeAgent ?? settings?.attributeAgent ?? true,
    hasPatConfigured: settings?.hasPatConfigured ?? false,
    isOAuthConnected: settings?.isOAuthConnected ?? false,
    oauthConnectedAt: settings?.oauthConnectedAt ?? null,
    saving,
    disconnecting,
    error,
    success,
  };

  const actions: GitHubSettingsActions = {
    updateField: (field) => (value) => {
      setEdits((current) => ({ ...current, [field]: value }));
    },
    save: async () => {
      setSaving(true);
      setError(null);
      setSuccess(false);

      try {
        await saveGitHubSettings({
          pat: state.pat || undefined,
          username: state.username || undefined,
          authorName: state.authorName || undefined,
          authorEmail: state.authorEmail || undefined,
          attributeAgent: state.attributeAgent,
        });
        setEdits({});
        mutate();
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setSaving(false);
      }
    },
    disconnect: async () => {
      setDisconnecting(true);
      setError(null);

      try {
        await disconnectGitHub();
        mutate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to disconnect");
      } finally {
        setDisconnecting(false);
      }
    },
    connectWithGitHub: () => {
      window.location.href = getGitHubAuthUrl();
    },
  };

  return <GitHubSettingsContext value={{ state, actions }}>{children}</GitHubSettingsContext>;
}

function GitHubSettingsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-1 max-w-sm">{children}</div>
    </div>
  );
}

function GitHubSettingsField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function GitHubOAuthConnect() {
  const { state, actions } = useGitHubSettingsContext();

  if (state.isOAuthConnected) {
    return (
      <GitHubSettingsField>
        <FormInput.Label>GitHub Account</FormInput.Label>
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-xs text-text-secondary">
            Connected as <span className="font-medium text-text-primary">{state.username}</span>
          </span>
          <button
            type="button"
            onClick={actions.disconnect}
            disabled={state.disconnecting}
            className="text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {state.disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </GitHubSettingsField>
    );
  }

  return (
    <GitHubSettingsField>
      <FormInput.Label>GitHub Account</FormInput.Label>
      <button
        type="button"
        onClick={actions.connectWithGitHub}
        className="px-2 py-1 text-xs border border-border text-text hover:bg-bg-muted"
      >
        Connect with GitHub
      </button>
    </GitHubSettingsField>
  );
}

function GitHubSettingsDivider() {
  const { state } = useGitHubSettingsContext();

  if (state.isOAuthConnected) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-xs text-text-muted">or use a Personal Access Token</span>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}

function GitHubSettingsPat() {
  const { state, actions } = useGitHubSettingsContext();

  if (state.isOAuthConnected) {
    return null;
  }

  return (
    <GitHubSettingsField>
      <FormInput.Label>Personal Access Token</FormInput.Label>
      <FormInput.Password
        value={state.pat}
        onChange={(event) => actions.updateField("pat")(event.target.value)}
        placeholder={
          state.hasPatConfigured ? "Token configured (enter new to replace)" : "ghp_xxxxxxxxxxxx"
        }
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsUsername() {
  const { state, actions } = useGitHubSettingsContext();

  if (state.isOAuthConnected) {
    return null;
  }

  return (
    <GitHubSettingsField>
      <FormInput.Label>Username</FormInput.Label>
      <FormInput.Text
        value={state.username}
        onChange={(event) => actions.updateField("username")(event.target.value)}
        placeholder="your-github-username"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAuthorName() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Commit Author Name</FormInput.Label>
      <FormInput.Text
        value={state.authorName}
        onChange={(event) => actions.updateField("authorName")(event.target.value)}
        placeholder="Your Name"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAuthorEmail() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <GitHubSettingsField>
      <FormInput.Label>Commit Author Email</FormInput.Label>
      <FormInput.Text
        type="email"
        value={state.authorEmail}
        onChange={(event) => actions.updateField("authorEmail")(event.target.value)}
        placeholder="my-agent@example.com"
      />
    </GitHubSettingsField>
  );
}

function GitHubSettingsAttributeAgent() {
  const { state, actions } = useGitHubSettingsContext();
  return (
    <FormInput.Checkbox
      checked={state.attributeAgent}
      onChange={actions.updateField("attributeAgent")}
      label="Attribute agent to commits"
    />
  );
}

function GitHubSettingsMessages() {
  const { state } = useGitHubSettingsContext();
  return (
    <>
      {state.error && <FormInput.Error>{state.error}</FormInput.Error>}
      {state.success && <FormInput.Success>Settings saved</FormInput.Success>}
    </>
  );
}

function GitHubSettingsSaveButton() {
  const { state, actions } = useGitHubSettingsContext();

  if (state.isOAuthConnected) {
    return null;
  }

  return (
    <FormInput.Submit onClick={actions.save} loading={state.saving} loadingText="Saving...">
      Save
    </FormInput.Submit>
  );
}

const GitHubSettings = {
  Provider: GitHubSettingsProvider,
  Panel: GitHubSettingsPanel,
  Field: GitHubSettingsField,
  OAuthConnect: GitHubOAuthConnect,
  Divider: GitHubSettingsDivider,
  Pat: GitHubSettingsPat,
  Username: GitHubSettingsUsername,
  AuthorName: GitHubSettingsAuthorName,
  AuthorEmail: GitHubSettingsAuthorEmail,
  AttributeAgent: GitHubSettingsAttributeAgent,
  Messages: GitHubSettingsMessages,
  SaveButton: GitHubSettingsSaveButton,
};

export function GitHubTab() {
  const { isLoading, error } = useSWR("github-settings", getGitHubSettings);

  if (isLoading) {
    return (
      <GitHubSettings.Panel>
        <span className="text-xs text-text-muted">Loading...</span>
      </GitHubSettings.Panel>
    );
  }

  if (error) {
    return (
      <GitHubSettings.Panel>
        <FormInput.Error>Failed to load settings</FormInput.Error>
      </GitHubSettings.Panel>
    );
  }

  return (
    <GitHubSettings.Provider>
      <GitHubSettings.Panel>
        <GitHubSettings.OAuthConnect />
        <GitHubSettings.Divider />
        <GitHubSettings.Pat />
        <GitHubSettings.Username />
        <GitHubSettings.AuthorName />
        <GitHubSettings.AuthorEmail />
        <GitHubSettings.AttributeAgent />
        <GitHubSettings.Messages />
        <GitHubSettings.SaveButton />
      </GitHubSettings.Panel>
    </GitHubSettings.Provider>
  );
}
