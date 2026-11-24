import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "code-workspace",
  name: "Code Workspace",
  description:
    "Keep code projects online and edit, search and download their files in the browser.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
  },
});
