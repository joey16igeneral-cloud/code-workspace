import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, newEntry, treeItem, tab, setText, save, fileId, entryMenu } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/settings", "/api/projects"]);

  // The member's private project.
  const mctx = await runtime.context("member");
  const mpage = await mctx.newPage();
  const memberProject = await createProject(mpage, "Payroll secrets");
  await newEntry(mpage, "file", "salaries.csv");
  await setText(mpage, "name,salary\nAda,120000\n");
  await save(mpage, "salaries.csv");
  const memberFile = await fileId(mpage, "salaries.csv");

  // Anonymous and outsider callers never reach it.
  for (const role of [undefined, "outsider"]) {
    for (const path of [`/api/projects/${memberProject}`, `/api/projects/${memberProject}/zip`, `/api/files/${memberFile}`, `/p/${memberProject}`]) {
      const res = await runtime.fetch(path, role ? { role } : {});
      expect([401, 403, 404]).toContain(res.status);
      expect(await res.text()).not.toContain("120000");
    }
  }

  // Another member (the org owner, who is an admin) cannot read it either.
  for (const path of [`/api/projects/${memberProject}`, `/api/projects/${memberProject}/zip`, `/api/files/${memberFile}`]) {
    const res = await runtime.fetch(path, { role: "owner" });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("120000");
  }
  const ownerList = await (await runtime.fetch("/api/projects", { role: "owner" })).text();
  expect(ownerList).not.toContain("Payroll secrets");
  expect(await (await runtime.fetch("/api/projects", { role: "member" })).text()).toContain("Payroll secrets");

  const octx = await runtime.context("owner");
  const opage = await octx.newPage();
  await opage.goto(`/p/${memberProject}`);
  await expect(opage.getByTestId("project-not-found")).toBeVisible();
  await expect(opage.getByText("salaries.csv")).toHaveCount(0);
  await opage.goto("/");
  await expect(opage.getByText("Payroll secrets")).toHaveCount(0);

  // The owner's own project; then its server calls are pointed at the member's ids.
  const ownerProject = await createProject(opage, "Owner sandbox");
  await newEntry(opage, "file", "plan.txt");
  await setText(opage, "owner plan\n");
  await save(opage, "plan.txt");
  const ownerFile = await fileId(opage, "plan.txt");

  await opage.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData();
    if (!body) return route.continue();
    await route.continue({
      postData: body.replaceAll(ownerFile, memberFile).replaceAll(ownerProject, memberProject),
    });
  });
  // Save over the member's file.
  await setText(opage, "overwritten by owner\n");
  await opage.keyboard.press("Control+s");
  await expect(tab(opage, "plan.txt")).toHaveAttribute("data-dirty", "true");
  // Rename and delete the member's file.
  await entryMenu(opage, "plan.txt", "Rename or move");
  await opage.getByTestId("path-input").fill("stolen.csv");
  await opage.getByTestId("path-submit").click();
  await opage.keyboard.press("Escape");
  await entryMenu(opage, "plan.txt", "Delete");
  await opage.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  // Write a new file into the member's project.
  await opage.getByTestId("new-file").click();
  await opage.getByTestId("path-input").fill("injected.txt");
  await opage.getByTestId("path-submit").click();
  await opage.keyboard.press("Escape");
  // Rename and delete the member's project from the start page.
  await opage.goto("/");
  const row = opage.getByTestId("project-row").filter({ hasText: "Owner sandbox" });
  await row.getByTestId("project-menu").click();
  await opage.getByRole("menuitem", { name: "Rename" }).click();
  await opage.getByTestId("project-name-input").fill("Hijacked");
  await opage.getByTestId("project-name-submit").click();
  await opage.keyboard.press("Escape");
  await row.getByTestId("project-menu").click();
  await opage.getByRole("menuitem", { name: "Delete" }).click();
  await opage.getByRole("alertdialog").getByRole("button", { name: "Delete project" }).click();
  await opage.waitForTimeout(500);
  await opage.unroute("**/_serverFn/**");

  // The member's project is untouched.
  const tree = await runtime.fetch(`/api/projects/${memberProject}`, { role: "member" });
  expect(tree.status).toBe(200);
  const treeText = await tree.text();
  expect(treeText).toContain("Payroll secrets");
  expect(treeText).toContain("salaries.csv");
  expect(treeText).not.toContain("stolen.csv");
  expect(treeText).not.toContain("injected.txt");
  expect(treeText).not.toContain("Hijacked");
  expect(await (await runtime.fetch(`/api/files/${memberFile}`, { role: "member" })).text()).toBe("name,salary\nAda,120000\n");

  // Preferences are each member's own.
  await mpage.goto("/settings");
  await mpage.getByTestId("pref-font-size").fill("21");
  await mpage.getByTestId("save-prefs").click();
  await expect(mpage.getByText("Preferences saved")).toBeVisible();
  await opage.goto("/settings");
  await expect(opage.getByTestId("pref-font-size")).not.toHaveValue("21");

  // No sign-in of its own: no login pages and no password fields.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/auth/login", "/account"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
  }
  for (const path of ["/", "/settings", `/p/${memberProject}`]) {
    await mpage.goto(path);
    await expect(mpage.locator('input[type="password"]')).toHaveCount(0);
  }
  // No public routes: anonymous visitors are refused everywhere.
  for (const path of ["/", "/settings", "/api/projects", "/health"]) {
    expect([401, 403]).toContain((await runtime.fetch(path)).status);
  }
} finally {
  await runtime.close();
}
console.log("authorization: ok");
