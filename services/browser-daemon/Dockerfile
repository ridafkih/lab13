FROM mcr.microsoft.com/playwright:v1.58.0-noble

RUN npm install -g bun

WORKDIR /app

COPY package.json ./
COPY services/browser-daemon/package.json ./services/browser-daemon/
COPY packages/browser-protocol/package.json ./packages/browser-protocol/
COPY packages/database/package.json ./packages/database/

RUN bun install --filter @lab/browser-daemon

RUN chmod +x /app/node_modules/.bun/agent-browser@*/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || \
  chmod +x /app/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || true

COPY services/browser-daemon/src ./services/browser-daemon/src
COPY packages/browser-protocol/src ./packages/browser-protocol/src
COPY packages/database/src ./packages/database/src

WORKDIR /app/services/browser-daemon

ENV AGENT_BROWSER_SOCKET_DIR=/tmp/agent-browser-socket
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_SESSION=default
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN mkdir -p /root/.cache && ln -s /ms-playwright /root/.cache/ms-playwright

EXPOSE 9223

CMD ["bun", "run", "start"]
