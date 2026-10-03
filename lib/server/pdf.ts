import "server-only"

/** Best-effort text extraction so uploaded PDFs are findable by Phase 6
 * search (feeds `resources.extractedText`, weight C in the tsvector). Never
 * throws: a PDF that can't be parsed (scanned, encrypted, corrupt) just has
 * no extracted text — OCR is out of scope. */
export async function extractPdfText(data: Buffer): Promise<string | null> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(data))
    const { text } = await extractText(pdf, { mergePages: true })
    const trimmed = text.trim()
    return trimmed ? trimmed.slice(0, 200_000) : null
  } catch (error) {
    console.warn("[pdf] text extraction failed", (error as Error).message)
    return null
  }
}
