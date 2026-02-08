"use client";

import { Circle, CircleDot, CheckCircle2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { getString, getArray } from "../shared";
import type { ToolRendererProps } from "../types";

type TodoItem = {
  id?: string;
  content?: string;
  subject?: string;
  status?: "pending" | "in_progress" | "completed";
  priority?: number;
};

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

function TodoRenderer({ input, error }: ToolRendererProps) {
  const todos = getArray<TodoItem>(input, "todos") ?? [];
  const subject = getString(input, "subject");
  const description = getString(input, "description");
  const inputStatus = getString(input, "status");

  const isSingleTodo = todos.length === 0 && (subject || description);

  const title =
    todos.length > 0
      ? todos.some((t) => t.status === "in_progress")
        ? "Updating plan"
        : "Creating plan"
      : isSingleTodo
        ? inputStatus === "completed"
          ? "Task completed"
          : "Task update"
        : "Plan";

  return (
    <div className="flex flex-col bg-bg-muted">
      <div className="px-4 py-2 text-xs text-text-secondary">{title}</div>
      {isSingleTodo && (
        <div className="px-4 py-1 flex items-start gap-2">
          {inputStatus &&
            (() => {
              const Icon = statusIcons[inputStatus as keyof typeof statusIcons] ?? Circle;
              return (
                <Icon
                  className={statusIcon({
                    status: (inputStatus as keyof typeof statusIcons) ?? "pending",
                  })}
                />
              );
            })()}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs">{subject}</span>
            {description && <span className="text-xs text-text-muted">{description}</span>}
          </div>
        </div>
      )}
      {todos.map((todo, index) => {
        const Icon = statusIcons[todo.status ?? "pending"] ?? Circle;
        const todoKey =
          todo.id ??
          `${todo.subject ?? todo.content ?? "todo"}-${todo.status ?? "pending"}-${index}`;
        return (
          <div key={todoKey} className="px-4 py-1 flex items-start gap-2">
            <Icon className={statusIcon({ status: todo.status ?? "pending" })} />
            <span className="text-xs">{todo.content ?? todo.subject}</span>
          </div>
        );
      })}
      {error && <div className="px-4 py-2 text-xs text-red-500">{error}</div>}
    </div>
  );
}

export { TodoRenderer };
