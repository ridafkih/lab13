"use client";

import { useState } from "react";
import { UrlBar } from "@/components/url-bar";

type FrameTabContentProps = {
  frameUrl: string | undefined;
};

export function FrameTabContent({ frameUrl }: FrameTabContentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);

  const handleRefresh = () => {
    setIsLoading(true);
    setKey((key) => key + 1);
  };

  if (!frameUrl) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center p-4 bg-bg-muted">
          <div className="text-text-muted text-sm">No container URL available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <UrlBar url={frameUrl} isLoading={isLoading} onRefresh={handleRefresh} />
      <div className="flex grow bg-white">
        <iframe
          key={key}
          src={frameUrl}
          className="flex-1 border-none"
          onLoad={() => setIsLoading(false)}
          title="Frame"
        />
      </div>
    </div>
  );
}
