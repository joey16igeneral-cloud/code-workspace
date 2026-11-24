import { ChevronDown, ChevronRight, File, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import type { Entry, TreeNode } from "@/client/workspace/tree";

export type EntryAction = "new-file" | "new-folder" | "move" | "download" | "delete";

export function Explorer({
  nodes,
  expanded,
  activePath,
  onToggle,
  onOpen,
  onAction,
}: {
  nodes: TreeNode[];
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpen: (entry: Entry) => void;
  onAction: (action: EntryAction, entry: Entry) => void;
}) {
  return (
    <ul role="tree" aria-label="Files" className="py-1 text-sm">
      {nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          onToggle={onToggle}
          onOpen={onOpen}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}

function Node({
  node,
  depth,
  ...props
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpen: (entry: Entry) => void;
  onAction: (action: EntryAction, entry: Entry) => void;
}) {
  const { expanded, activePath, onToggle, onOpen, onAction } = props;
  const isFolder = node.kind === "folder";
  const open = isFolder && expanded.has(node.path);
  const indent = { paddingLeft: `${depth * 14 + 6}px` };
  const Icon = isFolder ? (open ? FolderOpen : Folder) : File;
  return (
    <li role="treeitem" aria-expanded={isFolder ? open : undefined} aria-selected={node.path === activePath}>
      <div
        data-testid="tree-item"
        data-path={node.path}
        data-kind={node.kind}
        data-id={node.id}
        className={cn(
          "group flex items-center rounded-md pr-1 hover:bg-accent",
          node.path === activePath && "bg-accent text-accent-foreground",
        )}
      >
        <button
          type="button"
          style={indent}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          onClick={() => (isFolder ? onToggle(node.path) : onOpen(node))}
        >
          {isFolder ? (
            open ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{node.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="entry-menu"
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Actions for ${node.name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isFolder ? (
              <>
                <DropdownMenuItem onClick={() => onAction("new-file", node)}>New file</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("new-folder", node)}>New folder</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuItem onClick={() => onAction("download", node)}>Download</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onAction("move", node)}>Rename or move</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onAction("delete", node)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open ? (
        node.children.length === 0 ? (
          <p
            data-testid="empty-folder"
            className="py-1 text-xs text-muted-foreground"
            style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
          >
            Empty folder. Add a file from its menu.
          </p>
        ) : (
          <ul role="group">
            {node.children.map((child) => (
              <Node key={child.id} node={child} depth={depth + 1} {...props} />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}
