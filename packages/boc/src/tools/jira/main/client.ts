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
  const request = new URL("/rest/api/3/myself", input.origin.origin)
  if (!isAllowedJiraCloudUrl(input.origin, request)) return failJira("invalid-site")

  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${input.email}:${input.token}`, "utf8").toString("base64")}`,
  }

  const response = await input.fetch(request, { method: "GET", headers, redirect: "error" }).then(
    (value) => value,
    () => undefined,
  )
  if (!response) return failJira("network")
  return readMyselfResponse(response)
}

async function readMyselfResponse(response: Response): Promise<JiraMyselfResult> {
  if (response.headers.get("X-Seraph-LoginReason") === "AUTHENTICATION_DENIED") return failJira("auth")
  if (response.status === 429) return failJira("rate-limit", readRetryAfterSeconds(response.headers.get("Retry-After")))
  if (!response.ok) return failJira(jiraErrorFromHttpStatus(response.status))

  const body = await response.text().then(
    (text) => text,
    () => undefined,
  )
  if (body === undefined) return failJira("malformed")

  const user = Option.getOrUndefined(decodeMyself(body))
  if (!user || user.accountId.trim() === "" || user.displayName.trim() === "") return failJira("malformed")
  return { ok: true, user }
}
