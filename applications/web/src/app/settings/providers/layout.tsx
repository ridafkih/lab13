"use client";

import type { ReactNode } from "react";
import { ProvidersList } from "@/components/settings/providers-list";

type ProvidersLayoutProps = {
  children: ReactNode;
};

export default function ProvidersLayout({ children }: ProvidersLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 min-w-60 border-r border-border overflow-y-auto">
        <ProvidersList.View />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
