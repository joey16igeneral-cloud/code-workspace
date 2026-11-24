import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsRow,
  SettingsSection,
} from "@/client/components/SettingsSection";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Switch } from "@/client/components/ui/switch";
import { useThemePreference } from "@/client/lib/theme";
import { errorMessage } from "@/client/workspace/NameDialog";
import { getPrefs, savePrefs } from "@/serverFunctions/workspace";

export const Route = createFileRoute("/settings")({
  loader: () => getPrefs(),
  head: () => ({ meta: [{ title: "Preferences · Code Workspace" }] }),
  component: SettingsPage,
});

type Prefs = Awaited<ReturnType<typeof getPrefs>>;

function SettingsPage() {
  const saved = Route.useLoaderData();
  const [prefs, setPrefs] = useState<Prefs>(saved);
  const [fontSize, setFontSize] = useState(String(saved.fontSize));
  const [tabSize, setTabSize] = useState(String(saved.tabSize));
  const [pending, setPending] = useState(false);
  const { setThemePreference } = useThemePreference();

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    setPrefs((current) => ({ ...current, [key]: value }));

  async function save() {
    const font = Number(fontSize);
    const tab = Number(tabSize);
    if (!Number.isInteger(font) || font < 8 || font > 40) {
      toast.error("Font size must be a whole number from 8 to 40");
      return;
    }
    if (!Number.isInteger(tab) || tab < 1 || tab > 16) {
      toast.error("Tab size must be a whole number from 1 to 16");
      return;
    }
    setPending(true);
    try {
      const next = await savePrefs({ data: { ...prefs, fontSize: font, tabSize: tab } });
      setPrefs(next);
      setThemePreference(next.colorMode);
      toast.success("Preferences saved");
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Preferences"
        backLink={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            Projects
          </Link>
        }
      />
      <SettingsSection title="Editor">
        <SettingsCard>
          <SettingsRow label="Font size" htmlFor="pref-font-size">
            <Input
              id="pref-font-size"
              data-testid="pref-font-size"
              type="number"
              min={8}
              max={40}
              className="w-20"
              value={fontSize}
              onChange={(event) => setFontSize(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">px</span>
          </SettingsRow>
          <SettingsRow label="Tab size" htmlFor="pref-tab-size">
            <Input
              id="pref-tab-size"
              data-testid="pref-tab-size"
              type="number"
              min={1}
              max={16}
              className="w-20"
              value={tabSize}
              onChange={(event) => setTabSize(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">columns</span>
          </SettingsRow>
          <SettingsRow label="Indent with spaces">
            <Switch
              data-testid="pref-insert-spaces"
              aria-label="Indent with spaces"
              checked={prefs.insertSpaces}
              onCheckedChange={(value) => set("insertSpaces", value)}
            />
          </SettingsRow>
          <SettingsRow label="Word wrap">
            <Switch
              data-testid="pref-word-wrap"
              aria-label="Word wrap"
              checked={prefs.wordWrap}
              onCheckedChange={(value) => set("wordWrap", value)}
            />
          </SettingsRow>
          <SettingsRow label="Auto-save" description="Saves a second after you stop typing.">
            <Switch
              data-testid="pref-auto-save"
              aria-label="Auto-save"
              checked={prefs.autoSave}
              onCheckedChange={(value) => set("autoSave", value)}
            />
          </SettingsRow>
          <SettingsRow label="Colour mode">
            <div data-testid="pref-color-mode">
              <SegmentedToggle
                items={[
                  { value: "system", label: "System", icon: <Monitor /> },
                  { value: "light", label: "Light", icon: <Sun /> },
                  { value: "dark", label: "Dark", icon: <Moon /> },
                ]}
                showLabels
                value={prefs.colorMode}
                onChange={(value) => set("colorMode", value)}
              />
            </div>
          </SettingsRow>
          <SettingsCardFooter>
            <Button data-testid="save-prefs" pending={pending} onClick={() => void save()}>
              Save
            </Button>
          </SettingsCardFooter>
        </SettingsCard>
      </SettingsSection>
    </AppShell>
  );
}
