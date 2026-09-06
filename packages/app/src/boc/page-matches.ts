/** Collect rendered text without changing Solid-owned message markup. */
export function pageMatches(root: HTMLElement, query: string, exclude: HTMLElement) {
  if (!query) return []
  const nodes: { node: Text; start: number; end: number }[] = []
  const parents = new Map<HTMLElement, HTMLElement | null>()
  const block = (element: HTMLElement): HTMLElement | null => {
    if (parents.has(element)) return parents.get(element) ?? null
    if (element === exclude || element.matches("script, style, noscript, input, textarea, select, [hidden], [inert]")) {
      parents.set(element, null)
      return null
    }
    if (element.parentElement?.matches("details:not([open])") && element.tagName !== "SUMMARY") {
      parents.set(element, null)
      return null
    }
    const style = getComputedStyle(element)
    const parent = element === root ? root : element.parentElement && block(element.parentElement)
    const result =
      !parent || style.display === "none" || style.visibility === "hidden" || style.contentVisibility === "hidden"
        ? null
        : style.display === "contents" || style.display.startsWith("inline")
          ? parent
          : element
    parents.set(element, result)
    return result
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let text = ""
  let previous: HTMLElement | null = null
  let current = walker.nextNode()
  while (current) {
    if (current.nodeType !== Node.TEXT_NODE) {
      if ((current as Element).tagName === "BR") text += "\n"
      current = walker.nextNode()
      continue
    }
    const node = current as Text
    const container = node.parentElement && block(node.parentElement)
    if (container) {
      if (container !== previous) text += "\n"
      nodes.push({ node, start: text.length, end: text.length + node.length })
      text += node.data
      previous = container
    }
    current = walker.nextNode()
  }
  // A literal Unicode regexp preserves DOM offsets when case folding changes string length.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu")
  let index = 0
  return Array.from(text.matchAll(pattern)).flatMap((match) => {
    while (nodes[index] && nodes[index].end <= match.index) index++
    const start = nodes[index]
    const endOffset = match.index + match[0].length
    while (nodes[index] && nodes[index].end < endOffset) index++
    const end = nodes[index]
    if (!start || !end || start.start > match.index || end.start >= endOffset) return []
    const range = document.createRange()
    range.setStart(start.node, match.index - start.start)
    range.setEnd(end.node, endOffset - end.start)
    return [range]
  })
}
