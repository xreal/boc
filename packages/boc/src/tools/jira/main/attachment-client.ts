import { JIRA_PREVIEW_MAX_BYTES, jiraAttachmentIsImage } from "../domain/issue"
import { failJira, jiraErrorFromHttpStatus, readRetryAfterSeconds } from "../domain/errors"
import type { JiraAttachmentResult, JiraIssueKeyInput } from "../rpcs"
import type { JiraAuth } from "./client"
import { fetchJiraIssue } from "./issue-client"

export async function fetchJiraAttachment(
  auth: JiraAuth,
  input: JiraIssueKeyInput & { attachmentId: string },
  preview = false,
) {
  const issue = await fetchJiraIssue(auth, input.issueKey)
  if (!issue.ok) return issue
  const attachment = issue.issue.attachments.find((item) => item.id === input.attachmentId)
  if (!attachment) return failJira("not-found")
  if (preview && (!jiraAttachmentIsImage(attachment) || attachment.size > JIRA_PREVIEW_MAX_BYTES))
    return failJira("malformed")

  // Jira can stream the content itself. Do not send credentials to a media redirect/CDN.
  const response = await auth
    .fetch(new URL(`/rest/api/3/attachment/content/${attachment.id}?redirect=false`, auth.origin.origin), {
      headers: { Authorization: `Basic ${Buffer.from(`${auth.email}:${auth.token}`, "utf8").toString("base64")}` },
      redirect: "error",
      signal: auth.signal,
    })
    .catch(() => undefined)
  if (!response) return failJira("network")
  if (!response.ok) {
    await response.body?.cancel()
    return failJira(
      jiraErrorFromHttpStatus(response.status),
      readRetryAfterSeconds(response.headers.get("Retry-After")),
    )
  }
  return { ok: true as const, attachment, response }
}

export async function previewJiraAttachment(
  auth: JiraAuth,
  input: JiraIssueKeyInput & { attachmentId: string },
): Promise<JiraAttachmentResult> {
  const result = await fetchJiraAttachment(auth, input, true)
  if (!result.ok) return result
  const reader = result.response.body?.getReader()
  if (!reader) return failJira("network")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > JIRA_PREVIEW_MAX_BYTES) {
        await reader.cancel()
        return failJira("malformed")
      }
      chunks.push(chunk.value)
    }
    return { ok: true, base64: Buffer.concat(chunks).toString("base64"), mimeType: result.attachment.mimeType }
  } catch {
    return failJira("network")
  } finally {
    reader.releaseLock()
  }
}
