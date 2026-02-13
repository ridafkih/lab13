import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const agentEvents = pgTable(
  "agent_events",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventData: jsonb("event_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_events_session_idx").on(table.sessionId),
    index("agent_events_session_seq_idx").on(table.sessionId, table.sequence),
  ]
);

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
