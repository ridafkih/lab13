import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { containers } from "./containers.ts";

export const containerEnvVars = pgTable("container_env_vars", {
  id: uuid("id").primaryKey().defaultRandom(),
  containerId: uuid("container_id")
    .notNull()
    .references(() => containers.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
});

export type ContainerEnvVar = typeof containerEnvVars.$inferSelect;
export type NewContainerEnvVar = typeof containerEnvVars.$inferInsert;
