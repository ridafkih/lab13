import { File, FilePlus, FileX } from "lucide-react";

export type FileChangeType = "modified" | "created" | "deleted";

export const fileChangeTypeIcons = {
  modified: File,
  created: FilePlus,
  deleted: FileX,
} as const;

export const fileChangeTypeColors = {
  modified: "text-warning",
  created: "text-success",
  deleted: "text-destructive",
} as const;
