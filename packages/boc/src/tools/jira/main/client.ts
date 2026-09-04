import { Option, Schema } from "effect"
import { failJira, jiraErrorFromHttpStatus, readRetryAfterSeconds, type JiraClientFailure } from "../domain/errors"
import { isAllowedJiraCloudUrl, type JiraCloudOrigin } from "../domain/site"

export type JiraFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export type JiraUser = {
  accountId: string
  displayName: string
  emailAddress?: string
}

export type JiraMyselfResult = { ok: true; user: JiraUser } | JiraClientFailure
export type JiraTextResult = { ok: true; text: string } | JiraClientFailure

const JiraMyself = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
  emailAddress: Schema.optionalKey(Schema.String),
})

const decodeMyself = Schema.decodeUnknownOption(Schema.fromJsonString(JiraMyself))

export async function fetchJiraMyself(input: {
  origin: JiraCloudOrigin
  email: string
  token: string
  fetch: JiraFetch
}): Promise<JiraMyselfResult> {
  const result = await jiraRequest({
    ...input,
    path: "/rest/api/3/myself",
  })
  if (!result.ok) return result

  const user = Option.getOrUndefined(decodeMyself(result.text))
  if (!user || user.accountId.trim() === "" || user.displayName.trim() === "") return failJira("malformed")
  return { ok: true, user }
}

export async function jiraRequest(input: {
  origin: JiraCloudOrigin
  email: string
  token: string
  fetch: JiraFetch
  path: string
  method?: "GET" | "POST"
  query?: Record<string, string | number | undefined>
  body?: unknown
}): Promise<JiraTextResult> {
  const request = jiraUrl(input.origin, input.path, input.query)
  if (!request || !isAllowedJiraCloudUrl(input.origin, request)) return failJira("invalid-site")

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${input.email}:${input.token}`, "utf8").toString("base64")}`,
  }
  if (input.body !== undefined) headers["Content-Type"] = "application/json"

  const response = await input
    .fetch(request, {
      method: input.method ?? "GET",
      headers,
      redirect: "error",
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    })
    .then(
      (value) => value,
      () => undefined,
    )
  if (!response) return failJira("network")
  return readJiraResponse(response)
}

export const decodeUnknownJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

async function readJiraResponse(response: Response): Promise<JiraTextResult> {
  if (response.headers.get("X-Seraph-LoginReason") === "AUTHENTICATION_DENIED") return failJira("auth")
  if (response.status === 429) return failJira("rate-limit", readRetryAfterSeconds(response.headers.get("Retry-After")))
  if (!response.ok) return failJira(jiraErrorFromHttpStatus(response.status))

  const body = await response.text().then(
    (text) => text,
    () => undefined,
  )
  if (body === undefined) return failJira("malformed")
  return { ok: true, text: body }
}

function jiraUrl(origin: JiraCloudOrigin, path: string, query?: Record<string, string | number | undefined>) {
  if (!path.startsWith("/rest/")) return
  const url = new URL(path, origin.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url
}
