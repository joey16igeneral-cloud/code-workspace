import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** One row per Gateway user (`user.id`), made on first sight, with their editor preferences. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fontSize: integer("font_size").notNull().default(14),
  tabSize: integer("tab_size").notNull().default(2),
  insertSpaces: integer("insert_spaces", { mode: "boolean" })
    .notNull()
    .default(true),
  wordWrap: integer("word_wrap", { mode: "boolean" }).notNull().default(false),
  autoSave: integer("auto_save", { mode: "boolean" }).notNull().default(false),
  colorMode: text("color_mode", { enum: ["system", "light", "dark"] })
    .notNull()
    .default("system"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
    openedAt: integer("opened_at").notNull(),
    /** JSON array of open file paths. */
    openTabs: text("open_tabs").notNull().default("[]"),
    activePath: text("active_path"),
  },
  (t) => [index("projects_owner_opened").on(t.ownerId, t.openedAt)],
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    kind: text("kind", { enum: ["file", "folder"] }).notNull(),
    content: text("content").notNull().default(""),
    size: integer("size").notNull().default(0),
    /** Goes up by one on every write; a save names the version it started from. */
    version: integer("version").notNull().default(1),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("entries_project_path").on(t.projectId, t.path)],
);
