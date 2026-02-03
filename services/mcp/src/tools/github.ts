import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { config } from "../config/environment";

interface GitHubCredentials {
  token: string;
  username: string;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: { type: "text"; text: string }[];
}

async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
  const response = await fetch(`${config.apiBaseUrl}/internal/github/credentials`);
  if (!response.ok) return null;
  return response.json();
}

async function githubApi<T>(
  token: string,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function notConfiguredError(): ToolResult {
  return errorResult(
    "Error: GitHub is not configured. Please connect your GitHub account in Settings.",
  );
}

function statusIcon(state: string): string {
  if (state === "success") return "+";
  if (state === "failure") return "x";
  return "-";
}

function formatReviews(
  reviews: { user: { login: string }; state: string; body: string }[],
): string[] {
  if (reviews.length === 0) return [];

  const lines = ["## Reviews\n"];
  for (const review of reviews) {
    lines.push(`**${review.user.login}** (${review.state})`);
    if (review.body) lines.push(review.body);
    lines.push("");
  }
  return lines;
}

function formatInlineComments(
  comments: { user: { login: string }; body: string; path: string; line: number | null }[],
): string[] {
  if (comments.length === 0) return [];

  const lines = ["## Inline Comments\n"];
  for (const comment of comments) {
    const location = comment.line ? `${comment.path}:${comment.line}` : comment.path;
    lines.push(`**${comment.user.login}** on \`${location}\``);
    lines.push(comment.body);
    lines.push("");
  }
  return lines;
}

function formatCommitStatuses(
  statuses: { context: string; state: string; description: string }[],
): string[] {
  if (statuses.length === 0) return [];

  const lines = ["### Commit Statuses"];
  for (const s of statuses) {
    lines.push(`[${statusIcon(s.state)}] ${s.context}: ${s.description || s.state}`);
  }
  lines.push("");
  return lines;
}

function formatCheckRuns(
  checkRuns: { name: string; status: string; conclusion: string | null }[],
): string[] {
  if (checkRuns.length === 0) return [];

  const lines = ["### Check Runs"];
  for (const check of checkRuns) {
    const state = check.status === "completed" ? check.conclusion || "completed" : check.status;
    lines.push(`[${statusIcon(state)}] ${check.name}: ${state}`);
  }
  return lines;
}

export function github(server: McpServer, _context: ToolContext) {
  server.registerTool(
    "github_create_pull_request",
    {
      description:
        "Create a pull request on GitHub. The current branch must be pushed to the remote first.",
      inputSchema: {
        owner: z.string().describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Pull request title"),
        body: z.string().optional().describe("Pull request description"),
        head: z.string().describe("The branch containing the changes"),
        base: z.string().describe("The branch to merge into (e.g., 'main')"),
        draft: z.boolean().optional().describe("Create as draft PR"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      const result = await githubApi<{ html_url: string; number: number }>(
        credentials.token,
        "POST",
        `/repos/${args.owner}/${args.repo}/pulls`,
        {
          title: args.title,
          body: args.body,
          head: args.head,
          base: args.base,
          draft: args.draft,
        },
      );

      if (!result.ok) {
        return errorResult(`Error creating PR: ${JSON.stringify(result.data)}`);
      }

      return textResult(`Pull request #${result.data.number} created: ${result.data.html_url}`);
    },
  );

  server.registerTool(
    "github_list_pull_requests",
    {
      description: "List pull requests for a repository",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      const state = args.state || "open";
      const result = await githubApi<
        { number: number; title: string; html_url: string; state: string }[]
      >(credentials.token, "GET", `/repos/${args.owner}/${args.repo}/pulls?state=${state}`);

      if (!result.ok) {
        return errorResult(`Error listing PRs: ${JSON.stringify(result.data)}`);
      }

      if (result.data.length === 0) {
        return textResult("No pull requests found.");
      }

      const list = result.data
        .map((pr) => `#${pr.number}: ${pr.title} (${pr.state})\n  ${pr.html_url}`)
        .join("\n\n");

      return textResult(list);
    },
  );

  server.registerTool(
    "github_create_issue",
    {
      description: "Create an issue on GitHub",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().optional().describe("Issue description"),
        labels: z.array(z.string()).optional().describe("Labels to add"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      const result = await githubApi<{ html_url: string; number: number }>(
        credentials.token,
        "POST",
        `/repos/${args.owner}/${args.repo}/issues`,
        {
          title: args.title,
          body: args.body,
          labels: args.labels,
        },
      );

      if (!result.ok) {
        return errorResult(`Error creating issue: ${JSON.stringify(result.data)}`);
      }

      return textResult(`Issue #${result.data.number} created: ${result.data.html_url}`);
    },
  );

  server.registerTool(
    "github_get_repository",
    {
      description: "Get information about a GitHub repository",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      const result = await githubApi<{
        full_name: string;
        description: string;
        default_branch: string;
        html_url: string;
        private: boolean;
      }>(credentials.token, "GET", `/repos/${args.owner}/${args.repo}`);

      if (!result.ok) {
        return errorResult(`Error fetching repo: ${JSON.stringify(result.data)}`);
      }

      const repo = result.data;
      const visibility = repo.private ? " (private)" : "";
      const description = repo.description || "(no description)";

      return textResult(
        `${repo.full_name}${visibility}\n${description}\nDefault branch: ${repo.default_branch}\n${repo.html_url}`,
      );
    },
  );

  server.registerTool(
    "github_get_pull_request_comments",
    {
      description: "Get review comments and feedback on a pull request",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      const [reviewsResult, commentsResult] = await Promise.all([
        githubApi<{ user: { login: string }; state: string; body: string }[]>(
          credentials.token,
          "GET",
          `/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/reviews`,
        ),
        githubApi<{ user: { login: string }; body: string; path: string; line: number | null }[]>(
          credentials.token,
          "GET",
          `/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/comments`,
        ),
      ]);

      if (!reviewsResult.ok || !commentsResult.ok) {
        const errorData = reviewsResult.ok ? commentsResult.data : reviewsResult.data;
        return errorResult(`Error fetching PR feedback: ${JSON.stringify(errorData)}`);
      }

      const parts = [
        ...formatReviews(reviewsResult.data),
        ...formatInlineComments(commentsResult.data),
      ];

      if (parts.length === 0) {
        return textResult("No reviews or comments on this PR.");
      }

      return textResult(parts.join("\n"));
    },
  );

  server.registerTool(
    "github_get_commit_status",
    {
      description: "Get status checks and CI results for a commit or pull request head",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        ref: z.string().describe("Commit SHA, branch name, or 'pr:NUMBER' for a PR's head"),
      },
    },
    async (args) => {
      const credentials = await getGitHubCredentials();
      if (!credentials) return notConfiguredError();

      let ref = args.ref;

      if (ref.startsWith("pr:")) {
        const prNumber = ref.slice(3);
        const prResult = await githubApi<{ head: { sha: string } }>(
          credentials.token,
          "GET",
          `/repos/${args.owner}/${args.repo}/pulls/${prNumber}`,
        );
        if (!prResult.ok) {
          return errorResult(`Error fetching PR: ${JSON.stringify(prResult.data)}`);
        }
        ref = prResult.data.head.sha;
      }

      const [statusResult, checksResult] = await Promise.all([
        githubApi<{
          state: string;
          statuses: { context: string; state: string; description: string }[];
        }>(credentials.token, "GET", `/repos/${args.owner}/${args.repo}/commits/${ref}/status`),
        githubApi<{
          check_runs: { name: string; status: string; conclusion: string | null }[];
        }>(credentials.token, "GET", `/repos/${args.owner}/${args.repo}/commits/${ref}/check-runs`),
      ]);

      const parts = [`## Status for ${ref.slice(0, 7)}\n`];

      if (statusResult.ok) {
        parts.push(`Overall: **${statusResult.data.state}**\n`);
        parts.push(...formatCommitStatuses(statusResult.data.statuses));
      }

      if (checksResult.ok) {
        parts.push(...formatCheckRuns(checksResult.data.check_runs));
      }

      return textResult(parts.join("\n"));
    },
  );
}
