export type TextNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: TextNode[]
}

export function imageDimension(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0
    ? Math.max(1, Math.min(10000, Math.round(number)))
    : null
}

export function hasTemporaryImages(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false
  const node = doc as TextNode
  return (
    (node.type === "image" &&
      /^(blob:|data:)/i.test(String(node.attrs?.src))) ||
    (Array.isArray(node.content) && node.content.some(hasTemporaryImages))
  )
}

function escapeText(text: string) {
  return text.replace(/([\\`*_{}\[\]<>#])/g, "\\$1")
}

function destination(value: unknown) {
  const url = typeof value === "string" ? value : ""
  if (!/^(https?:\/\/|mailto:|\/[^/]|#)/i.test(url)) return ""
  return url.replace(
    /[\s<>"()\\]/g,
    (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  )
}

function render(node: TextNode, depth = 0): string {
  const children = () =>
    (node.content ?? []).map((n) => render(n, depth)).join("")
  switch (node.type) {
    case "text": {
      const code = node.marks?.some((m) => m.type === "code")
      let text = code
        ? `${"`".repeat(Math.max(1, ...Array.from((node.text ?? "").matchAll(/`+/g), (m) => m[0].length + 1)))} ${node.text ?? ""} ${"`".repeat(Math.max(1, ...Array.from((node.text ?? "").matchAll(/`+/g), (m) => m[0].length + 1)))}`
        : escapeText(node.text ?? "")
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `**${text}**`
        if (mark.type === "italic") text = `*${text}*`
        if (mark.type === "strike") text = `~~${text}~~`
        if (mark.type === "link") {
          const url = destination(mark.attrs?.href)
          if (url) text = `[${text}](${url})`
        }
      }
      return text
    }
    case "hardBreak":
      return "  \n"
    case "paragraph":
      return `${children()}\n\n`
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)))} ${children()}\n\n`
    case "horizontalRule":
      return "---\n\n"
    case "blockquote":
      return `${children()
        .trimEnd()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`
    case "codeBlock": {
      const text = (node.content ?? []).map((n) => n.text ?? "").join("")
      const fence = "`".repeat(
        Math.max(3, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length + 1))
      )
      const language = String(node.attrs?.language ?? "").replace(
        /[^\w+-]/g,
        ""
      )
      return `${fence}${language}\n${text}\n${fence}\n\n`
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = Number(node.attrs?.start) || 1
      return (
        (node.content ?? [])
          .map((item, index) => {
            const prefix =
              node.type === "orderedList"
                ? `${start + index}. `
                : node.type === "taskList"
                  ? `- [${item.attrs?.checked ? "x" : " "}] `
                  : "- "
            const body = (item.content ?? [])
              .map((n) => render(n, depth + 1))
              .join("")
              .trimEnd()
            return `${prefix}${body.split("\n").join(`\n${" ".repeat(prefix.length)}`)}\n`
          })
          .join("") + "\n"
      )
    }
    case "image": {
      const url = destination(node.attrs?.src)
      const caption = String(node.attrs?.caption ?? "")
      return (
        (url
          ? `![${escapeText(String(node.attrs?.alt ?? ""))}](${url})\n\n`
          : "") + (caption ? `*${escapeText(caption)}*\n\n` : "")
      )
    }
    default:
      return children()
  }
}

export function textDocumentMarkdown(doc: TextNode, title?: string): string {
  return `${title?.trim() ? `# ${escapeText(title.trim())}\n\n` : ""}${render(doc).trimEnd()}\n`
}

export function documentFilename(title: string) {
  return (
    (title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/, "")
      .slice(0, 100) || "Untitled") + ".md"
  )
}

export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  )
}
