import { useNavigate } from "@tanstack/react-router";
import { EditorSelection, EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Command,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  FileUp,
  FolderPlus,
  FolderUp,
  Import,
  PanelLeft,
  Save,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Markdown } from "@/client/components/Markdown";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { editorExtensions, isMarkdown, languageFor, languageSlot } from "@/client/editor/setup";
import { Explorer, type EntryAction } from "@/client/workspace/Explorer";
import { ImportReportDialog } from "@/client/workspace/ImportReportDialog";
import { NameDialog, errorMessage } from "@/client/workspace/NameDialog";
import { Picker, type PickerItem } from "@/client/workspace/Picker";
import { SearchPanel, type ReplacedFile } from "@/client/workspace/SearchPanel";
import { importPicked, takePendingReport, type ImportReport } from "@/client/workspace/importing";
import { buildTree, filterPaths, type Entry } from "@/client/workspace/tree";
import { baseName, dirName, isInside, parentPaths } from "@/shared/paths";
import {
  createEntry,
  deleteEntry,
  getTree,
  moveEntry,
  readFile,
  saveFile,
  saveTabs,
} from "@/serverFunctions/workspace";

interface Project {
  id: string;
  name: string;
  openTabs: string[];
  activePath: string | null;
  entries: Entry[];
}

interface Prefs {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  autoSave: boolean;
}

interface Tab {
  id: string;
  path: string;
  version: number;
  dirty: boolean;
  conflict: boolean;
}

type PathDialog =
  | { mode: "file" | "folder"; initial: string }
  | { mode: "move"; entry: Entry };

const AUTO_SAVE_MS = 1000;

