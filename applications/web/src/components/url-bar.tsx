import { Copy } from "@lab/ui/components/copy";
import { RefreshCw } from "lucide-react";

interface UrlBarProps {
  url: string;
  onRefresh?: () => void;
}

export function UrlBar({ url, onRefresh }: UrlBarProps) {
  return (
    <div className="flex items-center bg-muted border border-border">
      <Copy size="xs" muted className="flex-1 px-2 py-1.5 truncate">
        {url}
      </Copy>
      <button
        type="button"
        onClick={onRefresh}
        className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/70 border-l border-border"
      >
        <RefreshCw className="size-3" />
      </button>
    </div>
  );
}
