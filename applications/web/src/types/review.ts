export type ReviewFileStatus = "pending" | "dismissed";

export type ReviewFileChangeType = "modified" | "created" | "deleted";

export interface ReviewableFile {
  path: string;
  originalContent: string;
  currentContent: string;
  status: ReviewFileStatus;
  changeType: ReviewFileChangeType;
}
