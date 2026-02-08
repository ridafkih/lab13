"use client";

import { X, Loader2, AlertCircle } from "lucide-react";
import type { Attachment } from "@/lib/use-attachments";
import { cn } from "@/lib/cn";

interface ListProps {
  children: React.ReactNode;
}

function AttachmentPreviewList({ children }: ListProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-3 scrollbar-thin scrollbar-thumb-border">
      {children}
    </div>
  );
}

interface ItemProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
}

function AttachmentPreviewItem({ attachment, onRemove }: ItemProps) {
  const isLoading = attachment.status === "loading";
  const isError = attachment.status === "error";

  return (
    <div
      className={cn(
        "relative shrink-0 w-16 h-16 bg-bg-muted border border-border overflow-hidden group",
        isError && "border-red-500/50",
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-muted">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-muted p-1">
          <AlertCircle size={14} className="text-red-500 mb-0.5" />
          <span className="text-[10px] text-red-500 text-center truncate w-full">Error</span>
        </div>
      )}

      {!isLoading && !isError && attachment.preview && (
        <img
          src={attachment.preview}
          alt={attachment.file.name}
          className="w-full h-full object-cover"
        />
      )}

      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        title="Remove attachment"
      >
        <X size={12} />
      </button>

      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-white truncate block">{attachment.file.name}</span>
      </div>
    </div>
  );
}

export const AttachmentPreview = {
  List: AttachmentPreviewList,
  Item: AttachmentPreviewItem,
};
