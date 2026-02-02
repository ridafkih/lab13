"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Review } from "@/components/review";
import { TextAreaGroup } from "@/components/textarea-group";
import { useFileBrowser } from "@/lib/use-file-browser";

type FileBrowserProviderProps = {
  sessionId: string;
  children: ReactNode;
};

function FileBrowserProvider({ sessionId, children }: FileBrowserProviderProps) {
  const searchParams = useSearchParams();
  const fileParam = searchParams.get("file");
  const browser = useFileBrowser(sessionId);
  const initialFileHandledRef = useRef(false);

  useEffect(() => {
    if (!fileParam || browser.state.rootLoading || initialFileHandledRef.current) return;
    initialFileHandledRef.current = true;
    browser.actions.selectFile(fileParam);
  }, [fileParam, browser.state.rootLoading, browser.actions]);

  return (
    <Review.Provider files={[]} onDismiss={() => {}} browser={browser}>
      {children}
    </Review.Provider>
  );
}

function FeedbackForm() {
  return (
    <Review.Feedback>
      <Review.FeedbackHeader>
        <Review.FeedbackLocation />
      </Review.FeedbackHeader>
      <TextAreaGroup.Input placeholder="Your feedback will be submitted to the agent..." rows={2} />
      <TextAreaGroup.Toolbar>
        <TextAreaGroup.Submit />
      </TextAreaGroup.Toolbar>
    </Review.Feedback>
  );
}

function FileBrowserView() {
  return (
    <Review.Frame>
      <Review.MainPanel>
        <Review.Empty />
        <Review.PreviewHeader />
        <Review.PreviewView>
          <Review.PreviewContent />
          <FeedbackForm />
        </Review.PreviewView>
      </Review.MainPanel>
      <Review.SidePanel>
        <Review.Browser>
          <Review.BrowserHeader />
          <Review.BrowserTree />
        </Review.Browser>
      </Review.SidePanel>
    </Review.Frame>
  );
}

type ReviewTabContentProps = {
  sessionId: string;
};

export function ReviewTabContent({ sessionId }: ReviewTabContentProps) {
  return (
    <FileBrowserProvider sessionId={sessionId}>
      <FileBrowserView />
    </FileBrowserProvider>
  );
}
