FROM oven/bun:1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates bash git wget \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN npx -y @zed-industries/claude-code-acp@0.16.1 --version || true

RUN useradd -m -s /bin/bash agent \
    && mkdir -p /workspaces && chown agent:agent /workspaces

WORKDIR /app
COPY services/acp-proxy/package.json ./
COPY services/acp-proxy/src ./src

COPY services/acp-proxy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
