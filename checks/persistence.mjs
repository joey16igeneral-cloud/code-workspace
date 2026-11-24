import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, newEntry, treeItem, tab, setText, save, fileId } from "./lib.mjs";

const runtime = await startRuntime();
try {
  let ctx = await runtime.context("member");
  let page = await ctx.newPage();
  const projectId = await createProject(page, "Field notes");
  await newEntry(page, "file", "notes/monday.md");
  await setText(page, "# Monday\n\nVisited the north site.\n");
  await save(page, "notes/monday.md");
  const id = await fileId(page, "notes/monday.md");
  await newEntry(page, "folder", "photos");
  await page.goto("/settings");
  await page.getByTestId("pref-font-size").fill("16");
  await page.getByTestId("save-prefs").click();
  await expect(page.getByText("Preferences saved")).toBeVisible();
  await ctx.close();

  await runtime.restart();

  const list = await runtime.fetch("/api/projects", { role: "member" });
  expect(await list.text()).toContain("Field notes");
  const tree = await (await runtime.fetch(`/api/projects/${projectId}`, { role: "member" })).text();
  expect(tree).toContain("notes/monday.md");
  expect(tree).toContain("photos");
  expect(await (await runtime.fetch(`/api/files/${id}`, { role: "member" })).text()).toBe("# Monday\n\nVisited the north site.\n");

  ctx = await runtime.context("member");
  page = await ctx.newPage();
  await page.goto(`/p/${projectId}`);
  await expect(treeItem(page, "photos")).toBeVisible();
  await expect(tab(page, "notes/monday.md")).toHaveAttribute("data-active", "true");
  await page.goto("/settings");
  await expect(page.getByTestId("pref-font-size")).toHaveValue("16");
} finally {
  await runtime.close();
}
console.log("persistence: ok");
