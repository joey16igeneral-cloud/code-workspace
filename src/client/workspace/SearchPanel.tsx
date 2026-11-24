import { CaseSensitive, Regex, WholeWord } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Toggle } from "@/client/components/ui/toggle";
import { errorMessage } from "@/client/workspace/NameDialog";
import { replaceInProject, searchProject } from "@/serverFunctions/workspace";

type Result = Awaited<ReturnType<typeof searchProject>>;
export type ReplacedFile = Awaited<ReturnType<typeof replaceInProject>>["files"][number];

export function SearchPanel({
  projectId,
  onOpenAt,
  onReplaced,
  beforeReplace,
}: {
  projectId: string;
  onOpenAt: (id: string, path: string, line: number, column: number) => void;
  onReplaced: (files: ReplacedFile[]) => void;
  /** Saves open edits first so a replace works on what the member sees. */
  beforeReplace: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [include, setInclude] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [replacing, setReplacing] = useState(false);
  const latest = useRef(0);

  const options = { projectId, query, matchCase, wholeWord, regex, include };

  const run = useCallback(async () => {
    const ticket = ++latest.current;
    if (!query) {
      setResult(null);
      return;
    }
    try {
      const next = await searchProject({ data: { projectId, query, matchCase, wholeWord, regex, include } });
      if (ticket === latest.current) setResult(next);
    } catch (cause) {
      if (ticket === latest.current) setResult({ error: errorMessage(cause) });
    }
  }, [projectId, query, matchCase, wholeWord, regex, include]);

  useEffect(() => {
    const timer = setTimeout(() => void run(), 200);
    return () => clearTimeout(timer);
  }, [run]);

  async function replace(path?: string) {
    setReplacing(true);
    try {
      await beforeReplace();
      const done = await replaceInProject({ data: { ...options, replacement, ...(path ? { path } : {}) } });
      onReplaced(done.files);
      toast.success(`Replaced ${done.replaced} ${done.replaced === 1 ? "match" : "matches"} in ${done.files.length} ${done.files.length === 1 ? "file" : "files"}`);
      await run();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setReplacing(false);
    }
  }

  const found = result && "files" in result ? result : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <Input
          data-testid="search-input"
          aria-label="Search"
          placeholder="Search"
          value={query}
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8"
        />
      </div>
      <div className="flex items-center gap-1">
        <Toggle data-testid="search-case" size="sm" aria-label="Match case" pressed={matchCase} onPressedChange={setMatchCase}>
          <CaseSensitive />
        </Toggle>
        <Toggle data-testid="search-word" size="sm" aria-label="Whole word" pressed={wholeWord} onPressedChange={setWholeWord}>
          <WholeWord />
        </Toggle>
        <Toggle data-testid="search-regex" size="sm" aria-label="Regular expression" pressed={regex} onPressedChange={setRegex}>
          <Regex />
        </Toggle>
      </div>
      <Input
        data-testid="replace-input"
        aria-label="Replace with"
        placeholder="Replace with"
        value={replacement}
        spellCheck={false}
        onChange={(event) => setReplacement(event.target.value)}
        className="h-8"
      />
      <Input
        data-testid="search-include"
        aria-label="Files to include"
        placeholder="Files to include, e.g. src/**, *.md"
        value={include}
        spellCheck={false}
        onChange={(event) => setInclude(event.target.value)}
        className="h-8"
      />

      {result && "error" in result ? (
        <p data-testid="search-error" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      {found && found.total === 0 ? (
        <p data-testid="search-empty" className="text-sm text-muted-foreground">
          No results
        </p>
      ) : null}
      {found && found.total > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p data-testid="search-summary" className="text-xs text-muted-foreground">
              {plural(found.total, "result")} in {plural(found.files.length, "file")}
            </p>
            <Button data-testid="replace-all" size="xs" variant="outline" pending={replacing} onClick={() => void replace()}>
              Replace all
            </Button>
          </div>
          {found.truncated ? (
            <p className="text-xs text-muted-foreground">Showing the first {found.total}.</p>
          ) : null}
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {found.files.map((file) => (
              <li key={file.id} data-testid="search-file" data-path={file.path}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{file.path}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-muted-foreground">{file.matches.length}</span>
                    <Button
                      data-testid="replace-file"
                      size="xs"
                      variant="ghost"
                      disabled={replacing}
                      onClick={() => void replace(file.path)}
                    >
                      Replace
                    </Button>
                  </span>
                </div>
                <ul>
                  {file.matches.map((match) => (
                    <li key={`${match.line}:${match.column}`}>
                      <button
                        type="button"
                        data-testid="search-result"
                        onClick={() => onOpenAt(file.id, file.path, match.line, match.column)}
                        className="flex w-full gap-2 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-accent"
                      >
                        <span className="w-8 shrink-0 text-right text-muted-foreground">{match.line}</span>
                        <span className="truncate">{match.preview.trim()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
