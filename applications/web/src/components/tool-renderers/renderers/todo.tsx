"use client";

import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { tv } from "tailwind-variants";
import { getArray, getString } from "../shared/get-input";
import type { ToolRendererProps } from "../types";

interface TodoItem {
  id?: string;
  content?: string;
  subject?: string;
  status?: "pending" | "in_progress" | "completed";
  priority?: number;
}

const statusIcon = tv({
  base: "size-3 shrink-0",
  variants: {
    status: {
      pending: "text-text-muted",
      in_progress: "text-yellow-500",
      completed: "text-green-500",
    },
  },
});

const statusIcons = {
  pending: Circle,
  in_progress: CircleDot,
  completed: CheckCircle2,
};

function toTodoStatus(value: string): keyof typeof statusIcons {
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
              const Icon = statusIcons[normalizedStatus] ?? Circle;
              return (
                <Icon
                  className={statusIcon({
                    status: normalizedStatus,
                  })}
                />
              );
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
        const Icon = statusIcons[todo.status ?? "pending"] ?? Circle;
        const todoKey =
          todo.id ??
          `${todo.subject ?? todo.content ?? "todo"}-${todo.status ?? "pending"}-${index}`;
        return (
          <div className="flex items-start gap-2 px-4 py-1" key={todoKey}>
            <Icon
              className={statusIcon({ status: todo.status ?? "pending" })}
            />
            <span className="text-xs">{todo.content ?? todo.subject}</span>
          </div>
        );
      })}
      {error && <div className="px-4 py-2 text-red-500 text-xs">{error}</div>}
    </div>
  );
}

export { TodoRenderer };
