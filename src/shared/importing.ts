import { MAX_FILE_BYTES } from "@/shared/paths";

/** The text of a file, or why it can't be imported. */
export function decodeTextFile(
  bytes: Uint8Array,
): { text: string } | { skipped: "too large" | "binary" } {
  if (bytes.length > MAX_FILE_BYTES) return { skipped: "too large" };
  if (bytes.subarray(0, 8192).includes(0)) return { skipped: "binary" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { skipped: "binary" };
  }
}
