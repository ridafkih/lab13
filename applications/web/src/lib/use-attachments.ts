"use client";

import { useState, useCallback, useRef, type DragEvent } from "react";
import { validateImageFile, fileToBase64, isImageFile } from "./file-utils";

export interface Attachment {
  id: string;
  file: File;
  preview: string;
  status: "loading" | "ready" | "error";
  error?: string;
}

interface UseAttachmentsReturn {
  attachments: Attachment[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  isDragging: boolean;
  dragHandlers: {
    onDragEnter: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createLoadingAttachment(file: File): Attachment {
  return {
    id: generateId(),
    file,
    preview: "",
    status: "loading",
  };
}

function updateAttachmentById(
  attachments: Attachment[],
  targetId: string,
  updates: Partial<Attachment>,
): Attachment[] {
  return attachments.map((attachment) =>
    attachment.id === targetId ? { ...attachment, ...updates } : attachment,
  );
}

async function processAttachment(
  attachment: Attachment,
  onUpdate: (id: string, updates: Partial<Attachment>) => void,
): Promise<void> {
  const validation = validateImageFile(attachment.file);

  if (!validation.valid) {
    onUpdate(attachment.id, { status: "error", error: validation.error });
    return;
  }

  try {
    const preview = await fileToBase64(attachment.file);
    onUpdate(attachment.id, { preview, status: "ready" });
  } catch {
    onUpdate(attachment.id, { status: "error", error: "Failed to load image" });
  }
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const updateAttachment = useCallback((id: string, updates: Partial<Attachment>) => {
    setAttachments((currentAttachments) => updateAttachmentById(currentAttachments, id, updates));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter(isImageFile);
      if (imageFiles.length === 0) return;

      const newAttachments = imageFiles.map(createLoadingAttachment);
      setAttachments((currentAttachments) => [...currentAttachments, ...newAttachments]);

      await Promise.all(
        newAttachments.map((attachment) => processAttachment(attachment, updateAttachment)),
      );
    },
    [updateAttachment],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== id),
    );
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const { files } = event.dataTransfer;
      if (files && files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles],
  );

  return {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
