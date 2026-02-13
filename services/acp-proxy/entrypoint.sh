#!/bin/sh
set -e

# Fix workspace ownership for volumes mounted as root
chown -R agent:agent /workspaces 2>/dev/null || true

# Write OAuth credentials if provided
if [ -n "$CLAUDE_CODE_OAUTH_CREDENTIALS" ]; then
  mkdir -p /home/agent/.claude
  printf '%s' "$CLAUDE_CODE_OAUTH_CREDENTIALS" > /home/agent/.claude/.credentials.json
  chown -R agent:agent /home/agent/.claude
fi

# Write agent settings (deny Bash tool)
mkdir -p /home/agent/.claude
printf '%s' '{"permissions":{"deny":["Bash"]}}' > /home/agent/.claude/settings.json
chown -R agent:agent /home/agent/.claude

exec su agent -s /bin/sh -c 'cd /app && bun run src/index.ts'
