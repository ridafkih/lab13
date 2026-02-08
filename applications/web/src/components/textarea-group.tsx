"use client";

import { createContext, use, useRef, type ReactNode, type RefObject, type DragEvent } from "react";
import { Send, Square, ChevronDown, Paperclip } from "lucide-react";
import { IconButton } from "./icon-button";
import { AttachmentPreview } from "./attachment-preview";
import { cn } from "@/lib/cn";
import type { Attachment } from "@/lib/use-attachments";

type TextAreaGroupState = {
  attachments?: Attachment[];
};

type TextAreaGroupActions = {
  onSubmit: () => void;
  onAbort?: () => void;
  onAddFiles?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (id: string) => void;
};

type TextAreaGroupMeta = {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  isSending?: boolean;
  isDragging?: boolean;
  dragHandlers?: {
    onDragEnter: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
};

type TextAreaGroupContextValue = {
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta: TextAreaGroupMeta;
};

const TextAreaGroupContext = createContext<TextAreaGroupContextValue | null>(null);

function useTextAreaGroup() {
  const context = use(TextAreaGroupContext);
  if (!context) {
    throw new Error("TextAreaGroup components must be used within TextAreaGroup.Provider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta?: TextAreaGroupMeta;
};

function TextAreaGroupProvider({ children, state, actions, meta = {} }: ProviderProps) {
  return <TextAreaGroupContext value={{ state, actions, meta }}>{children}</TextAreaGroupContext>;
}

type FrameProps = {
  children: ReactNode;
};

function TextAreaGroupFrame({ children }: FrameProps) {
  const { meta } = useTextAreaGroup();

  return (
    <div
      className={cn(
        "flex flex-col bg-bg-muted border border-border overflow-hidden pointer-events-auto relative",
        meta.isDragging && "border-blue-500 border-dashed",
      )}
      {...meta.dragHandlers}
    >
      {meta.isDragging && (
        <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-blue-500 text-sm font-medium">Drop images here</span>
        </div>
      )}
      {children}
    </div>
  );
}

type InputProps = {
  placeholder?: string;
  rows?: number;
};

function extractImagesFromClipboard(clipboardData: DataTransfer): File[] {
  const images: File[] = [];

  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        images.push(file);
      }
    }
  }

  return images;
}

function TextAreaGroupInput({
  placeholder = "Describe a task to provide context to the orchestrator...",
  rows = 5,
}: InputProps) {
  const { actions, meta } = useTextAreaGroup();

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!actions.onAddFiles || !event.clipboardData) return;

    const images = extractImagesFromClipboard(event.clipboardData);
    if (images.length > 0) {
      event.preventDefault();
      actions.onAddFiles(images);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      actions.onSubmit();
    }
  };

  return (
    <textarea
      ref={meta.textareaRef}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none bg-transparent p-3 text-sm placeholder:text-text-muted focus:outline-none"
    />
  );
}

function TextAreaGroupAttachments() {
  const { state, actions } = useTextAreaGroup();

  if (!state.attachments || state.attachments.length === 0) {
    return null;
  }

  return (
    <AttachmentPreview.List>
      {state.attachments.map((attachment) => (
        <AttachmentPreview.Item
          key={attachment.id}
          attachment={attachment}
          onRemove={actions.onRemoveAttachment ?? (() => {})}
        />
      ))}
    </AttachmentPreview.List>
  );
}

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

function TextAreaGroupAttachButton() {
  const { actions } = useTextAreaGroup();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files && files.length > 0 && actions.onAddFiles) {
      actions.onAddFiles(files);
    }
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <IconButton onClick={handleClick} title="Attach images">
        <Paperclip size={14} />
      </IconButton>
    </>
  );
}

type ToolbarProps = {
  children: ReactNode;
};

function TextAreaGroupToolbar({ children }: ToolbarProps) {
  return <div className="flex items-center gap-2 px-3 py-2 border-t border-border">{children}</div>;
}

type ModelGroup = {
  provider: string;
  models: { label: string; value: string }[];
};

type ModelSelectorProps = {
  value: string;
  groups: ModelGroup[];
  onChange: (value: string) => void;
};

function TextAreaGroupModelSelector({ value, groups, onChange }: ModelSelectorProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="appearance-none bg-transparent text-xs text-text-secondary pr-1 cursor-pointer focus:outline-none"
      >
        {groups.map((group) => (
          <optgroup key={group.provider} label={group.provider} className="bg-bg text-text">
            {group.models.map((model) => (
              <option key={model.value} value={model.value} className="bg-bg text-text">
                {model.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
    </div>
  );
}

function TextAreaGroupSubmit() {
  const { actions, meta } = useTextAreaGroup();

  if (meta.isSending) {
    return (
      <IconButton onClick={actions.onAbort} title="Stop generation" className="ml-auto">
        <Square size={14} fill="currentColor" />
      </IconButton>
    );
  }

  return (
    <IconButton onClick={actions.onSubmit} className="ml-auto">
      <Send size={14} />
    </IconButton>
  );
}

const TextAreaGroup = {
  Provider: TextAreaGroupProvider,
  Frame: TextAreaGroupFrame,
  Input: TextAreaGroupInput,
  Attachments: TextAreaGroupAttachments,
  AttachButton: TextAreaGroupAttachButton,
  Toolbar: TextAreaGroupToolbar,
  ModelSelector: TextAreaGroupModelSelector,
  Submit: TextAreaGroupSubmit,
};

export { TextAreaGroup };
