import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";

export interface PickerItem {
  key: string;
  label: ReactNode;
  detail?: ReactNode;
  run: () => void;
}

/** A filtering list run from the keyboard: the file picker and the command list. */
export function Picker({
  title,
  placeholder,
  filter,
  inputTestId,
  itemTestId,
  empty,
  onClose,
}: {
  title: string;
  placeholder: string;
  filter: (query: string) => PickerItem[];
  inputTestId: string;
  itemTestId: string;
  empty: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const items = filter(query);
  useEffect(() => setSelected(0), [query]);

  function run(item: PickerItem | undefined) {
    if (!item) return;
    onClose();
    // After the dialog lets go of focus.
    setTimeout(item.run, 0);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-2 p-2 sm:max-w-lg">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Input
          data-testid={inputTestId}
          autoFocus
          value={query}
          placeholder={placeholder}
          aria-label={title}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((i) => Math.min(i + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(items[selected]);
            }
          }}
        />
        <ul role="listbox" aria-label={title} className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{empty}</li>
          ) : (
            items.map((item, index) => (
              <li key={item.key} role="option" aria-selected={index === selected}>
                <button
                  type="button"
                  data-testid={itemTestId}
                  onMouseMove={() => setSelected(index)}
                  onClick={() => run(item)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm",
                    index === selected ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.detail ? (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">{item.detail}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
