import { expect, test } from "bun:test"
import { Ghostty } from "ghostty-web"
import { createEnvironmentOutputCursor } from "./output"

test("feeds Docker redraws once and interprets cursor movement rather than duplicating rows", async () => {
  const ghostty = await Ghostty.load()
  const terminal = ghostty.createTerminal(80, 24)
  const consume = createEnvironmentOutputCursor()
  const write = (log: string) => {
    const next = consume({ id: "setup", log, logStart: 0 })
    if (next.reset) terminal.write("\x1bc")
    if (next.data) terminal.write(next.data)
  }
  const start = "[+] up 0/1\r\nContainer shop Starting\r\n"
  const finished = `${start}\x1b[2A\x1b[2K[+] up 1/1\r\n\x1b[2KContainer shop Started\r\n`
  write(start)
  write(finished)
  write(finished)
  const rows = Array.from({ length: 3 }, (_, row) =>
    terminal
      .getLine(row)
      ?.map((cell) => String.fromCodePoint(cell.codepoint || 32))
      .join("")
      .trim(),
  )
  expect(rows).toEqual(["[+] up 1/1", "Container shop Started", ""])
  terminal.free()
})

test("uses byte offsets across Unicode, bounded tail rollover, and a new run", () => {
  const consume = createEnvironmentOutputCursor()
  expect(consume({ id: "one", log: "✓ same\n", logStart: 0 })).toEqual({ reset: true, data: "✓ same\n" })
  expect(consume({ id: "one", log: "same\nsame\n", logStart: 4 })).toEqual({ reset: false, data: "same\n" })
  expect(consume({ id: "one", log: "same\nsame\n", logStart: 4 })).toEqual({ reset: false, data: "" })
  expect(consume({ id: "one", log: "later\n", logStart: 30 })).toEqual({ reset: true, data: "later\n" })
  expect(consume({ id: "two", log: "next\n", logStart: 0 })).toEqual({ reset: true, data: "next\n" })
})
