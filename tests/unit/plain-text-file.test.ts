import { describe, expect, it } from "vitest"
import {
  decodePlainTextFile,
  encodePlainTextFile,
  plainTextFilename,
} from "@/lib/docs/plain-text-file"
import { MAX_PLAIN_TEXT_BYTES } from "@/lib/docs/plain-text"

describe("plain-text files", () => {
  it("round-trips UTF-8 bytes including a BOM, Unicode, mixed line endings and trailing whitespace", () => {
    for (const text of [
      "",
      "\ufeff",
      "\n\n  café हिन्दी 👋\t\r\nlast  \r\n",
      "\ufeffone\r\ntwo\nthree\rfour\t  \n",
    ]) {
      const bytes = new TextEncoder().encode(text)
      const decoded = decodePlainTextFile("notes.TXT", bytes)
      expect(decoded).toBe(text)
      expect(encodePlainTextFile(decoded)).toEqual(bytes)
    }
  })
  it("rejects unsupported encodings, null bytes, wrong extensions and oversized input", () => {
    for (const bytes of [
      new Uint8Array([0xff, 0xfe, 0x41, 0]),
      new Uint8Array([0xc3, 0x28]),
    ])
      expect(() => decodePlainTextFile("notes.txt", bytes)).toThrow(
        "isn't valid UTF-8"
      )
    expect(() =>
      decodePlainTextFile("notes.txt", new Uint8Array([0x41, 0]))
    ).toThrow("null characters")
    expect(() =>
      decodePlainTextFile("notes.pdf", new TextEncoder().encode("a"))
    ).toThrow("Choose a .txt")
    expect(() =>
      decodePlainTextFile("notes.txt", new Uint8Array(MAX_PLAIN_TEXT_BYTES + 1))
    ).toThrow("up to 3 MB")
  })
  it("makes safe, bounded download names without changing Unicode titles", () => {
    expect(plainTextFilename(" café हिन्दी 👋 ")).toBe("café हिन्दी 👋.txt")
    expect(plainTextFilename("notes.TXT")).toBe("notes.txt")
    expect(plainTextFilename("a/b:c*?\n")).toBe("a_b_c__.txt")
    expect(plainTextFilename("CON")).toBe("_CON.txt")
    expect(plainTextFilename("...")).toBe("Untitled.txt")
    expect(plainTextFilename("x".repeat(300)).length).toBe(184)
  })
})
