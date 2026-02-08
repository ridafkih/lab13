"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type ResultsToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  count?: number;
};

function ResultsToggle({ expanded, onToggle, label, count }: ResultsToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
    >
      <ChevronRight size={12} className={cn(expanded && "rotate-90")} />
      <span>{label}</span>
      {count !== undefined && <span>({count})</span>}
    </button>
  );
}

export { ResultsToggle };
