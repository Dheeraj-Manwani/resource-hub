import { Extension, type Editor } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { closeHistory } from "@tiptap/pm/history"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

type Pending = { id: string; pos: number; src: string; replaceSrc?: string }
const uploadKey = new PluginKey<Pending[]>("documentImageUploads")

/** Upload previews are decorations, never document nodes or undo history. */
export const ImageUploads = Extension.create({
  name: "documentImageUploads",
  addProseMirrorPlugins() {
    return [
      new Plugin<Pending[]>({
        key: uploadKey,
        state: {
          init: () => [],
          apply(tr, pending) {
            const mapped = pending.flatMap((item) => {
              const result = tr.mapping.mapResult(item.pos, 1)
              return result.deletedAcross ? [] : [{ ...item, pos: result.pos }]
            })
            const action = tr.getMeta(uploadKey) as
              { add?: Pending; remove?: string } | undefined
            if (action?.add) mapped.push(action.add)
            return action?.remove
              ? mapped.filter((item) => item.id !== action.remove)
              : mapped
          },
        },
        props: {
          decorations(state) {
            return DecorationSet.create(
              state.doc,
              (uploadKey.getState(state) ?? []).map((item) =>
                Decoration.widget(
                  item.pos,
                  () => {
                    const wrapper = document.createElement("span")
                    wrapper.className = "document-image-upload"
                    wrapper.contentEditable = "false"
                    wrapper.setAttribute("role", "status")
                    const image = document.createElement("img")
                    image.src = item.src
                    image.alt = "Uploading image preview"
                    const label = document.createElement("span")
                    label.textContent = item.replaceSrc
                      ? "Replacing image…"
                      : "Uploading image…"
                    wrapper.append(image, label)
                    return wrapper
                  },
                  { key: item.id, side: 1 }
                )
              )
            )
          },
        },
      }),
    ]
  },
})

export type ImageUploader = (
  file: File
) => Promise<{ url: string; width?: number | null; height?: number | null }>

export async function uploadDocumentImage(
  editor: Editor,
  file: File,
  upload: ImageUploader,
  pos?: number,
  replaceSrc?: string
) {
  const id = crypto.randomUUID()
  const src = URL.createObjectURL(file)
  editor.view.dispatch(
    editor.state.tr.setMeta(uploadKey, {
      add: { id, src, pos: pos ?? editor.state.selection.from, replaceSrc },
    })
  )
  try {
    const result = await upload(file)
    if (editor.isDestroyed) return
    const pending = uploadKey
      .getState(editor.state)
      ?.find((item) => item.id === id)
    if (!pending) return
    let tr = closeHistory(editor.state.tr).setMeta(uploadKey, { remove: id })
    if (replaceSrc) {
      const current = editor.state.doc.nodeAt(pending.pos)
      if (current?.type.name === "image" && current.attrs.src === replaceSrc)
        tr = tr.setNodeMarkup(pending.pos, undefined, {
          ...current.attrs,
          src: result.url,
        })
    } else {
      const image = editor.schema.nodes.image.create({
        src: result.url,
        alt: file.name,
        width: result.width ?? null,
        height: result.height ?? null,
      })
      // insertContentAt normalizes an image dropped in the middle of a paragraph.
      editor.view.dispatch(tr)
      editor.commands.insertContentAt(pending.pos, image.toJSON())
      return
    }
    editor.view.dispatch(tr)
  } finally {
    if (!editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(uploadKey, { remove: id }))
    URL.revokeObjectURL(src)
  }
}
