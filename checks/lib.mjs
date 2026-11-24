import { expect, pasteIntoEditor } from "/home/user/oss-new/control/runtime/index.mjs";

export const MOD = "Control";

/** Create a project from the start page and return its id. */
export async function createProject(page, name) {
  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name-input").fill(name);
  await Promise.all([
    page.waitForURL(/\/p\/[^/]+$/),
    page.getByTestId("project-name-submit").click(),
  ]);
  await expect(page.getByTestId("project-title")).toHaveText(name);
  return new URL(page.url()).pathname.split("/").pop();
}

export async function newEntry(page, kind, path) {
  await page.getByTestId(kind === "folder" ? "new-folder" : "new-file").click();
  await page.getByTestId("path-input").fill(path);
  await page.getByTestId("path-submit").click();
  await expect(page.getByTestId("path-input")).toHaveCount(0);
  await expect(treeItem(page, path)).toBeVisible();
}

export function treeItem(page, path) {
  return page.locator(`[data-testid="tree-item"][data-path="${path}"]`);
}

export function tab(page, path) {
  return page.locator(`[data-testid="editor-tab"][data-path="${path}"]`);
}

export function editor(page) {
  return page.getByTestId("editor").locator(".cm-content");
}

/** Replace the active file's text through the editor's own paste handler. */
export async function setText(page, text) {
  await pasteIntoEditor(page, editor(page), text);
}

export async function save(page, path) {
  await page.keyboard.press(`${MOD}+s`);
  await expect(tab(page, path)).toHaveAttribute("data-dirty", "false");
}

export async function fileId(page, path) {
  const id = await treeItem(page, path).getAttribute("data-id");
  expect(id).toBeTruthy();
  return id;
}

export async function entryMenu(page, path, item) {
  await treeItem(page, path).getByTestId("entry-menu").click();
  await page.getByRole("menuitem", { name: item }).click();
}
