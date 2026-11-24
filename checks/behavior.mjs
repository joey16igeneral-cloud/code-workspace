import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { MOD, createProject, newEntry, treeItem, tab, editor, setText, save, fileId, entryMenu } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const ctx = await runtime.context("member");
  const page = await ctx.newPage();

  // ---- F001: start page, projects, tree
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("empty-projects")).toBeVisible();

  const scratchId = await createProject(page, "Scratch");
  await expect(page.getByTestId("empty-project")).toBeVisible();
  const projectId = await createProject(page, "Billing service");
  await expect(page.getByTestId("empty-project")).toBeVisible();

  // Most recently opened first.
  await page.goto("/");
  await expect(page.getByTestId("project-row").first()).toContainText("Billing service");
  await page.getByTestId("project-row").filter({ hasText: "Scratch" }).getByTestId("project-link").click();
  await expect(page.getByTestId("project-title")).toHaveText("Scratch");
  await page.goto("/");
  await expect(page.getByTestId("project-row").first()).toContainText("Scratch");

  // Rename then delete (with confirmation) a project.
  const scratchRow = page.getByTestId("project-row").filter({ hasText: "Scratch" });
  await scratchRow.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByTestId("project-name-input").fill("Old notes");
  await page.getByTestId("project-name-submit").click();
  const notesRow = page.getByTestId("project-row").filter({ hasText: "Old notes" });
  await expect(notesRow).toBeVisible();
  await notesRow.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByTestId("project-row").filter({ hasText: "Old notes" })).toHaveCount(0);
  expect((await runtime.fetch(`/api/projects/${scratchId}`, { role: "member" })).status).toBe(404);

  await page.getByTestId("project-row").filter({ hasText: "Billing service" }).getByTestId("project-link").click();
  await expect(page.getByTestId("project-title")).toHaveText("Billing service");

  // Files and folders at any level; parents appear.
  await newEntry(page, "file", "src/invoice.ts");
  await expect(treeItem(page, "src")).toHaveAttribute("data-kind", "folder");
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-active", "true");
  await newEntry(page, "folder", "docs");
  await treeItem(page, "docs").click();
  await expect(page.getByTestId("empty-folder")).toBeVisible();

  // Duplicate path is refused.
  await page.getByTestId("new-file").click();
  await page.getByTestId("path-input").fill("src/invoice.ts");
  await page.getByTestId("path-submit").click();
  await expect(page.getByTestId("path-error")).toBeVisible();
  await page.keyboard.press("Escape");

  // ---- F002: editor
  await tab(page, "src/invoice.ts").click();
  await setText(page, "export function billingTotal(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0); // TODO tax\n}\n");
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-dirty", "true");
  await expect(page.getByTestId("editor").locator(".cm-lineNumbers")).toBeVisible();
  await expect(page.getByTestId("editor").locator(".cm-line span").first()).toBeVisible();
  await save(page, "src/invoice.ts");
  const invoiceId = await fileId(page, "src/invoice.ts");
  let res = await runtime.fetch(`/api/files/${invoiceId}`, { role: "member" });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("billingTotal(lines)");

  // Bracket matching, word completion, in-file find.
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type("const total = billi");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("billingTotal");
  await page.keyboard.press("Escape");
  await page.keyboard.type("ngTotal(x)");
  await expect(page.getByTestId("editor").locator(".cm-matchingBracket").first()).toBeVisible();
  await page.keyboard.press(`${MOD}+f`);
  await expect(page.getByTestId("editor").locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");

  // Markdown file with preview; switching tabs keeps unsaved edits.
  await newEntry(page, "file", "README.md");
  await setText(page, "# Billing service\n\nComputes invoice totals. TODO add currency.\n");
  await tab(page, "src/invoice.ts").click();
  await expect(editor(page)).toContainText("const total = billingTotal(x)");
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-dirty", "true");
  await tab(page, "README.md").click();
  await expect(editor(page)).toContainText("Computes invoice totals.");
  await save(page, "README.md");
  await page.getByTestId("toggle-preview").click();
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "Billing service" })).toBeVisible();
  await page.getByTestId("toggle-preview").click();

  // Closing a dirty tab asks first.
  await tab(page, "src/invoice.ts").getByTestId("close-tab").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-dirty", "true");
  await tab(page, "src/invoice.ts").click();
  await page.getByTestId("save-file").click();
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-dirty", "false");

  // A stale copy cannot overwrite.
  const other = await ctx.newPage();
  await other.goto(`/p/${projectId}`);
  await treeItem(other, "README.md").click();
  await expect(editor(other)).toContainText("Computes invoice totals.");
  await tab(page, "README.md").click();
  await setText(page, "# Billing service\n\nComputes invoice totals and taxes. TODO add currency.\n");
  await save(page, "README.md");
  await setText(other, "# Stale edit\n");
  await other.keyboard.press(`${MOD}+s`);
  await expect(other.getByTestId("save-conflict")).toBeVisible();
  res = await runtime.fetch(`/api/files/${await fileId(page, "README.md")}`, { role: "member" });
  expect(await res.text()).toContain("and taxes");
  await other.close();

  // Rename / move by editing the path.
  await newEntry(page, "file", "src/util/money.ts");
  await setText(page, "export const cents = (n) => Math.round(n * 100); // TODO rounding\n");
  await save(page, "src/util/money.ts");
  await entryMenu(page, "src/util", "Rename or move");
  await page.getByTestId("path-input").fill("src/lib");
  await page.getByTestId("path-submit").click();
  await expect(treeItem(page, "src/lib/money.ts")).toBeVisible();
  await expect(treeItem(page, "src/util")).toHaveCount(0);
  await expect(tab(page, "src/lib/money.ts")).toBeVisible();

  // Delete a folder with its contents.
  await newEntry(page, "file", "tmp/scratch.txt");
  await entryMenu(page, "tmp", "Delete");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(treeItem(page, "tmp")).toHaveCount(0);
  await expect(treeItem(page, "tmp/scratch.txt")).toHaveCount(0);

  // Tabs and the active file are remembered.
  await tab(page, "README.md").click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(tab(page, "README.md")).toHaveAttribute("data-active", "true");
  await expect(tab(page, "src/invoice.ts")).toBeVisible();
  await expect(tab(page, "src/lib/money.ts")).toBeVisible();

  // ---- F003: quick open and command palette
  await page.getByTestId("editor").click();
  await page.keyboard.press(`${MOD}+p`);
  await page.getByTestId("quick-open-input").fill("mone");
  await expect(page.getByTestId("quick-open-item")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(tab(page, "src/lib/money.ts")).toHaveAttribute("data-active", "true");

  await page.keyboard.press(`${MOD}+Shift+p`);
  await page.getByTestId("command-input").fill("toggle explorer");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sidebar")).toHaveCount(0);
  await page.getByTestId("command-palette-button").click();
  await page.getByTestId("command-input").fill("toggle explorer");
  await page.getByTestId("command-item").first().click();
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await page.keyboard.press(`${MOD}+Shift+p`);
  await page.getByTestId("command-input").fill("new file");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("path-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("quick-open-button").click();
  await page.getByTestId("quick-open-input").fill("invoice");
  await page.getByTestId("quick-open-item").first().click();
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-active", "true");

  // ---- F004: search and replace across files
  await page.keyboard.press(`${MOD}+Shift+p`);
  await page.getByTestId("command-input").fill("search");
  await page.keyboard.press("Enter");
  await page.getByTestId("search-input").fill("TODO");
  await expect(page.getByTestId("search-summary")).toHaveText("3 results in 3 files");
  await expect(page.getByTestId("search-file")).toHaveCount(3);
  await page.getByTestId("search-include").fill("src/**");
  await expect(page.getByTestId("search-summary")).toHaveText("2 results in 2 files");
  await page.getByTestId("search-include").fill("");
  await page.getByTestId("search-case").click();
  await page.getByTestId("search-input").fill("todo");
  await expect(page.getByTestId("search-empty")).toBeVisible();
  await page.getByTestId("search-case").click();
  await page.getByTestId("search-regex").click();
  await page.getByTestId("search-input").fill("TODO (tax|add)");
  await expect(page.getByTestId("search-summary")).toHaveText("2 results in 2 files");
  await page.getByTestId("search-input").fill("([");
  await expect(page.getByTestId("search-error")).toBeVisible();
  await page.getByTestId("search-regex").click();
  await page.getByTestId("search-word").click();
  await page.getByTestId("search-input").fill("line");
  await expect(page.getByTestId("search-summary")).toHaveText("2 results in 1 file");
  await page.getByTestId("search-word").click();
  await page.getByTestId("search-input").fill("TODO");
  const readmeResult = page.locator('[data-testid="search-file"][data-path="README.md"]').getByTestId("search-result");
  await expect(readmeResult).toContainText("3");
  await readmeResult.first().click();
  await expect(tab(page, "README.md")).toHaveAttribute("data-active", "true");
  await page.getByTestId("replace-input").fill("NOTE");
  await page.locator('[data-testid="search-file"][data-path="README.md"]').getByTestId("replace-file").click();
  await expect(page.getByTestId("search-summary")).toHaveText("2 results in 2 files");
  await page.getByTestId("replace-all").click();
  await expect(page.getByTestId("search-empty")).toBeVisible();
  res = await runtime.fetch(`/api/files/${invoiceId}`, { role: "member" });
  const invoiceText = await res.text();
  expect(invoiceText).toContain("// NOTE tax");
  expect(invoiceText).not.toContain("TODO");
  await expect(editor(page)).toContainText("NOTE add currency");

  // ---- F006: preferences
  await page.goto("/settings");
  await runtime.assertBackLink(page);
  await page.getByTestId("pref-font-size").fill("18");
  await page.getByTestId("pref-tab-size").fill("4");
  await expect(page.getByTestId("pref-insert-spaces")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("pref-word-wrap").click();
  await page.getByTestId("pref-auto-save").click();
  await page.getByTestId("pref-color-mode").getByRole("button", { name: "Dark" }).click();
  await page.getByTestId("save-prefs").click();
  await expect(page.getByText("Preferences saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark/);
  await page.reload();
  await expect(page.getByTestId("pref-font-size")).toHaveValue("18");
  await expect(page.getByTestId("pref-auto-save")).toHaveAttribute("aria-checked", "true");

  await page.goto(`/p/${projectId}`);
  await expect(page.getByTestId("editor").locator(".cm-content")).toHaveCSS("font-size", "18px");
  await expect(page.getByTestId("editor").locator(".cm-content")).toHaveClass(/cm-lineWrapping/);
  await newEntry(page, "file", "notes.txt");
  await editor(page).click();
  await page.keyboard.type("x");
  await page.keyboard.press("Tab");
  // Auto-save after a pause.
  await expect(tab(page, "notes.txt")).toHaveAttribute("data-dirty", "false", { timeout: 6000 });
  res = await runtime.fetch(`/api/files/${await fileId(page, "notes.txt")}`, { role: "member" });
  expect(await res.text()).toBe("    x");

  // ---- F005: import and download
  await page.getByTestId("import-files-input").setInputFiles([
    { name: "rates.json", mimeType: "application/json", buffer: Buffer.from('{ "vat": 0.2 }\n') },
    { name: "logo.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 0, 1, 2]) },
    { name: "huge.log", mimeType: "text/plain", buffer: Buffer.alloc(1024 * 1024 + 10, "a") },
    { name: "README.md", mimeType: "text/markdown", buffer: Buffer.from("# Replaced?\n") },
  ]);
  const report = page.getByTestId("import-report");
  await expect(report).toBeVisible();
  await expect(report).toContainText("rates.json");
  await expect(report.getByTestId("import-skipped")).toContainText("logo.png");
  await expect(report.getByTestId("import-skipped")).toContainText("huge.log");
  await expect(report.getByTestId("import-clashes")).toContainText("README.md");
  await page.keyboard.press("Escape");
  await expect(treeItem(page, "rates.json")).toBeVisible();
  res = await runtime.fetch(`/api/files/${await fileId(page, "README.md")}`, { role: "member" });
  expect(await res.text()).not.toContain("Replaced?");

  const zip = await runtime.fetch(`/api/projects/${projectId}/zip`, { role: "member" });
  expect(zip.status).toBe(200);
  expect(zip.headers.get("content-type")).toContain("zip");
  expect(zip.headers.get("content-disposition")).toContain(".zip");
  const zipBytes = Buffer.from(await zip.arrayBuffer());
  expect(zipBytes.subarray(0, 2).toString()).toBe("PK");
  expect(zipBytes.includes(Buffer.from("src/lib/money.ts"))).toBe(true);
  expect(zipBytes.includes(Buffer.from("rates.json"))).toBe(true);
  const one = await runtime.fetch(`/api/files/${invoiceId}`, { role: "member" });
  expect(one.headers.get("content-disposition")).toContain("invoice.ts");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-project").click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  // A local folder into a new project, keeping its structure.
  const dir = mkdtempSync(join(tmpdir(), "import-"));
  const root = join(dir, "web-client");
  mkdirSync(join(root, "src", "components"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{ "name": "web-client" }\n');
  writeFileSync(join(root, "src", "main.tsx"), "import { App } from './components/App';\n");
  writeFileSync(join(root, "src", "components", "App.tsx"), "export function App() { return null; }\n");
  await page.goto("/");
  await page.getByTestId("open-folder-input").setInputFiles(root);
  await expect(page.getByTestId("project-title")).toHaveText("web-client");
  await expect(page.getByTestId("import-report")).toContainText("3");
  await page.keyboard.press("Escape");
  await expect(treeItem(page, "src/components/App.tsx")).toBeVisible();
  await expect(treeItem(page, "package.json")).toBeVisible();

  // ---- Journey ends on the workbench with real work on screen.
  await page.goto("/settings");
  await page.getByTestId("pref-color-mode").getByRole("button", { name: "Light" }).click();
  await page.getByTestId("pref-font-size").fill("14");
  await page.getByTestId("pref-word-wrap").click();
  await page.getByTestId("save-prefs").click();
  await expect(page.getByText("Preferences saved")).toBeVisible();
  await page.goto(`/p/${projectId}`);
  await runtime.assertBackLink(page);
  await treeItem(page, "src/invoice.ts").click();
  await expect(tab(page, "src/invoice.ts")).toHaveAttribute("data-active", "true");
  await setText(page, [
    'import { cents } from "./lib/money";',
    "",
    "export interface InvoiceLine {",
    "  description: string;",
    "  quantity: number;",
    "  unitPrice: number;",
    "}",
    "",
    "export function billingTotal(lines: InvoiceLine[], taxRate = 0.2) {",
    "  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);",
    "  return { subtotal: cents(subtotal), tax: cents(subtotal * taxRate), total: cents(subtotal * (1 + taxRate)) };",
    "}",
    "",
  ].join("\n"));
  await save(page, "src/invoice.ts");
  await expect(editor(page)).toContainText("billingTotal");
  await page.mouse.move(0, 0);
  await runtime.screenshot(page);
  await ctx.close();

  // ---- Phone-sized smoke
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto("/");
  await expect(p.getByTestId("project-row").filter({ hasText: "Billing service" })).toBeVisible();
  await p.getByTestId("project-row").filter({ hasText: "Billing service" }).getByTestId("project-link").tap();
  await expect(p.getByTestId("project-title")).toHaveText("Billing service");
  await p.getByTestId("quick-open-button").tap();
  await p.getByTestId("quick-open-input").fill("readme");
  await p.getByTestId("quick-open-item").first().tap();
  await expect(tab(p, "README.md")).toHaveAttribute("data-active", "true");
  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.close();
} finally {
  await runtime.close();
}
console.log("behavior: ok");
