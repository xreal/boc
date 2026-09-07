import { expect, test } from "bun:test"
import { environmentOutput } from "./output"

test("makes colored Docker progress and cursor controls readable", () => {
  expect(
    environmentOutput(
      "\x1b[?25l\x1b[0G[+] stop 0/1\r\n\x1b[33mContainer shop Stopping\x1b[0m\r\x1b[1A\x1b[2KContainer shop Stopped\n",
    ),
  ).toBe("[+] stop 0/1\nContainer shop Stopping\nContainer shop Stopped\n")
})

test("keeps Unicode, indentation and literal markup without terminal hyperlinks", () => {
  expect(environmentOutput("\x1b]8;;https://example.test\x1b\\✓ shop\x1b]8;;\x1b\\\n\t<script> & العربية")).toBe(
    "✓ shop\n\t<script> & العربية",
  )
})
