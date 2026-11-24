import { decodeTextFile } from "@/shared/importing";
import { importFiles } from "@/serverFunctions/workspace";

export interface ImportReport {
  imported: string[];
  skipped: { path: string; reason: string }[];
  clashes: string[];
}

/** A report to show when the project page opens after an import from the start page. */
let pending: { projectId: string; report: ImportReport } | null = null;

export function takePendingReport(projectId: string): ImportReport | null {
  if (pending?.projectId !== projectId) return null;
  const report = pending.report;
  pending = null;
  return report;
}

/** The folder a picked folder's files share, used as the new project's name. */
export function pickedFolderName(files: File[]): string | null {
  const first = files[0]?.webkitRelativePath;
  if (!first || !first.includes("/")) return null;
  return first.split("/")[0] ?? null;
}

/**
 * Reads the picked files in the browser and adds the text ones to a project:
 * the given one, or a new one with `newProjectName`. A folder's files keep
 * their place below the picked folder.
 */
export async function importPicked(
  picked: File[],
  target: { projectId: string } | { newProjectName: string },
): Promise<{ projectId: string; report: ImportReport }> {
  const report: ImportReport = { imported: [], skipped: [], clashes: [] };
  const files: { path: string; content: string }[] = [];
  for (const file of picked) {
    const relative = file.webkitRelativePath
      ? file.webkitRelativePath.split("/").slice(1).join("/")
      : file.name;
    const decoded = decodeTextFile(new Uint8Array(await file.arrayBuffer()));
    if ("skipped" in decoded) report.skipped.push({ path: relative, reason: decoded.skipped === "binary" ? "not text" : "over 1 MB" });
    else files.push({ path: relative, content: decoded.text });
  }
  let projectId = "projectId" in target ? target.projectId : null;
  const batches: (typeof files)[] = [];
  let batch: typeof files = [];
  let size = 0;
  for (const file of files) {
    if (batch.length >= 400 || (batch.length > 0 && size + file.content.length > 3_000_000)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(file);
    size += file.content.length;
  }
  batches.push(batch);
  for (const chunk of batches) {
    const result = await importFiles({
      data: projectId
        ? { projectId, files: chunk }
        : { newProjectName: "newProjectName" in target ? target.newProjectName : "Imported files", files: chunk },
    });
    projectId = result.projectId;
    report.imported.push(...result.imported);
    report.clashes.push(...result.clashes);
    report.skipped.push(...result.skipped.map((path) => ({ path, reason: "invalid name" })));
  }
  return { projectId: projectId!, report };
}

export function setPendingReport(projectId: string, report: ImportReport) {
  pending = { projectId, report };
}
