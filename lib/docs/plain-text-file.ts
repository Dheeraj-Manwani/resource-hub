import { MAX_PLAIN_TEXT_BYTES, plainTextBodySchema } from "./plain-text"

export function decodePlainTextFile(name: string, bytes: Uint8Array): string {
  if (!/\.txt$/i.test(name))
    throw new Error("Choose a .txt file saved as UTF-8.")
  if (bytes.byteLength > MAX_PLAIN_TEXT_BYTES)
    throw new Error("Text files support up to 3 MB.")
  let text: string
  try {
    // Keeping the BOM in the text makes import/save/export round-trip its bytes.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch {
    throw new Error(
      "This file isn't valid UTF-8. Save it as UTF-8 text and import it again."
    )
  }
  const parsed = plainTextBodySchema.safeParse(text)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  return parsed.data
}

export function plainTextFilename(title: string) {
  let name = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
  name = name.replace(/\.txt$/i, "").slice(0, 180) || "Untitled"
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = `_${name}`
  return `${name}.txt`
}

export function encodePlainTextFile(text: string) {
  return new TextEncoder().encode(text)
}
