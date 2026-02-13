import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const sessionTasks = pgTable(
  "session_tasks",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    content: text("content").notNull(),
    status: text("status").notNull().default("pending"),
    priority: integer("priority"),
    position: integer("position").notNull(),
    sourceToolName: text("source_tool_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("session_tasks_session_idx").on(table.sessionId),
    index("session_tasks_session_position_idx").on(
      table.sessionId,
      table.position
    ),
  ]
);

export type SessionTask = typeof sessionTasks.$inferSelect;
export type NewSessionTask = typeof sessionTasks.$inferInsert;
