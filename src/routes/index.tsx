import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { FileUp, FolderUp, MoreHorizontal, Plus, Settings } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { NameDialog, errorMessage } from "@/client/workspace/NameDialog";
import { importPicked, pickedFolderName, setPendingReport } from "@/client/workspace/importing";
import {
  createProject,
  deleteProject,
  getStart,
  renameProject,
} from "@/serverFunctions/workspace";

export const Route = createFileRoute("/")({
  loader: () => getStart(),
  head: () => ({ meta: [{ title: "Code Workspace" }] }),
  component: StartPage,
});

type Project = Awaited<ReturnType<typeof getStart>>["projects"][number];

function StartPage() {
  const { projects } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [pending, setPending] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function importInto(list: FileList | null, folder: boolean) {
    const files = list ? [...list] : [];
    if (files.length === 0) return;
    const name = (folder && pickedFolderName(files)) || "Imported files";
    try {
      const { projectId, report } = await importPicked(files, { newProjectName: name });
      setPendingReport(projectId, report);
      await navigate({ to: "/p/$projectId", params: { projectId } });
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell
      nav={
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Settings className="size-4" aria-hidden />
          Preferences
        </Link>
      }
    >
      <PageHeader
        title="Projects"
        actions={
          <>
            <Button variant="outline" onClick={() => filesInput.current?.click()}>
              <FileUp aria-hidden /> Open files
            </Button>
            <Button variant="outline" onClick={() => folderInput.current?.click()}>
              <FolderUp aria-hidden /> Open folder
            </Button>
            <Button data-testid="new-project" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New project
            </Button>
          </>
        }
      />
      <input
        ref={filesInput}
        data-testid="open-files-input"
        type="file"
        multiple
        hidden
        onChange={(event) => void importInto(event.target.files, false)}
      />
      <input
        ref={folderInput}
        data-testid="open-folder-input"
        type="file"
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(event) => void importInto(event.target.files, true)}
      />

      {projects.length === 0 ? (
        <div data-testid="empty-projects">
          <EmptyState
            title="No projects yet"
            description="Create a project, or open files or a folder from your computer."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden /> New project
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {projects.map((project) => (
            <li
              key={project.id}
              data-testid="project-row"
              className="flex items-center gap-3 px-4 py-3"
            >
              <Link
                to="/p/$projectId"
                params={{ projectId: project.id }}
                data-testid="project-link"
                className="min-w-0 flex-1"
              >
                <span className="block truncate font-medium hover:underline">{project.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {project.files} {project.files === 1 ? "file" : "files"} · opened {formatWhen(project.openedAt)}
                </span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  data-testid="project-menu"
                  render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${project.name}`} />}
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setRenaming(project)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting(project)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <NameDialog
          title="New project"
          label="Name"
          submitLabel="Create"
          inputTestId="project-name-input"
          submitTestId="project-name-submit"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const project = await createProject({ data: { name } });
            await navigate({ to: "/p/$projectId", params: { projectId: project.id } });
          }}
        />
      ) : null}
      {renaming ? (
        <NameDialog
          title="Rename project"
          label="Name"
          initial={renaming.name}
          submitLabel="Rename"
          inputTestId="project-name-input"
          submitTestId="project-name-submit"
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await renameProject({ data: { id: renaming.id, name } });
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete project"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              await deleteProject({ data: { id: deleting.id } });
              await router.invalidate();
            } catch (cause) {
              toast.error(errorMessage(cause));
            } finally {
              setPending(false);
              setDeleting(null);
            }
          }}
        >
          All of its files are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function formatWhen(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString();
}
