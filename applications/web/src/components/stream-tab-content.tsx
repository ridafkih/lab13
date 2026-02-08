"use client";

import { BrowserStreamView } from "@/components/browser-stream";

export function StreamTabContent() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 flex items-center justify-center p-4 bg-bg-muted">
        <div className="w-full max-w-4xl">
          <BrowserStreamView />
        </div>
      </div>
    </div>
  );
}
