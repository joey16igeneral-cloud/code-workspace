import { useState, type FormEvent } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";

/** A one-field dialog: a project name, or a file path. Render it only while open. */
export function NameDialog({
  title,
  label,
  initial = "",
  submitLabel,
  inputTestId,
  submitTestId,
  errorTestId,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  inputTestId: string;
  submitTestId: string;
  errorTestId?: string;
  /** Resolves when done; a thrown error's message shows under the field. */
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setError("Enter a name");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="name-dialog-input" className="text-sm font-medium">
              {label}
            </label>
            <Input
              id="name-dialog-input"
              data-testid={inputTestId}
              value={value}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={error ? true : undefined}
            />
            {error ? (
              <p data-testid={errorTestId} className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" data-testid={submitTestId} pending={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) {
    // Validation errors arrive as zod's JSON list of issues.
    try {
      const issues: unknown = JSON.parse(cause.message);
      if (Array.isArray(issues) && typeof issues[0]?.message === "string") {
        return issues[0].message as string;
      }
    } catch {
      // A plain message.
    }
    return cause.message;
  }
  return "That didn't work. Try again.";
}
