import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";
import { savePrefs } from "@/serverFunctions/workspace";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: ReactNode;
}[] = [
  { value: "system", label: "System", icon: <Monitor /> },
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
];

/** System / Light / Dark segmented radio, in the bar of `AppShell`. */
export function ThemePreferenceRadio() {
  const { themePreference, setThemePreference } = useThemePreference();

  return (
    <SegmentedToggle
      items={THEME_OPTIONS}
      value={themePreference}
      onChange={(mode) => {
        setThemePreference(mode);
        void savePrefs({ data: { colorMode: mode } });
      }}
    />
  );
}

/** Applies the colour mode saved in the member's preferences when a page loads. */
export function SavedColorMode() {
  const saved = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "colorMode" in root ? root.colorMode : null;
    },
  });
  const { themePreference, setThemePreference } = useThemePreference();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !saved) return;
    applied.current = true;
    if (saved !== themePreference) setThemePreference(saved);
  }, [saved, themePreference, setThemePreference]);
  return null;
}
