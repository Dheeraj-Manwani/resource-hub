import Image from "@tiptap/extension-image"
import { mergeAttributes } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { closeHistory } from "@tiptap/pm/history"
import { imageDimension } from "@/lib/docs/text-document"

/** Keep the existing image node name so older documents need no migration. */
export const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: {
        default: "left",
        parseHTML: (element) =>
          element.getAttribute("data-alignment") ?? "left",
        renderHTML: () => ({}),
      },
      caption: { default: "", renderHTML: () => ({}) },
      widthMode: { default: "fixed", renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-document-image]",
        getAttrs: (element) => {
          const image = element.querySelector("img")
          if (!image || /^(data:|blob:)/i.test(image.getAttribute("src") ?? ""))
            return false
          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt"),
            title: image.getAttribute("title"),
            width: imageDimension(image.getAttribute("width")),
            height: imageDimension(image.getAttribute("height")),
            caption: element.querySelector("figcaption")?.textContent ?? "",
            alignment: element.getAttribute("data-alignment") ?? "left",
            widthMode: element.getAttribute("data-width-mode") ?? "fixed",
          }
        },
      },
      ...(this.parent?.() ?? []),
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const alignment = ["left", "center", "right"].includes(node.attrs.alignment)
      ? node.attrs.alignment
      : "left"
    const figureAttrs = {
      "data-document-image": "",
      "data-alignment": alignment,
      "data-width-mode": node.attrs.widthMode === "full" ? "full" : "fixed",
      style: `text-align:${alignment}`,
    }
    const imageAttrs = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      {
        width: imageDimension(node.attrs.width),
        height: imageDimension(node.attrs.height),
        style: `max-width:100%;height:auto;${node.attrs.widthMode === "full" ? "width:100%;" : ""}`,
      }
    )
    return node.attrs.caption
      ? [
          "figure",
          figureAttrs,
          ["img", imageAttrs],
          ["figcaption", {}, String(node.attrs.caption)],
        ]
      : ["figure", figureAttrs, ["img", imageAttrs]]
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let node = initialNode
      const figure = document.createElement("figure")
      figure.dataset.documentImage = ""
      figure.contentEditable = "false"
      const frame = document.createElement("span")
      frame.className = "document-image-frame"
      const image = document.createElement("img")
      image.draggable = true
      const caption = document.createElement("figcaption")
      frame.append(image)
      figure.append(frame, caption)
      let cancelResize: (() => void) | undefined

      function sync() {
        const width = imageDimension(node.attrs.width)
        figure.dataset.alignment = ["left", "center", "right"].includes(
          node.attrs.alignment
        )
          ? node.attrs.alignment
          : "left"
        figure.dataset.widthMode =
          node.attrs.widthMode === "full" ? "full" : "fixed"
        const src = String(node.attrs.src ?? "")
        if (image.getAttribute("src") !== src) image.src = src
        image.alt = String(node.attrs.alt ?? "")
        image.title = String(node.attrs.title ?? "")
        image.style.width =
          node.attrs.widthMode === "full" ? "100%" : width ? `${width}px` : ""
        image.style.height = "auto"
        frame.style.width = node.attrs.widthMode === "full" ? "100%" : ""
        caption.textContent = String(node.attrs.caption ?? "")
        caption.hidden = !node.attrs.caption
      }

      function select() {
        const pos = getPos()
        if (pos !== undefined && !editor.isDestroyed && editor.isEditable) {
          editor.view.dispatch(
            editor.state.tr.setSelection(
              NodeSelection.create(editor.state.doc, pos)
            )
          )
          editor.view.focus()
        }
      }
      image.addEventListener("click", select)

      for (const direction of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]) {
        const handle = document.createElement("button")
        handle.type = "button"
        handle.tabIndex = -1
        handle.className = "document-image-resize-handle"
        handle.dataset.direction = direction
        handle.setAttribute("aria-label", `Resize image ${direction}`)
        frame.append(handle)
        handle.addEventListener("pointerdown", (event) => {
          if (!editor.isEditable || event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          cancelResize?.()
          select()
          const rect = image.getBoundingClientRect()
          if (!rect.width || !rect.height) return
          const ratio = rect.width / rect.height
          const startX = event.clientX
          const startY = event.clientY
          const signX = direction.endsWith("left") ? -1 : 1
          const signY = direction.startsWith("top") ? -1 : 1
          let width = rect.width
          const max = editor.view.dom.clientWidth - 24
          const move = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return
            const dx = (e.clientX - startX) * signX
            const dy = (e.clientY - startY) * signY * ratio
            width = Math.max(
              32,
              Math.min(
                Math.max(32, max),
                rect.width + (Math.abs(dx) > Math.abs(dy) ? dx : dy)
              )
            )
            image.style.width = `${width}px`
            frame.style.width = ""
          }
          const cleanup = () => {
            document.removeEventListener("pointermove", move)
            document.removeEventListener("pointerup", finish)
            document.removeEventListener("pointercancel", cancel)
            document.removeEventListener("keydown", key)
            cancelResize = undefined
            figure.removeAttribute("data-resizing")
            sync()
          }
          const finish = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return
            cleanup()
            const pos = getPos()
            if (pos === undefined || editor.isDestroyed) return
            const current = editor.state.doc.nodeAt(pos)
            if (current?.type.name !== "image") return
            editor.view.dispatch(
              closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, {
                ...current.attrs,
                width: Math.round(width),
                height: Math.round(width / ratio),
                widthMode: "fixed",
              })
            )
          }
          const cancel = () => cleanup()
          const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              cancel()
            }
          }
          cancelResize = cancel
          figure.dataset.resizing = "true"
          document.addEventListener("pointermove", move)
          document.addEventListener("pointerup", finish)
          document.addEventListener("pointercancel", cancel)
          document.addEventListener("keydown", key)
        })
      }
      sync()
      return {
        dom: figure,
        update(updated) {
          if (updated.type !== node.type) return false
          node = updated
          sync()
          return true
        },
        selectNode() {
          figure.classList.add("ProseMirror-selectednode")
        },
        deselectNode() {
          figure.classList.remove("ProseMirror-selectednode")
        },
        stopEvent(event) {
          return (
            event.target instanceof Element &&
            Boolean(event.target.closest(".document-image-resize-handle"))
          )
        },
        ignoreMutation() {
          return true
        },
        destroy() {
          cancelResize?.()
          image.removeEventListener("click", select)
        },
      }
    }
  },
})
