import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const acpReplayCheckpoints = pgTable("acp_replay_checkpoints", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  parserVersion: integer("parser_version").notNull(),
  lastSequence: integer("last_sequence").notNull(),
  replayState: jsonb("replay_state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AcpReplayCheckpoint = typeof acpReplayCheckpoints.$inferSelect;
export type NewAcpReplayCheckpoint = typeof acpReplayCheckpoints.$inferInsert;
