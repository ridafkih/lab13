import { tv } from "tailwind-variants";
import { RotateCw, ExternalLink, Loader2 } from "lucide-react";
import { IconButton } from "./icon-button";

const urlBar = tv({
  slots: {
    container: "flex items-center gap-2 h-8 px-3 border-b border-border shrink-0",
    urlDisplay: "flex-1 min-w-0 text-xs text-text-muted truncate",
    actions: "flex items-center gap-2",
    spinIcon: "size-4 animate-spin",
    icon: "size-4",
  },
});

type UrlBarProps = {
  url: string;
  isLoading?: boolean;
  onRefresh: () => void;
  onOpenExternal?: () => void;
};

export function UrlBar({ url, isLoading, onRefresh, onOpenExternal }: UrlBarProps) {
  const styles = urlBar();

  const handleOpenExternal = () => {
    if (onOpenExternal) {
      onOpenExternal();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={styles.container()}>
      <div className={styles.urlDisplay()}>{url}</div>
      <div className={styles.actions()}>
        <IconButton onClick={onRefresh} disabled={isLoading} aria-label="Refresh">
          {isLoading ? (
            <Loader2 className={styles.spinIcon()} />
          ) : (
            <RotateCw className={styles.icon()} />
          )}
        </IconButton>
        <IconButton onClick={handleOpenExternal} aria-label="Open in new tab">
          <ExternalLink className={styles.icon()} />
        </IconButton>
      </div>
    </div>
  );
}
