import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";

export const prefsInput = z
  .object({
    fontSize: z.number().int().min(8).max(40),
    tabSize: z.number().int().min(1).max(16),
    insertSpaces: z.boolean(),
    wordWrap: z.boolean(),
    autoSave: z.boolean(),
    colorMode: z.enum(["system", "light", "dark"]),
  })
  .strict();

export type Prefs = z.infer<typeof prefsInput>;

const shown = {
  fontSize: users.fontSize,
  tabSize: users.tabSize,
  insertSpaces: users.insertSpaces,
  wordWrap: users.wordWrap,
  autoSave: users.autoSave,
  colorMode: users.colorMode,
};

interface Identity {
  id: string;
  email: string;
}

/** The user's row, made the first time they arrive. */
export async function ensureUser(user: Identity): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}

export async function getPrefs(user: Identity): Promise<Prefs> {
  const [row] = await db.select(shown).from(users).where(eq(users.id, user.id));
  if (row) return row;
  await ensureUser(user);
  const [created] = await db
    .select(shown)
    .from(users)
    .where(eq(users.id, user.id));
  return created!;
}

export async function savePrefs(
  user: Identity,
  prefs: Partial<Prefs>,
): Promise<Prefs> {
  await ensureUser(user);
  const [row] = await db
    .update(users)
    .set(prefs)
    .where(eq(users.id, user.id))
    .returning(shown);
  return row!;
}
