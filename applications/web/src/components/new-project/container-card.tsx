import { Copy } from "@lab/ui/components/copy";
import { IconButton } from "@lab/ui/components/icon-button";
import { ActionGroup } from "@lab/ui/components/action-group";
import { Container, Trash2, ChevronRight } from "lucide-react";
import type { Container as ContainerType } from "./types";

interface ContainerCardProps {
  container: ContainerType;
  onClick: () => void;
  onDelete: () => void;
}

export function ContainerCard({ container, onClick, onDelete }: ContainerCardProps) {
  const summary = [
    container.ports.length > 0 &&
      `${container.ports.length} port${container.ports.length > 1 ? "s" : ""}`,
    container.envVars.length > 0 &&
      `${container.envVars.length} env var${container.envVars.length > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <div
      className="flex items-center gap-3 p-3 border border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <Container className="size-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <Copy size="sm" className="truncate block">
          {container.image || "Untitled container"}
        </Copy>
        {summary.length > 0 && (
          <Copy size="xs" muted className="truncate block">
            {summary.join(" · ")}
          </Copy>
        )}
      </div>
      <ActionGroup>
        <IconButton
          icon={<Trash2 />}
          label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
        <ChevronRight className="size-4 text-muted-foreground" />
      </ActionGroup>
    </div>
  );
}
