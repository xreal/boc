import { afterEach, expect, test } from "bun:test"
import { pageMatches } from "./page-matches"

afterEach(() => document.body.replaceChildren())

function fixture(content: string) {
  document.body.innerHTML = `<main>${content}</main><aside>needle<input value="needle"></aside>`
  return document.querySelector("aside")!
}

test("finds literal case-insensitive occurrences and excludes search UI, hidden content and fields", () => {
  const excluded = fixture(
    '<p>Needle needle</p><p hidden>needle</p><div style="display:none"><p>needle</p></div><textarea>needle</textarea>',
  )
  expect(pageMatches(document.body, "needle", excluded).map((range) => range.toString())).toEqual(["Needle", "needle"])
  expect(pageMatches(document.body, "", excluded)).toEqual([])
})

test("matches across inline formatting but keeps separate paragraphs apart", () => {
  const excluded = fixture('<p>Hello <strong style="display:inline">beautiful</strong> world</p><p>separate</p>')
  expect(pageMatches(document.body, "beautiful world", excluded).map((range) => range.toString())).toEqual([
    "beautiful world",
  ])
  expect(pageMatches(document.body, "worldseparate", excluded)).toEqual([])
})

test("preserves Unicode offsets and treats regexp punctuation as literal text", () => {
  const excluded = fixture("<p>İ a.b A.B axb</p>")
  expect(pageMatches(document.body, "a.b", excluded).map((range) => range.toString())).toEqual(["a.b", "A.B"])
})

test("respects line breaks and collapsed details", () => {
  const excluded = fixture("<p>first<br>second</p><details><summary>visible</summary><p>needle</p></details>")
  expect(pageMatches(document.body, "firstsecond", excluded)).toEqual([])
  expect(pageMatches(document.body, "needle", excluded)).toEqual([])
  document.querySelector("details")!.open = true
  expect(pageMatches(document.body, "needle", excluded).map((range) => range.toString())).toEqual(["needle"])
})
