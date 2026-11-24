import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Spinner } from "@/client/components/ui/spinner";
import { Workbench } from "@/client/workspace/Workbench";
import { openProject } from "@/serverFunctions/workspace";

export const Route = createFileRoute("/p/$projectId")({
  // The editor needs the browser.
  ssr: false,
  loader: ({ params }) => openProject({ data: { id: params.projectId } }),
  staleTime: Infinity,
  shouldReload: false,
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.project ? `${loaderData.project.name} · Code Workspace` : "Code Workspace" }],
  }),
  pendingComponent: () => (
    <AppShell wide>
      <div className="flex justify-center py-20 text-muted-foreground">
        <Spinner />
      </div>
    </AppShell>
  ),
  component: ProjectPage,
});

function ProjectPage() {
  const { project, prefs } = Route.useLoaderData();
  if (!project) {
    return (
      <AppShell>
        <div data-testid="project-not-found">
          <PageHeader
            title="Project not found"
            backLink={<BackToProjects />}
          />
        </div>
      </AppShell>
    );
  }
  return <Workbench key={project.id} project={project} prefs={prefs} backLink={<BackToProjects />} />;
}

function BackToProjects() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden />
      Projects
    </Link>
  );
}
