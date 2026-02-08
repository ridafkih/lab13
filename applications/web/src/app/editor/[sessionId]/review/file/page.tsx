"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageFrame, Header } from "@/components/layout-primitives";
import { useSessionTitle } from "@/lib/use-session-title";
import { useSessionContext } from "../../layout";

type FileReviewPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default function FileReviewPage({ params }: FileReviewPageProps) {
  const { sessionId } = use(params);
  const searchParams = useSearchParams();
  const filePath = searchParams.get("path");
  const { session, project } = useSessionContext();
  const displayTitle = useSessionTitle(sessionId, session?.title);

  if (!filePath) {
    return (
      <PageFrame>
        <Header>
          <Link
            href={`/editor/${sessionId}/review`}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
          >
            <ArrowLeft size={12} />
            Back to review
          </Link>
        </Header>
        <div className="flex-1 flex items-center justify-center text-text-muted">
          No file path specified
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Header>
        <Link
          href={`/editor/${sessionId}/review`}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} />
          Back to review
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text font-mono text-xs truncate">{filePath}</span>
      </Header>
      <div className="flex-1 flex items-center justify-center text-text-muted">
        File review for: {filePath}
        <br />
        (Session: {displayTitle ?? sessionId}, Project: {project?.name})
      </div>
    </PageFrame>
  );
}
