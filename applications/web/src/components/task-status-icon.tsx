"use client";

import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";

export type TaskStatus = "pending" | "in_progress" | "completed";

const iconColor = tv({
  variants: {
    status: {
      pending: "text-text-muted",
      in_progress: "text-yellow-500",
      completed: "text-green-500",
    },
  },
});

interface TaskStatusIconProps {
  status: TaskStatus;
  size?: number;
  className?: string;
}

function PendingGlyph() {
  return (
    <circle
      cx="8"
      cy="8"
      fill="none"
      r="5.75"
      stroke="currentColor"
      strokeDasharray="1.1 2.2"
      strokeLinecap="round"
      strokeWidth="1.2"
    />
  );
}

function OuterCircle() {
  return (
    <circle
      cx="8"
      cy="8"
      fill="none"
      r="5.75"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  );
}

function InProgressGlyph() {
  return (
    <>
      <OuterCircle />
      <path d="M8 4.5a3.5 3.5 0 1 0 0 7V4.5Z" fill="currentColor" />
    </>
  );
}

function CompletedGlyph() {
  return (
    <>
      <OuterCircle />
      <circle cx="8" cy="8" fill="currentColor" r="3.5" />
    </>
  );
}

export function TaskStatusIcon({
  status,
  size = 12,
  className,
}: TaskStatusIconProps) {
  const colorClass = iconColor({ status });

  return (
    <svg
      aria-label={`Task status: ${status}`}
      className={cn("shrink-0", colorClass, className)}
      fill="none"
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <title>{`Task status: ${status}`}</title>
      {status === "pending" && <PendingGlyph />}
      {status === "in_progress" && <InProgressGlyph />}
      {status === "completed" && <CompletedGlyph />}
    </svg>
  );
}