export function Workbench({
  project,
  prefs,
  backLink,
}: {
  project: Project;
  prefs: Prefs;
  backLink: ReactNode;
}) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>(project.entries);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(project));
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [sidebar, setSidebar] = useState<"files" | "search" | null>("files");
  const [pathDialog, setPathDialog] = useState<PathDialog | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [closing, setClosing] = useState<Tab | null>(null);
  const [picker, setPicker] = useState<"files" | "commands" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(() => takePendingReport(project.id));

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const savedDocs = useRef(new Map<string, Text>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saving = useRef(new Set<string>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const tree = useMemo(() => buildTree(entries), [entries]);
  const files = useMemo(() => entries.filter((e) => e.kind === "file"), [entries]);

  const stateOf = useCallback((id: string) => {
    if (id === activeRef.current && view.current) return view.current.state;
    return states.current.get(id) ?? null;
  }, []);

  const patchTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // ---- saving
  const save = useCallback(
    async (id: string) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      const state = stateOf(id);
      if (!tab || !state || saving.current.has(id)) return;
      const doc = state.doc;
      saving.current.add(id);
      try {
        const result = await saveFile({ data: { id, content: doc.toString(), version: tab.version } });
        if (!result.ok) {
          patchTab(id, { conflict: true });
          return;
        }
        savedDocs.current.set(id, doc);
        const now = stateOf(id);
        patchTab(id, { version: result.version, conflict: false, dirty: now ? !now.doc.eq(doc) : false });
        setEntries((list) => list.map((e) => (e.id === id ? { ...e, size: doc.length } : e)));
      } catch (cause) {
        toast.error(errorMessage(cause));
      } finally {
        saving.current.delete(id);
      }
    },
    [patchTab, stateOf],
  );

  const onDocChanged = useRef<(id: string, state: EditorState) => void>(() => {});
  onDocChanged.current = (id, state) => {
    const saved = savedDocs.current.get(id);
    const dirty = !saved || !state.doc.eq(saved);
    const tab = tabsRef.current.find((t) => t.id === id);
    if (tab && tab.dirty !== dirty) patchTab(id, { dirty });
    if (preview !== null && id === activeRef.current) setPreview(state.doc.toString());
    if (prefs.autoSave) {
      clearTimeout(timers.current.get(id));
      if (dirty) timers.current.set(id, setTimeout(() => void save(id), AUTO_SAVE_MS));
    }
  };

  const makeState = useCallback(
    (id: string, path: string, content: string) => {
      const state = EditorState.create({
        doc: content,
        extensions: editorExtensions(prefs, [
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onDocChanged.current(id, update.state);
          }),
        ]),
      });
      savedDocs.current.set(id, state.doc);
      void languageFor(path).then((language) => {
        if (!language) return;
        const effects = languageSlot.reconfigure(language);
        if (activeRef.current === id && view.current) view.current.dispatch({ effects });
        else {
          const stored = states.current.get(id);
          if (stored) states.current.set(id, stored.update({ effects }).state);
        }
      });
      return state;
    },
    [prefs],
  );

  // ---- the one editor view; a tab swaps its state in
  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({ parent: host.current, state: EditorState.create({ doc: "" }) });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  const shownId = useRef<string | null>(null);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    if (shownId.current && shownId.current !== activeId && tabsRef.current.some((t) => t.id === shownId.current)) {
      states.current.set(shownId.current, editor.state);
    }
    shownId.current = activeId;
    if (!activeId) return;
    const next = states.current.get(activeId);
    if (next && next !== editor.state) editor.setState(next);
    setPreview(null);
  }, [activeId]);

  const openFile = useCallback(
    async (id: string, path: string, at?: { line: number; column: number }) => {
      if (!tabsRef.current.some((t) => t.id === id)) {
        try {
          const file = await readFile({ data: { id } });
          if (!states.current.has(id)) states.current.set(id, makeState(id, file.path, file.content));
          setTabs((list) =>
            list.some((t) => t.id === id)
              ? list
              : [...list, { id, path: file.path, version: file.version, dirty: false, conflict: false }],
          );
        } catch (cause) {
          toast.error(errorMessage(cause));
          return;
        }
      }
      setActiveId(id);
      setExpanded((set) => withParents(set, path));
      requestAnimationFrame(() => {
        const editor = view.current;
        if (!editor || activeRef.current !== id) return;
        if (at) {
          const line = editor.state.doc.line(Math.min(at.line, editor.state.doc.lines));
          const pos = Math.min(line.from + at.column - 1, line.to);
          editor.dispatch({
            selection: EditorSelection.cursor(pos),
            effects: EditorView.scrollIntoView(pos, { y: "center" }),
          });
        }
        editor.focus();
      });
    },
    [makeState],
  );

  // ---- restore the tabs this project had open
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const byPath = new Map(project.entries.filter((e) => e.kind === "file").map((e) => [e.path, e]));
      const wanted = project.openTabs.map((p) => byPath.get(p)).filter((e): e is Entry => !!e);
      const loaded = await Promise.all(
        wanted.map((e) => readFile({ data: { id: e.id } }).catch(() => null)),
      );
      if (cancelled) return;
      const restoredTabs: Tab[] = [];
      for (const file of loaded) {
        if (!file) continue;
        states.current.set(file.id, makeState(file.id, file.path, file.content));
        restoredTabs.push({ id: file.id, path: file.path, version: file.version, dirty: false, conflict: false });
      }
      setTabs(restoredTabs);
      const active = restoredTabs.find((t) => t.path === project.activePath) ?? restoredTabs[0];
      setActiveId(active?.id ?? null);
      setExpanded((set) => restoredTabs.reduce((acc, t) => withParents(acc, t.path), set));
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [project, makeState]);

  // ---- remember open tabs
  const tabPaths = tabs.map((t) => t.path).join("\n");
  const activePath = activeTab?.path ?? null;
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => {
      void saveTabs({
        data: { projectId: project.id, openTabs: tabPaths ? tabPaths.split("\n") : [], activePath },
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [restored, tabPaths, activePath, project.id]);

  // ---- tree changes
  const refreshTree = useCallback(async () => {
    setEntries(await getTree({ data: { projectId: project.id } }));
  }, [project.id]);

  const dropTabs = useCallback((match: (tab: Tab) => boolean) => {
    const list = tabsRef.current;
    const gone = list.filter(match);
    if (gone.length === 0) return;
    for (const tab of gone) {
      states.current.delete(tab.id);
      savedDocs.current.delete(tab.id);
      clearTimeout(timers.current.get(tab.id));
    }
    const rest = list.filter((t) => !match(t));
    setTabs(rest);
    if (activeRef.current && gone.some((t) => t.id === activeRef.current)) {
      const index = list.findIndex((t) => t.id === activeRef.current);
      const next = rest[Math.min(index, rest.length - 1)] ?? null;
      setActiveId(next?.id ?? null);
    }
  }, []);

  const closeTab = useCallback(
    (tab: Tab, force = false) => {
      if (tab.dirty && !force) {
        setClosing(tab);
        return;
      }
      dropTabs((t) => t.id === tab.id);
    },
    [dropTabs],
  );

  async function submitPath(value: string) {
    if (!pathDialog) return;
    if (pathDialog.mode === "move") {
      const { from, to } = await moveEntry({ data: { id: pathDialog.entry.id, path: value } });
      const remap = (path: string) => (path === from ? to : isInside(path, from) ? to + path.slice(from.length) : path);
      setTabs((list) => list.map((t) => ({ ...t, path: remap(t.path) })));
      setExpanded((set) => withParents(new Set([...set].map(remap)), to));
      await refreshTree();
      return;
    }
    const created = await createEntry({ data: { projectId: project.id, path: value, kind: pathDialog.mode } });
    await refreshTree();
    setExpanded((set) => withParents(set, created.path));
    if (created.kind === "file") await openFile(created.id, created.path);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      const { path } = await deleteEntry({ data: { id: target.id } });
      dropTabs((t) => t.path === path || isInside(t.path, path));
      await refreshTree();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  function onAction(action: EntryAction, entry: Entry) {
    if (action === "new-file") setPathDialog({ mode: "file", initial: `${entry.path}/` });
    else if (action === "new-folder") setPathDialog({ mode: "folder", initial: `${entry.path}/` });
    else if (action === "move") setPathDialog({ mode: "move", entry });
    else if (action === "delete") setDeleting(entry);
    else downloadUrl(`/api/files/${entry.id}`);
  }

  function newFileHere(mode: "file" | "folder") {
    const base = activeTab ? dirName(activeTab.path) : "";
    setPathDialog({ mode, initial: base ? `${base}/` : "" });
  }

  const saveAllDirty = useCallback(async () => {
    for (const tab of tabsRef.current) if (tab.dirty) await save(tab.id);
  }, [save]);

  function onReplaced(changed: ReplacedFile[]) {
    for (const file of changed) {
      const tab = tabsRef.current.find((t) => t.id === file.id);
      if (!tab || tab.dirty) continue;
      const state = makeState(file.id, file.path, file.content);
      states.current.set(file.id, state);
      if (activeRef.current === file.id && view.current) view.current.setState(state);
      patchTab(file.id, { version: file.version, conflict: false });
    }
  }

  async function reloadFromServer(tab: Tab) {
    try {
      const file = await readFile({ data: { id: tab.id } });
      const state = makeState(file.id, file.path, file.content);
      states.current.set(file.id, state);
      if (activeRef.current === file.id && view.current) view.current.setState(state);
      patchTab(file.id, { version: file.version, conflict: false, dirty: false });
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  async function onImport(list: FileList | null) {
    const picked = list ? [...list] : [];
    if (picked.length === 0) return;
    try {
      const done = await importPicked(picked, { projectId: project.id });
      setReport(done.report);
      await refreshTree();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  function togglePreview() {
    if (preview !== null || !activeId) setPreview(null);
    else setPreview(stateOf(activeId)?.doc.toString() ?? "");
  }

  // ---- keyboard
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s" && !event.shiftKey) {
      event.preventDefault();
      if (activeRef.current) void save(activeRef.current);
    } else if (key === "p") {
      event.preventDefault();
      setPicker(event.shiftKey ? "commands" : "files");
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  const commands: { label: string; key?: string; run: () => void }[] = [
    { label: "New file", run: () => newFileHere("file") },
    { label: "New folder", run: () => newFileHere("folder") },
    { label: "Save", key: "Ctrl+S", run: () => activeId && void save(activeId) },
    { label: "Close tab", run: () => activeTab && closeTab(activeTab) },
    { label: "Toggle explorer", run: () => setSidebar((s) => (s ? null : "files")) },
    { label: "Open search", run: () => setSidebar("search") },
    { label: "Go to file", key: "Ctrl+P", run: () => setPicker("files") },
    { label: "Open preferences", run: () => void navigate({ to: "/settings" }) },
    { label: "Download project", run: () => downloadUrl(`/api/projects/${project.id}/zip`) },
  ];

  const showPreview = preview !== null && activeTab && isMarkdown(activeTab.path);

  return (
    <AppShell wide>
      <PageHeader
        title={<span data-testid="project-title">{project.name}</span>}
        backLink={backLink}
        actions={
          <>
            <Button data-testid="quick-open-button" variant="outline" size="sm" onClick={() => setPicker("files")}>
              <SearchIcon aria-hidden /> Go to file
            </Button>
            <Button data-testid="command-palette-button" variant="outline" size="sm" onClick={() => setPicker("commands")}>
              <Command aria-hidden /> Commands
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                <Import aria-hidden /> Import
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => filesInput.current?.click()}>
                  <FileUp aria-hidden /> Files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInput.current?.click()}>
                  <FolderUp aria-hidden /> Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              data-testid="download-project"
              variant="outline"
              size="sm"
              render={<a href={`/api/projects/${project.id}/zip`} download />}
              nativeButton={false}
            >
              <Download aria-hidden /> Download
            </Button>
          </>
        }
      />
      <input
        ref={filesInput}
        data-testid="import-files-input"
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void onImport(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        data-testid="import-folder-input"
        type="file"
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(event) => {
          void onImport(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card md:h-[calc(100dvh-11.5rem)] md:flex-row">
        {sidebar ? (
          <aside
            data-testid="sidebar"
            className="flex max-h-72 shrink-0 flex-col border-b border-border bg-sidebar text-sidebar-foreground md:max-h-none md:w-72 md:border-r md:border-b-0"
          >
            <div className="flex items-center justify-between gap-1 border-b border-sidebar-border px-2 py-1.5">
              <div className="flex items-center gap-1">
                <Button
                  data-testid="show-explorer"
                  size="xs"
                  variant={sidebar === "files" ? "secondary" : "ghost"}
                  onClick={() => setSidebar("files")}
                >
                  Files
                </Button>
                <Button
                  data-testid="show-search"
                  size="xs"
                  variant={sidebar === "search" ? "secondary" : "ghost"}
                  onClick={() => setSidebar("search")}
                >
                  Search
                </Button>
              </div>
              {sidebar === "files" ? (
                <div className="flex items-center">
                  <Button data-testid="new-file" size="icon-xs" variant="ghost" aria-label="New file" onClick={() => newFileHere("file")}>
                    <FilePlus />
                  </Button>
                  <Button data-testid="new-folder" size="icon-xs" variant="ghost" aria-label="New folder" onClick={() => newFileHere("folder")}>
                    <FolderPlus />
                  </Button>
                </div>
              ) : null}
            </div>
            {sidebar === "files" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {entries.length === 0 ? (
                  <div data-testid="empty-project" className="space-y-2 p-3 text-sm">
                    <p className="text-muted-foreground">No files yet. Add a file or import some to start.</p>
                    <Button size="sm" variant="outline" onClick={() => newFileHere("file")}>
                      <FilePlus aria-hidden /> New file
                    </Button>
                  </div>
                ) : (
                  <Explorer
                    nodes={tree}
                    expanded={expanded}
                    activePath={activePath}
                    onToggle={(path) =>
                      setExpanded((set) => {
                        const next = new Set(set);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                    onOpen={(entry) => void openFile(entry.id, entry.path)}
                    onAction={onAction}
                  />
                )}
              </div>
            ) : (
              <SearchPanel
                projectId={project.id}
                onOpenAt={(id, path, line, column) => void openFile(id, path, { line, column })}
                onReplaced={onReplaced}
                beforeReplace={saveAllDirty}
              />
            )}
          </aside>
        ) : null}

        <section className="flex min-h-[24rem] min-w-0 flex-1 flex-col">
          <div className="flex items-center border-b border-border">
            <Button
              size="icon-sm"
              variant="ghost"
              className="mx-1 shrink-0"
              aria-label={sidebar ? "Hide side panel" : "Show side panel"}
              onClick={() => setSidebar((s) => (s ? null : "files"))}
            >
              <PanelLeft />
            </Button>
            <div role="tablist" aria-label="Open files" className="flex min-w-0 flex-1 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  data-testid="editor-tab"
                  data-path={tab.path}
                  data-active={tab.id === activeId ? "true" : "false"}
                  data-dirty={tab.dirty ? "true" : "false"}
                  title={tab.path}
                  className={cn(
                    "flex shrink-0 items-center gap-1 border-r border-border pl-3 pr-1 text-sm",
                    tab.id === activeId ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab.id === activeId}
                    className="py-2"
                    onClick={() => setActiveId(tab.id)}
                  >
                    {baseName(tab.path)}
                  </button>
                  {tab.dirty ? (
                    <span className="size-2 rounded-full bg-primary" aria-label="Unsaved changes" />
                  ) : null}
                  <Button
                    data-testid="close-tab"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Close ${baseName(tab.path)}`}
                    onClick={() => closeTab(tab)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            {activeTab ? (
              <div className="flex shrink-0 items-center gap-1 px-1">
                {isMarkdown(activeTab.path) ? (
                  <Button data-testid="toggle-preview" size="sm" variant="ghost" onClick={togglePreview}>
                    {showPreview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    {showPreview ? "Edit" : "Preview"}
                  </Button>
                ) : null}
                <Button data-testid="save-file" size="sm" variant="ghost" onClick={() => void save(activeTab.id)}>
                  <Save aria-hidden /> Save
                </Button>
              </div>
            ) : null}
          </div>
          {activeTab?.conflict ? (
            <Alert data-testid="save-conflict" variant="destructive" className="m-2 w-auto">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>This file changed since you opened it, so your edits weren't saved.</span>
                <Button size="xs" variant="outline" onClick={() => void reloadFromServer(activeTab)}>
                  Load latest and discard my edits
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {showPreview ? (
            <div data-testid="markdown-preview" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <Markdown className="space-y-3 text-sm">{preview}</Markdown>
            </div>
          ) : null}
          <div
            ref={host}
            data-testid="editor"
            className={cn("min-h-0 flex-1 overflow-hidden", (!activeTab || showPreview) && "hidden")}
          />
          {!activeTab ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={null}
                variant="plain"
                title="No file open"
                description="Pick a file in the explorer, or press Ctrl+P."
              />
            </div>
          ) : null}
        </section>
      </div>

      {picker === "files" ? (
        <Picker
          title="Go to file"
          placeholder="Type a file name"
          inputTestId="quick-open-input"
          itemTestId="quick-open-item"
          empty="No matching files"
          onClose={() => setPicker(null)}
          filter={(query): PickerItem[] =>
            filterPaths(files, query).map((file) => ({
              key: file.id,
              label: baseName(file.path),
              detail: dirName(file.path),
              run: () => void openFile(file.id, file.path),
            }))
          }
        />
      ) : null}
      {picker === "commands" ? (
        <Picker
          title="Commands"
          placeholder="Type a command"
          inputTestId="command-input"
          itemTestId="command-item"
          empty="No matching commands"
          onClose={() => setPicker(null)}
          filter={(query): PickerItem[] => {
            const q = query.trim().toLowerCase();
            return commands
              .filter((c) => !q || c.label.toLowerCase().includes(q))
              .map((c) => ({ key: c.label, label: c.label, detail: c.key, run: c.run }));
          }}
        />
      ) : null}
      {pathDialog ? (
        <NameDialog
          title={
            pathDialog.mode === "move"
              ? `Rename or move ${baseName(pathDialog.entry.path)}`
              : pathDialog.mode === "file"
                ? "New file"
                : "New folder"
          }
          label="Path"
          initial={pathDialog.mode === "move" ? pathDialog.entry.path : pathDialog.initial}
          submitLabel={pathDialog.mode === "move" ? "Rename" : "Create"}
          inputTestId="path-input"
          submitTestId="path-submit"
          errorTestId="path-error"
          onClose={() => setPathDialog(null)}
          onSubmit={submitPath}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.path}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        >
          {deleting.kind === "folder" ? "Everything in this folder is deleted too." : undefined}
        </ConfirmDialog>
      ) : null}
      {closing ? (
        <ConfirmDialog
          title={`Close ${baseName(closing.path)} without saving?`}
          confirmLabel="Close without saving"
          destructive
          onClose={() => setClosing(null)}
          onConfirm={() => {
            closeTab(closing, true);
            setClosing(null);
          }}
        />
      ) : null}
      {report ? <ImportReportDialog report={report} onClose={() => setReport(null)} /> : null}
    </AppShell>
  );
}

function withParents(set: Set<string>, path: string): Set<string> {
  const parents = parentPaths(path);
  if (parents.every((p) => set.has(p))) return set;
  return new Set([...set, ...parents]);
}

/** Small projects open with every folder expanded. */
function initialExpanded(project: Project): Set<string> {
  if (project.entries.length > 60) return new Set();
  return new Set(project.entries.filter((e) => e.kind === "folder").map((e) => e.path));
}

function downloadUrl(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
