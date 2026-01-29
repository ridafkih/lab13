import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects.ts";

export const containers = pgTable("containers", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  image: text("image").notNull(),
  hostname: text("hostname"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Container = typeof containers.$inferSelect;
export type NewContainer = typeof containers.$inferInsert;
