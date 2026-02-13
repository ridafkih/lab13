import type {
  ReplaceSessionTaskInput,
  SessionTaskStatus,
} from "../repositories/session-task.repository";

interface ParsedTask {
  externalId: string | null;
  content: string;
  status: SessionTaskStatus;
  priority: number | null;
}

interface ParsedTodoEvent {
  sourceToolName: string;
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

function parseSingleTask(rawTask: unknown): ParsedTask | null {
  const taskRecord = toRecord(rawTask);
  if (!taskRecord) {
    return null;
  }

  const content = extractTaskContent(taskRecord);
  if (!content) {
    return null;
  }

  return {
    externalId: getString(taskRecord.id),
    content,
    status: normalizeStatus(taskRecord.status),
    priority: getNumber(taskRecord.priority),
  };
}

function parseTasks(rawInput: Record<string, unknown>): ParsedTask[] {
  if (Array.isArray(rawInput.todos)) {
    return rawInput.todos
      .map(parseSingleTask)
      .filter((task): task is ParsedTask => task !== null);
  }

  const singleTask = parseSingleTask(rawInput);
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
  if (!(toolName && TODO_TOOL_NAMES.has(toolName.toLowerCase()))) {
    return null;
  }

  const rawInput = toRecord(update.rawInput);
  if (!rawInput) {
    return null;
  }

  return {
    sourceToolName: toolName,
    tasks: parseTasks(rawInput),
  };
}

export function mapToTaskRows(
  parsed: ParsedTodoEvent
): ReplaceSessionTaskInput[] {
  return parsed.tasks.map((task, index) => ({
    externalId: task.externalId,
    content: task.content,
    status: task.status,
    priority: task.priority,
    position: index,
    sourceToolName: parsed.sourceToolName,
  }));
}
