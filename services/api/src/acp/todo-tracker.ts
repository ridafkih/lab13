import type {
  ReplaceSessionTaskInput,
  SessionTaskStatus,
  UpsertSessionTaskInput,
} from "../repositories/session-task.repository";

interface ParsedTask {
  externalId: string | null;
  content: string | null;
  status: SessionTaskStatus;
  priority: number | null;
}

interface ParsedTodoEvent {
  sourceToolName: string;
  mode: "replace" | "upsert";
  tasks: ParsedTask[];
}

const TODO_TOOL_NAMES = new Set(["todowrite", "taskcreate", "taskupdate"]);

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeToolName(toolName: string): string {
  const trimmed = toolName.trim().toLowerCase();
  const withoutScope = trimmed.includes("__")
    ? (trimmed.split("__").at(-1) ?? trimmed)
    : trimmed;
  return withoutScope.replace(/[^a-z0-9]/g, "");
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown): SessionTaskStatus {
  if (value === "in_progress" || value === "completed") {
    return value;
  }
  return "pending";
}

function extractTaskContent(input: Record<string, unknown>): string | null {
  const content =
    getString(input.content) ??
    getString(input.subject) ??
    getString(input.description) ??
    getString(input.activeForm);

  return content?.trim() ? content.trim() : null;
}

function parseSingleTask(
  rawTask: unknown,
  options: { requireContent: boolean }
): ParsedTask | null {
  const taskRecord = toRecord(rawTask);
  if (!taskRecord) {
    return null;
  }

  const content = extractTaskContent(taskRecord);
  if (options.requireContent && !content) {
    return null;
  }

  const externalId =
    getString(taskRecord.id) ??
    getString(taskRecord.taskId) ??
    getString(taskRecord.task_id);

  if (!(externalId || content)) {
    return null;
  }

  return {
    externalId,
    content,
    status: normalizeStatus(taskRecord.status),
    priority: getNumber(taskRecord.priority),
  };
}

function parseTasks(
  rawInput: Record<string, unknown>,
  options: { requireContent: boolean }
): ParsedTask[] {
  if (Array.isArray(rawInput.todos)) {
    return rawInput.todos
      .map((task) => parseSingleTask(task, options))
      .filter((task): task is ParsedTask => task !== null);
  }

  const singleTask = parseSingleTask(rawInput, options);
  return singleTask ? [singleTask] : [];
}

function getToolName(update: Record<string, unknown>): string | null {
  const meta = toRecord(update._meta);
  const claudeCode = meta ? toRecord(meta.claudeCode) : null;
  const toolName = getString(claudeCode?.toolName ?? update.toolName);
  return toolName;
}

export function extractTodoEvent(envelope: unknown): ParsedTodoEvent | null {
  const envelopeRecord = toRecord(envelope);
  if (!envelopeRecord) {
    return null;
  }

  if (envelopeRecord.method !== "session/update") {
    return null;
  }

  const params = toRecord(envelopeRecord.params);
  const update = params ? toRecord(params.update) : null;
  if (!update) {
    return null;
  }

  const toolName = getToolName(update);
  const normalizedToolName = toolName ? normalizeToolName(toolName) : null;
  if (!(normalizedToolName && TODO_TOOL_NAMES.has(normalizedToolName))) {
    return null;
  }

  const rawInput = toRecord(update.rawInput);
  if (!rawInput) {
    return null;
  }

  const mode = normalizedToolName === "todowrite" ? "replace" : "upsert";
  const requireContent = normalizedToolName !== "taskupdate";

  return {
    sourceToolName: toolName ?? normalizedToolName,
    mode,
    tasks: parseTasks(rawInput, { requireContent }),
  };
}

export function mapToReplaceTaskRows(
  parsed: ParsedTodoEvent
): ReplaceSessionTaskInput[] {
  return parsed.tasks.map((task, index) => ({
    externalId: task.externalId,
    content: task.content ?? "",
    status: task.status,
    priority: task.priority,
    position: index,
    sourceToolName: parsed.sourceToolName,
  }));
}

export function mapToUpsertTaskRows(
  parsed: ParsedTodoEvent
): UpsertSessionTaskInput[] {
  return parsed.tasks.map((task) => ({
    externalId: task.externalId,
    content: task.content,
    status: task.status,
    priority: task.priority,
    sourceToolName: parsed.sourceToolName,
  }));
}
