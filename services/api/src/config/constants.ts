export const LABELS = {
  SESSION: "lab.session",
  PROJECT: "lab.project",
  CONTAINER: "lab.container",
} as const;

export const VOLUMES = {
  WORKSPACES: "lab_session_workspaces",
  WORKSPACES_HOST_PATH: "/var/lib/docker/volumes/lab_session_workspaces/_data",
  OPENCODE_AUTH: "lab_opencode_auth",
  OPENCODE_AUTH_HOST_PATH: "/var/lib/docker/volumes/lab_opencode_auth/_data",
  OPENCODE_AUTH_TARGET: "/root/.local/share/opencode",
  BROWSER_SOCKET_DIR: "/tmp/agent-browser-socket",
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const TIMING = {
  CONTAINER_MONITOR_RETRY_MS: 5000,
  OPENCODE_MONITOR_RETRY_MS: 5000,
  OPENCODE_SYNC_INTERVAL_MS: 30000,
} as const;

export const SESSION_TITLE_LENGTH = 8;
