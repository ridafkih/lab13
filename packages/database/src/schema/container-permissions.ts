import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { containers } from "./containers.ts";

export const containerPermissions = pgTable("container_permissions", {
  containerId: uuid("container_id")
    .primaryKey()
    .references(() => containers.id, { onDelete: "cascade" }),
  permissions: text("permissions").array().notNull(),
});

export type ContainerPermission = typeof containerPermissions.$inferSelect;
export type NewContainerPermission = typeof containerPermissions.$inferInsert;
