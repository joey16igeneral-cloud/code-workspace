import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { baseName } from "@/shared/paths";

export interface EditorPrefs {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
}

// Colours are the app's own tokens, so the editor follows light and dark.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: "var(--chart-1)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--success)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--chart-4)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--chart-2)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--chart-3)" },
  { tag: [t.tagName, t.heading], color: "var(--chart-1)", fontWeight: "600" },
  { tag: [t.attributeName, t.propertyName], color: "var(--chart-5)" },
  { tag: [t.link, t.url], color: "var(--primary)", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.invalid, color: "var(--destructive)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--card)", color: "var(--card-foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.55" },
  ".cm-gutters": { backgroundColor: "var(--card)", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--primary) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)",
    outline: "1px solid var(--ring)",
  },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)" },
  ".cm-nonmatchingBracket": { color: "var(--destructive)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, var(--warning) 35%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in oklch, var(--warning) 65%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)", borderColor: "var(--border)" },
  ".cm-panels input, .cm-panels button": { fontSize: "0.8rem" },
  ".cm-textfield": { backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)" },
  ".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: "8px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--muted)", border: "none", color: "var(--muted-foreground)" },
});

export const languageSlot = new Compartment();

/** Everything a file's editor state carries, from the member's preferences. */
export function editorExtensions(prefs: EditorPrefs, extra: Extension[]): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    theme,
    EditorView.theme({ "&": { fontSize: `${prefs.fontSize}px` } }),
    EditorState.tabSize.of(prefs.tabSize),
    indentUnit.of(prefs.insertSpaces ? " ".repeat(prefs.tabSize) : "\t"),
    prefs.wordWrap ? EditorView.lineWrapping : [],
    languageSlot.of([]),
    ...extra,
  ];
}

/** The language for a file name, loaded on demand; null for plain text. */
export async function languageFor(path: string): Promise<LanguageSupport | null> {
  const name = baseName(path);
  const description =
    languages.find((l) => l.filename?.test(name)) ??
    languages.find((l) => l.extensions.some((ext) => name.toLowerCase().endsWith(`.${ext}`)));
  if (!description) return null;
  try {
    return await description.load();
  } catch {
    return null;
  }
}

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}
