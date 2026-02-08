"use client";

import type { ReactNode } from "react";

function CenteredLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto pb-12">
      <div className="min-h-full flex flex-col items-center px-4">
        <div className="w-full max-w-2xl flex flex-col">{children}</div>
      </div>
    </div>
  );
}

function CenteredLayoutHero({ children }: { children: ReactNode }) {
  return <div className="min-h-[50vh] flex items-end pb-4">{children}</div>;
}

function CenteredLayoutContent({ children }: { children: ReactNode }) {
  return <div className="pb-8">{children}</div>;
}

export const CenteredLayout = {
  Root: CenteredLayoutRoot,
  Hero: CenteredLayoutHero,
  Content: CenteredLayoutContent,
};
