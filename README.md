# Code Workspace

Keep code projects on your own Cloudflare account and edit them in the browser: a file tree, tabbed editor with syntax colouring, project-wide search and replace, and zip downloads.

Inspired by https://vscode.dev

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, rename and delete private projects, and manage their files and folders in a tree.
- Edit files in tabs with line numbers, syntax colouring, bracket matching, find/replace and word completion, and save or auto-save.
- Jump to any file with Ctrl+P and run commands with Ctrl+Shift+P.
- Search a whole project by text, whole word or regular expression, and replace in one file or all.
- Import local files or a folder, and download any file or a whole project as a zip.
- Set your own font size, tab size, indentation, word wrap, auto-save and colour mode.

Left out: accounts and sign-in, which your Gateway handles; opening hosted Git repositories and source control; extensions and themes; AI chat; live collaboration; terminal, debugger and desktop hand-off; editing files in place on your disk; language-aware IntelliSense and split editors.

## Setup

```sh
pnpm install
pnpm dev                # run locally behind the local launcher
pnpm test               # unit tests
pnpm types:check
pnpm run deploy         # deploy to your EveryApp Gateway
```

The app needs one D1 database, which the deploy creates. It has no secrets or settings.

The checks in `checks/` run against a packaged release with the oss.new runtime (`node checks/behavior.mjs`, `authorization.mjs`, `persistence.mjs`); they have not been run against a live deployment.

## Limitations

- Only text files up to 1 MB can be imported or saved; binary files such as images are skipped.
- A project holds at most 2,000 files and folders.
- Search covers at most 2,000 matches at a time.
- There is no version history: a save replaces the previous text.
