FROM ghcr.io/anomalyco/opencode

USER root

RUN apk add --no-cache nodejs npm gcompat git github-cli && \
  npm install -g agent-browser@latest

# Patch daemon.js to prevent spawning local daemons
# Replace startDaemon function to exit immediately
RUN sed -i 's/export async function startDaemon/export async function startDaemon(options) { process.exit(1); } function _startDaemon/' \
  /usr/local/lib/node_modules/agent-browser/dist/daemon.js

RUN AGENT_BIN=$(which agent-browser) && \
  mv "$AGENT_BIN" "${AGENT_BIN}.real" && \
  printf '#!/bin/sh\n\
if echo "$PWD" | grep -q "^/workspaces/"; then\n\
  SESSION=$(echo "$PWD" | cut -d"/" -f3)\n\
  export AGENT_BROWSER_SESSION="$SESSION"\n\
  CDP_FILE="${AGENT_BROWSER_SOCKET_DIR}/${SESSION}.cdp"\n\
  if [ -f "$CDP_FILE" ]; then\n\
    CDP_PORT=$(cat "$CDP_FILE")\n\
    export AGENT_BROWSER_CDP_URL="ws://${BROWSER_DAEMON_HOST:-browser}:${CDP_PORT}"\n\
  fi\n\
fi\n\
exec agent-browser.real "$@"\n' > "$AGENT_BIN" && \
  chmod +x "$AGENT_BIN"

RUN git config --system credential.helper '!f() { echo "password=${GH_TOKEN}"; }; f'
