"use client";

import { useState } from "react";
import { SessionView } from "@/compositions/session-view";
import { SessionSidebar } from "@/compositions/session-sidebar";
import type { ReviewableFile } from "@/types/review";

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
  branches: [{ id: "1", name: "fix/auth-redirect", prNumber: 142, prUrl: "#" }],
  tasks: [
    { id: "1", title: "Investigate auth flow", completed: true },
    { id: "2", title: "Fix cookie options", completed: true },
    { id: "3", title: "Test redirect behavior", completed: false },
    { id: "4", title: "Update documentation", completed: false },
  ],
  links: [
    {
      id: "1",
      title: "Dev Server",
      url: "http://container-aa64a5d6--5173.a22f2acf.localhost:10002/",
    },
    {
      id: "2",
      title: "Storybook",
      url: "http://container-aa64a5d6--6006.a22f2acf.localhost:10002/",
    },
  ],
  containers: [
    { id: "1", name: "web", status: "running" as const },
    { id: "2", name: "api", status: "running" as const },
    { id: "3", name: "db", status: "running" as const },
    { id: "4", name: "redis", status: "stopped" as const },
  ],
  logSources: [
    {
      id: "otel",
      name: "OTel",
      logs: [
        {
          id: "o1",
          timestamp: "12:33:55",
          level: "info" as const,
          message: "trace_id=abc123 span=auth.validate",
        },
        {
          id: "o2",
          timestamp: "12:34:01",
          level: "info" as const,
          message: "trace_id=abc123 span=db.query duration=45ms",
        },
        {
          id: "o3",
          timestamp: "12:34:05",
          level: "error" as const,
          message: "trace_id=abc123 span=auth.middleware error=invalid_token",
        },
      ],
    },
    {
      id: "browser",
      name: "Browser",
      logs: [
        { id: "b1", timestamp: "12:34:01", level: "info" as const, message: "App mounted" },
        {
          id: "b2",
          timestamp: "12:34:02",
          level: "warn" as const,
          message: "Deprecation warning: useEffect cleanup",
        },
        {
          id: "b3",
          timestamp: "12:34:05",
          level: "error" as const,
          message: "Failed to fetch /api/auth",
        },
      ],
    },
    {
      id: "web",
      name: "web",
      logs: [
        {
          id: "w1",
          timestamp: "12:34:00",
          level: "info" as const,
          message: "Server listening on :5173",
        },
        { id: "w2", timestamp: "12:34:03", level: "info" as const, message: "HMR connected" },
      ],
    },
    {
      id: "api",
      name: "api",
      logs: [
        {
          id: "a1",
          timestamp: "12:33:58",
          level: "info" as const,
          message: "Connected to database",
        },
        {
          id: "a2",
          timestamp: "12:34:05",
          level: "error" as const,
          message: "Auth middleware error: invalid token",
        },
      ],
    },
  ],
};

const initialReviewFiles: ReviewableFile[] = [
  {
    path: "auth/middleware.ts",
    changeType: "modified",
    status: "pending",
    originalContent: `import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getSession(request);

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next();
  response.cookies.set('session', session?.id || '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return response;
}`,
    currentContent: `import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getSession(request);

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next();
  response.cookies.set('session', session?.id || '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return response;
}`,
  },
  {
    path: "lib/session.ts",
    changeType: "modified",
    status: "pending",
    originalContent: `export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export async function getSession(request: Request): Promise<Session | null> {
  const cookie = request.headers.get('cookie');
  // ... session logic
  return null;
}`,
    currentContent: `export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export async function getSession(request: Request): Promise<Session | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  const sessionId = parseCookie(cookie, 'session');
  if (!sessionId) return null;

  // Validate session from store
  const session = await sessionStore.get(sessionId);
  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

function parseCookie(cookie: string, name: string): string | null {
  const match = cookie.match(new RegExp(\`(^| )\${name}=([^;]+)\`));
  return match ? match[2] : null;
}`,
  },
  {
    path: "components/auth-guard.tsx",
    changeType: "created",
    status: "pending",
    originalContent: "",
    currentContent: `"use client";

import { useSession } from "@/hooks/use-session";
import { redirect } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!session) {
    redirect("/login");
  }

  return <>{children}</>;
}`,
  },
];

export default function SessionPage() {
  const [reviewFiles, setReviewFiles] = useState<ReviewableFile[]>(initialReviewFiles);

  const handleDismissFile = (path: string) => {
    setReviewFiles((files) =>
      files.map((f) => (f.path === path ? { ...f, status: "dismissed" as const } : f)),
    );
  };
  return (
    <div className="flex h-full">
      <SessionView
        messages={exampleMessages}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
      <SessionSidebar
        promptEngineers={exampleSidebarData.promptEngineers}
        branches={exampleSidebarData.branches}
        tasks={exampleSidebarData.tasks}
        links={exampleSidebarData.links}
        containers={exampleSidebarData.containers}
        logSources={exampleSidebarData.logSources}
        reviewFiles={reviewFiles}
        onDismissFile={handleDismissFile}
      />
    </div>
  );
}
