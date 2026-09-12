import { expect, test } from "bun:test"
import { fetchJiraAttachment, previewJiraAttachment } from "./attachment-client"
import { parseJiraCloudSite } from "../domain/site"
import { issueDetailFixture } from "../fixtures/board"
import { EMAIL_FIXTURE, TOKEN_FIXTURE, fetchScript } from "../fixtures/http"
import { JIRA_PREVIEW_MAX_BYTES } from "../domain/issue"

const origin = parseJiraCloudSite("example")
if (!origin) throw new Error("Invalid fixture site")
const credentials = { origin, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE }
const input = { issueKey: "PLAT-1", attachmentId: "100", requestId: "preview" }
const attachment = { id: "100", filename: "capture.png", mimeType: "image/png", size: 4 }

function issueWithAttachment(value = attachment) {
  return Response.json({ ...issueDetailFixture, fields: { ...issueDetailFixture.fields, attachment: [value] } })
}

test("attachment reads use canonical metadata and stream Jira content without forwarding credentials to redirects", async () => {
  const controller = new AbortController()
  const result = await previewJiraAttachment(
    {
      ...credentials,
      signal: controller.signal,
      fetch: fetchScript((url, init) => {
        if (url.pathname.includes("/issue/")) return issueWithAttachment()
        expect(url.toString()).toBe("https://example.atlassian.net/rest/api/3/attachment/content/100?redirect=false")
        expect(init?.redirect).toBe("error")
        expect(init?.signal).toBe(controller.signal)
        expect(new Headers(init?.headers).get("Authorization")).toStartWith("Basic ")
        return new Response(new Uint8Array([1, 2, 3, 4]))
      }),
    },
    input,
  )
  expect(result).toEqual({ ok: true, base64: "AQIDBA==", mimeType: "image/png" })
  expect(JSON.stringify(result)).not.toContain(TOKEN_FIXTURE)
})

test("unknown IDs and oversized or active-content previews never fetch binary content", async () => {
  for (const value of [
    { ...attachment, id: "101" },
    { ...attachment, size: JIRA_PREVIEW_MAX_BYTES + 1 },
    { ...attachment, mimeType: "image/svg+xml" },
  ]) {
    const paths: string[] = []
    const result = await previewJiraAttachment(
      {
        ...credentials,
        fetch: fetchScript((url) => {
          paths.push(url.pathname)
          return issueWithAttachment(value)
        }),
      },
      input,
    )
    expect(result.ok).toBe(false)
    expect(paths).toHaveLength(1)
  }
})

test("preview bounds apply to streamed bytes even when metadata underreports the size", async () => {
  const result = await previewJiraAttachment(
    {
      ...credentials,
      fetch: fetchScript((url) =>
        url.pathname.includes("/issue/")
          ? issueWithAttachment()
          : new Response(new Uint8Array(JIRA_PREVIEW_MAX_BYTES + 1)),
      ),
    },
    input,
  )
  expect(result).toEqual({ ok: false, category: "malformed" })
})

test("downloads support non-image files and surface permissions or rate limits", async () => {
  for (const status of [200, 403, 429]) {
    const result = await fetchJiraAttachment(
      {
        ...credentials,
        fetch: fetchScript((url) =>
          url.pathname.includes("/issue/")
            ? issueWithAttachment({ ...attachment, mimeType: "application/pdf" })
            : new Response("PDF", { status, headers: { "Retry-After": "5" } }),
        ),
      },
      input,
    )
    if (status === 200) {
      expect(result.ok && (await result.response.text())).toBe("PDF")
      continue
    }
    expect(result).toEqual({ ok: false, category: status === 403 ? "permission" : "rate-limit", retryAfterSeconds: 5 })
  }
})
