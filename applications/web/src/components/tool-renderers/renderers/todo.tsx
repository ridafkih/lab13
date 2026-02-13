"use client";

import { type TaskStatus, TaskStatusIcon } from "@/components/task-status-icon";
import { getArray, getString } from "../shared/get-input";
import type { ToolRendererProps } from "../types";

interface TodoItem {
  id?: string;
  content?: string;
  subject?: string;
  status?: TaskStatus;
  priority?: number;
}

function toTodoStatus(value: string): TaskStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  return "pending";
}

function TodoRenderer({ input, error }: ToolRendererProps) {
  const todos = getArray<TodoItem>(input, "todos") ?? [];
  const subject = getString(input, "subject");
  const description = getString(input, "description");
  const inputStatus = getString(input, "status");

  const isSingleTodo = todos.length === 0 && (subject || description);

  const getTitle = () => {
    if (todos.length > 0) {
      return todos.some((t) => t.status === "in_progress")
        ? "Updating plan"
        : "Creating plan";
    }
    if (isSingleTodo) {
      return inputStatus === "completed" ? "Task completed" : "Task update";
    }
    return "Plan";
  };
  const title = getTitle();

  return (
    <div className="flex flex-col bg-bg-muted">
      <div className="px-4 py-2 text-text-secondary text-xs">{title}</div>
      {isSingleTodo && (
        <div className="flex items-start gap-2 px-4 py-1">
          {inputStatus &&
            (() => {
              const normalizedStatus = toTodoStatus(inputStatus);
              return <TaskStatusIcon status={normalizedStatus} />;
            })()}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs">{subject}</span>
            {description && (
              <span className="text-text-muted text-xs">{description}</span>
            )}
          </div>
        </div>
      )}
      {todos.map((todo, index) => {
        const status = toTodoStatus(todo.status ?? "pending");
        const todoKey =
          todo.id ??
          `${todo.subject ?? todo.content ?? "todo"}-${todo.status ?? "pending"}-${index}`;
        return (
          <div className="flex items-start gap-2 px-4 py-1" key={todoKey}>
            <TaskStatusIcon status={status} />
            <span className="text-xs">{todo.content ?? todo.subject}</span>
          </div>
        );
      })}
      {error && <div className="px-4 py-2 text-red-500 text-xs">{error}</div>}
    </div>
  );
}

export { TodoRenderer };
