import type { JiraColumnGroup } from "../domain/board"

export type JiraBoardFocusTarget = { columnIndex: number; cardIndex?: number }

export function jiraBoardFocusTarget(
  groups: readonly JiraColumnGroup[],
  columnIndex: number,
  cardIndex: number | undefined,
  key: string,
): JiraBoardFocusTarget | undefined {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const nextColumnIndex = columnIndex + (key === "ArrowLeft" ? -1 : 1)
    const nextColumn = groups[nextColumnIndex]
    if (!nextColumn) return
    if (cardIndex === undefined || nextColumn.issues.length === 0) return { columnIndex: nextColumnIndex }
    return { columnIndex: nextColumnIndex, cardIndex: Math.min(cardIndex, nextColumn.issues.length - 1) }
  }
  if (cardIndex === undefined) {
    if ((key === "ArrowDown" || key === "Enter") && groups[columnIndex]?.issues.length) {
      return { columnIndex, cardIndex: 0 }
    }
    return
  }
  if (key === "ArrowUp") {
    if (cardIndex === 0) return { columnIndex }
    return { columnIndex, cardIndex: cardIndex - 1 }
  }
  if (key === "ArrowDown" && cardIndex + 1 < (groups[columnIndex]?.issues.length ?? 0)) {
    return { columnIndex, cardIndex: cardIndex + 1 }
  }
  if (key === "Home") return { columnIndex, cardIndex: 0 }
  if (key === "End") return { columnIndex, cardIndex: (groups[columnIndex]?.issues.length ?? 1) - 1 }
}
