"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { getToolRenderer } from "@/components/tool-renderers";
import type { ToolRendererProps } from "@/components/tool-renderers";

type MockTool = {
  name: string;
  description: string;
  examples: Array<{
    label: string;
    props: ToolRendererProps;
  }>;
};

const mockTools: MockTool[] = [
  {
    name: "Bash",
    description: "Command execution with description and expandable output",
    examples: [
      {
        label: "Completed command",
        props: {
          tool: "Bash",
          input: {
            command: "git status",
            description: "Check current git status",
          },
          output: `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   src/components/message-part.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        src/components/tool-renderers/

no changes added to commit (use "git add" and/or "git commit -a")`,
          status: "completed",
        },
      },
      {
        label: "Running command",
        props: {
          tool: "Bash",
          input: {
            command: "npm run build",
            description: "Build the project",
          },
          output: null,
          status: "running",
        },
      },
      {
        label: "Error state",
        props: {
          tool: "Bash",
          input: {
            command: "npm run nonexistent",
          },
          error: 'Error: Command failed with exit code 1\nnpm ERR! Missing script: "nonexistent"',
          status: "error",
        },
      },
    ],
  },
  {
    name: "Read",
    description: "File reading with syntax highlighting based on extension",
    examples: [
      {
        label: "TypeScript file",
        props: {
          tool: "Read",
          input: {
            file_path: "/Users/dev/project/src/utils/helpers.ts",
          },
          output: `import { clsx } from "clsx";

export function cn(...inputs: string[]) {
  return clsx(inputs);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}`,
          status: "completed",
        },
      },
      {
        label: "Partial read with offset/limit",
        props: {
          tool: "Read",
          input: {
            file_path: "/Users/dev/project/package.json",
            offset: 10,
            limit: 20,
          },
          output: `  "dependencies": {
    "react": "^19.0.0",
    "next": "^15.0.0"
  }`,
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Write",
    description: "File creation with syntax highlighting",
    examples: [
      {
        label: "New TypeScript file",
        props: {
          tool: "Write",
          input: {
            file_path: "/Users/dev/project/src/hooks/use-toggle.ts",
            content: `import { useState } from "react";

export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);

  const toggle = () => {
    setValue((prev) => !prev);
  };

  return [value, toggle] as const;
}`,
          },
          output: "File written successfully",
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Edit",
    description: "File editing with side-by-side diff view",
    examples: [
      {
        label: "Simple edit",
        props: {
          tool: "Edit",
          input: {
            file_path: "/Users/dev/project/src/config.ts",
            old_string: `export const config = {
  apiUrl: "http://localhost:3000",
  debug: true,
};`,
            new_string: `export const config = {
  apiUrl: process.env.API_URL ?? "http://localhost:3000",
  debug: process.env.NODE_ENV !== "production",
};`,
          },
          output: "File edited successfully",
          status: "completed",
        },
      },
      {
        label: "Replace all",
        props: {
          tool: "Edit",
          input: {
            file_path: "/Users/dev/project/src/utils.ts",
            old_string: "console.log",
            new_string: "logger.debug",
            replace_all: true,
          },
          output: "Replaced 5 occurrences",
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Grep",
    description: "Pattern search with collapsible results",
    examples: [
      {
        label: "Search results",
        props: {
          tool: "Grep",
          input: {
            pattern: "useEffect",
            path: "/Users/dev/project/src",
            glob: "*.tsx",
          },
          output: `src/components/Chat.tsx:15:  useEffect(() => {
src/components/Chat.tsx:42:  useEffect(() => {
src/hooks/useSession.ts:8:  useEffect(() => {
src/hooks/useTheme.ts:12:  useEffect(() => {
src/pages/Home.tsx:28:  useEffect(() => {`,
          status: "completed",
        },
      },
      {
        label: "No results",
        props: {
          tool: "Grep",
          input: {
            pattern: "nonexistentPattern123",
            path: "/Users/dev/project",
          },
          output: "",
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Glob",
    description: "File pattern matching with collapsible file list",
    examples: [
      {
        label: "Find TypeScript files",
        props: {
          tool: "Glob",
          input: {
            pattern: "**/*.tsx",
            path: "/Users/dev/project/src",
          },
          output: `src/components/Chat.tsx
src/components/Message.tsx
src/components/Sidebar.tsx
src/components/Header.tsx
src/pages/Home.tsx
src/pages/Settings.tsx
src/pages/Profile.tsx`,
          status: "completed",
        },
      },
    ],
  },
  {
    name: "WebFetch",
    description: "URL fetching with expandable response",
    examples: [
      {
        label: "Fetch web page",
        props: {
          tool: "WebFetch",
          input: {
            url: "https://api.github.com/repos/anthropics/claude-code",
            prompt: "Extract the repository description and star count",
          },
          output: `Repository: claude-code
Description: Claude's official CLI tool for software engineering
Stars: 15,234
Language: TypeScript
Last updated: 2024-01-15`,
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Task",
    description: "Subagent task with prompt and markdown output",
    examples: [
      {
        label: "Explore codebase",
        props: {
          tool: "Task",
          input: {
            description: "Explore auth implementation",
            prompt:
              "Find all files related to authentication and summarize how the auth flow works in this codebase.",
            subagent_type: "Explore",
          },
          output: `Found 5 files related to authentication:
- src/auth/provider.tsx: Main auth context provider
- src/auth/hooks.ts: useAuth, useSession hooks
- src/auth/types.ts: User, Session types
- src/middleware.ts: Auth middleware for protected routes
- src/api/auth/route.ts: Auth API endpoints

The auth flow uses JWT tokens stored in httpOnly cookies.`,
          status: "completed",
        },
      },
      {
        label: "Running task",
        props: {
          tool: "Task",
          input: {
            description: "Analyze performance",
            prompt: "Profile the main page load time and identify bottlenecks",
            subagent_type: "general-purpose",
          },
          output: null,
          status: "running",
        },
      },
    ],
  },
  {
    name: "TaskCreate",
    description: "Todo/task management with status indicators",
    examples: [
      {
        label: "Create task",
        props: {
          tool: "TaskCreate",
          input: {
            subject: "Implement user authentication",
            description: "Add login/logout functionality with JWT tokens",
            status: "pending",
          },
          output: "Task created",
          status: "completed",
        },
      },
      {
        label: "Update task status",
        props: {
          tool: "TaskUpdate",
          input: {
            taskId: "1",
            status: "in_progress",
          },
          output: "Task updated",
          status: "completed",
        },
      },
      {
        label: "Multiple todos",
        props: {
          tool: "TodoWrite",
          input: {
            todos: [
              { id: "1", content: "Set up project structure", status: "completed" },
              { id: "2", content: "Implement core features", status: "in_progress" },
              { id: "3", content: "Write tests", status: "pending" },
              { id: "4", content: "Deploy to production", status: "pending" },
            ],
          },
          output: "Todos updated",
          status: "completed",
        },
      },
    ],
  },
  {
    name: "Unknown",
    description: "Fallback renderer for unknown tools",
    examples: [
      {
        label: "Unknown tool",
        props: {
          tool: "CustomTool",
          input: {
            action: "process",
            target: "/path/to/file",
            options: { verbose: true, force: false },
          },
          output: "Processing complete. 42 items processed.",
          status: "completed",
        },
      },
    ],
  },
];

function ToolPreviewCard({ tool }: { tool: MockTool }) {
  const [expandedExample, setExpandedExample] = useState<number>(0);

  return (
    <div className="border border-border overflow-hidden">
      <div className="px-4 py-2 bg-bg-muted border-b border-border">
        <h3 className="text-xs font-medium">{tool.name}</h3>
        <p className="text-xs text-text-muted mt-0.5">{tool.description}</p>
      </div>
      <div className="flex border-b border-border">
        {tool.examples.map((example, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setExpandedExample(index)}
            className={cn(
              "px-3 py-1.5 text-xs",
              expandedExample === index
                ? "bg-bg text-text"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-hover",
            )}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div className="bg-bg">
        {(() => {
          const example = tool.examples[expandedExample]!;
          const Renderer = getToolRenderer(example!.props.tool);
          return <Renderer {...example!.props} />;
        })()}
      </div>
    </div>
  );
}

export default function ToolsPreviewPage() {
  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-sm font-medium mb-1">Tool Renderers Preview</h1>
        <p className="text-xs text-text-muted mb-6">
          Preview all tool-specific renderers with sample data. Click tabs to see different states.
        </p>
        <div className="flex flex-col gap-4">
          {mockTools.map((tool) => (
            <ToolPreviewCard key={tool.name} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}
