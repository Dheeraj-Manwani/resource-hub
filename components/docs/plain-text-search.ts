import { EditorState } from "@codemirror/state"
import { isolateHistory } from "@codemirror/commands"
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view"
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search"
import { buttonVariants } from "@/components/ui/button"
import { countSearchMatches } from "@/lib/docs/plain-text-search"

function searchPanel(view: EditorView): Panel {
  const document = view.dom.ownerDocument
  const dom = document.createElement("form")
  dom.className =
    "cm-find-replace flex flex-col gap-2 px-3 py-2 text-xs font-normal"
  dom.setAttribute("role", "search")
  dom.setAttribute("aria-label", "Find and replace")

  function row() {
    const element = document.createElement("div")
    element.className = "flex flex-wrap items-center gap-2"
    dom.append(element)
    return element
  }
  function input(parent: HTMLElement, name: string, label: string) {
    const field = document.createElement("input")
    field.name = name
    field.placeholder = label
    field.setAttribute("aria-label", label)
    field.className =
      "h-8 min-w-0 flex-1 basis-36 rounded-lg border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand"
    field.autocomplete = "off"
    field.spellcheck = false
    field.addEventListener("input", commit)
    parent.append(field)
    return field
  }
  function button(parent: HTMLElement, label: string, action: () => void) {
    const control = document.createElement("button")
    control.type = "button"
    control.textContent = label
    control.className = buttonVariants({ variant: "outline", size: "sm" })
    control.addEventListener("click", action)
    parent.append(control)
    return control
  }
  function checkbox(parent: HTMLElement, label: string) {
    const wrapper = document.createElement("label")
    wrapper.className =
      "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-text-muted"
    const control = document.createElement("input")
    control.type = "checkbox"
    control.className = "size-3.5 accent-brand"
    control.addEventListener("change", commit)
    wrapper.append(control, ` ${label}`)
    parent.append(wrapper)
    return control
  }

  const findRow = row()
  const findField = input(findRow, "search", "Find text")
  findField.setAttribute("main-field", "true")
  const previous = button(findRow, "Previous", () => findPrevious(view))
  const next = button(findRow, "Next", () => findNext(view))
  button(findRow, "Close search", () => closeSearchPanel(view))
  const options = row()
  const matchCase = checkbox(options, "Match case")
  const wholeWord = checkbox(options, "Whole word")
  const regex = checkbox(options, "Regex")
  const count = document.createElement("span")
  count.className = "ml-auto text-text-muted tabular-nums"
  count.setAttribute("aria-live", "polite")
  count.setAttribute("data-search-count", "")
  options.append(count)

  const replaceRow = row()
  const replaceField = input(replaceRow, "replace", "Replace with")
  const replace = button(replaceRow, "Replace next", () => {
    const query = getSearchQuery(view.state)
    if (!query.valid || view.state.readOnly) return
    const { from, to } = view.state.selection.main
    const current = query.getCursor(view.state, from).next()
    if (current.done || current.value.from !== from || current.value.to !== to)
      findNext(view)
    replaceNext(view)
  })
  const replaceEvery = button(replaceRow, "Replace all", () => replaceAll(view))
  const hint = document.createElement("div")
  const fieldId = `text-search-${crypto.randomUUID()}`
  hint.id = `${fieldId}-hint`
  hint.className = "text-subtle text-xs"
  const error = document.createElement("div")
  error.id = `${fieldId}-error`
  error.className = "text-destructive text-xs"
  error.setAttribute("role", "alert")
  dom.append(hint, error)

  let query = getSearchQuery(view.state)
  function commit() {
    const updated = new SearchQuery({
      search: findField.value,
      replace: replaceField.value,
      caseSensitive: matchCase.checked,
      wholeWord: wholeWord.checked,
      regexp: regex.checked,
      // Backslashes are literal in normal mode; regex mode supports \n / \t.
      literal: !regex.checked,
    })
    if (!updated.eq(query))
      view.dispatch({ effects: setSearchQuery.of(updated) })
  }
  function sync() {
    query = getSearchQuery(view.state)
    if (findField.value !== query.search) findField.value = query.search
    if (replaceField.value !== query.replace) replaceField.value = query.replace
    matchCase.checked = query.caseSensitive
    wholeWord.checked = query.wholeWord
    regex.checked = query.regexp
    const invalid = !!query.search && !query.valid
    findField.setAttribute("aria-invalid", String(invalid))
    findField.setAttribute("aria-describedby", invalid ? error.id : hint.id)
    replaceField.setAttribute("aria-describedby", hint.id)
    error.textContent = invalid
      ? "Invalid regular expression. Check the pattern before searching or replacing."
      : ""
    error.hidden = !invalid
    const matches = countSearchMatches(view.state, query)
    count.textContent = !query.search
      ? "Enter text to find"
      : invalid
        ? ""
        : `${matches.count.toLocaleString()}${matches.capped ? "+" : ""} ${matches.count === 1 ? "match" : "matches"}`
    hint.textContent = query.regexp
      ? "JavaScript regex · Replacement: $1, $& (match), $$ (literal $), \\n, \\t. F3 / Shift+F3 navigates."
      : "Enter: next · Shift+Enter: previous · F3 / Shift+F3 · Esc: close. Text and backslashes are literal."
    const unavailable = !query.valid || matches.count === 0
    previous.disabled = next.disabled = unavailable
    replaceField.disabled = view.state.readOnly
    replace.disabled = replaceEvery.disabled =
      unavailable || view.state.readOnly
  }
  dom.addEventListener("submit", (event) => event.preventDefault())
  dom.addEventListener("keydown", (event) => {
    if (event.isComposing) return
    if (event.key === "Enter" && event.target === findField) {
      event.preventDefault()
      event.stopPropagation()
      ;(event.shiftKey ? findPrevious : findNext)(view)
    } else if (event.key === "Enter" && event.target === replaceField) {
      event.preventDefault()
      replace.click()
    }
  })
  sync()
  return {
    dom,
    top: true,
    mount() {
      findField.focus()
      findField.select()
    },
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(setSearchQuery))
        ) ||
        update.startState.readOnly !== update.state.readOnly
      )
        sync()
    },
  }
}

export function plainTextSearch() {
  return [
    search({ top: true, literal: true, createPanel: searchPanel }),
    EditorState.transactionExtender.of((transaction) =>
      transaction.isUserEvent("input.replace")
        ? { annotations: isolateHistory.of("full") }
        : null
    ),
  ]
}
