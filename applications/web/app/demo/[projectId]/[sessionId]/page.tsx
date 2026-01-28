import { SessionView } from "@/compositions/session-view";
import { SessionSidebar } from "@/compositions/session-sidebar";

const exampleMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Can you help me fix the authentication redirect loop?",
  },
  {
    id: "2",
    role: "assistant" as const,
    content:
      "I'll take a look at the authentication flow. Let me first examine the relevant files.",
    toolCalls: [
      { id: "t1", name: "Read auth/middleware.ts", status: "completed" as const, duration: "1.2s" },
      { id: "t2", name: "Read lib/session.ts", status: "completed" as const, duration: "0.8s" },
    ],
  },
  {
    id: "3",
    role: "assistant" as const,
    content:
      "I found the issue. The redirect logic in middleware.ts is checking for an authenticated session, but the session cookie isn't being set correctly after login. The problem is on line 42 where the cookie options are missing the `path` attribute.",
    toolCalls: [
      {
        id: "t3",
        name: "Edit auth/middleware.ts",
        status: "in_progress" as const,
        duration: "3.4s",
      },
    ],
  },
  {
    id: "4",
    role: "assistant" as const,
    content:
      "I've fixed the issue by adding the correct path attribute to the cookie options. The redirect loop should be resolved now.",
  },
];

const exampleSidebarData = {
  promptEngineers: [
    { id: "1", name: "John Doe" },
    { id: "2", name: "Jane Smith" },
  ],
  createdAt: "2 hours ago",
  branches: [{ id: "1", name: "fix/auth-redirect", prNumber: 142, prUrl: "#" }],
  tasks: [
    { id: "1", title: "Investigate auth flow", completed: true },
    { id: "2", title: "Fix cookie options", completed: true },
    { id: "3", title: "Test redirect behavior", completed: false },
    { id: "4", title: "Update documentation", completed: false },
  ],
};

export default function SessionPage() {
  return (
    <div className="flex h-full">
      <SessionView messages={exampleMessages} />
      <SessionSidebar
        promptEngineers={exampleSidebarData.promptEngineers}
        createdAt={exampleSidebarData.createdAt}
        branches={exampleSidebarData.branches}
        tasks={exampleSidebarData.tasks}
      />
    </div>
  );
}
