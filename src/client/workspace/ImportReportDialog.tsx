import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import type { ImportReport } from "@/client/workspace/importing";

const SHOWN = 30;

function PathList({ paths }: { paths: string[] }) {
  return (
    <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs">
      {paths.slice(0, SHOWN).map((path) => (
        <li key={path} className="truncate">
          {path}
        </li>
      ))}
      {paths.length > SHOWN ? (
        <li className="text-muted-foreground">and {paths.length - SHOWN} more</li>
      ) : null}
    </ul>
  );
}

export function ImportReportDialog({
  report,
  onClose,
}: {
  report: ImportReport;
  onClose: () => void;
}) {
  const count = report.imported.length;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="import-report" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Imported {count} {count === 1 ? "file" : "files"}
          </DialogTitle>
        </DialogHeader>
        {count > 0 ? <PathList paths={report.imported} /> : null}
        {report.skipped.length > 0 ? (
          <section data-testid="import-skipped" className="space-y-1">
            <h3 className="font-medium">Skipped</h3>
            <PathList
              paths={report.skipped.map((s) => `${s.path} (${s.reason})`)}
            />
          </section>
        ) : null}
        {report.clashes.length > 0 ? (
          <section data-testid="import-clashes" className="space-y-1">
            <h3 className="font-medium">Already in the project, left as they were</h3>
            <PathList paths={report.clashes} />
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
