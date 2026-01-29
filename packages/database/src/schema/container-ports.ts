import { integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { containers } from "./containers.ts";

export const containerPorts = pgTable("container_ports", {
  id: uuid("id").primaryKey().defaultRandom(),
  containerId: uuid("container_id")
    .notNull()
    .references(() => containers.id, { onDelete: "cascade" }),
  port: integer("port").notNull(),
});

export type ContainerPort = typeof containerPorts.$inferSelect;
export type NewContainerPort = typeof containerPorts.$inferInsert;
