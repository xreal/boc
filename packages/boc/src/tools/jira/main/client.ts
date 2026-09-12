import { Option, Schema } from "effect"
import { failJira, jiraErrorFromHttpStatus, readRetryAfterSeconds, type JiraClientFailure } from "../domain/errors"
import { isAllowedJiraCloudUrl, type JiraCloudOrigin } from "../domain/site"
import type { JiraMutationFailure } from "../domain/issue"

export type JiraFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
export type JiraWait = (milliseconds: number, signal?: AbortSignal) => Promise<void>
export type JiraAuth = {
  origin: JiraCloudOrigin
  email: string
  token: string
  fetch: JiraFetch
  signal?: AbortSignal
  wait?: JiraWait
}

export type JiraUser = {
  accountId: string
  displayName: string
  emailAddress?: string
}

export type JiraMyselfResult = { ok: true; user: JiraUser } | JiraClientFailure
export type JiraTextResult = { ok: true; text: string } | JiraClientFailure

const MAX_SAFE_READ_RETRIES = 2
const MAX_RETRY_AFTER_SECONDS = 30

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
  signal?: AbortSignal
  wait?: JiraWait
}): Promise<JiraMyselfResult> {
  const result = await jiraRequest({
    ...input,
    path: "/rest/api/3/myself",
    retry: "safe-read",
  })
  if (!result.ok) return result

  const user = Option.getOrUndefined(decodeMyself(result.text))
  if (!user || user.accountId.trim() === "" || user.displayName.trim() === "") return failJira("malformed")
  return { ok: true, user }
}

type JiraRequestInput = {
  origin: JiraCloudOrigin
  email: string
  token: string
  fetch: JiraFetch
  path: string
  method?: "GET" | "POST" | "PUT"
  query?: Record<string, string | number | undefined>
  body?: unknown
  retry?: "safe-read" | "write"
  signal?: AbortSignal
  wait?: JiraWait
}

export function jiraRequest(
  input: JiraRequestInput & { retry: "write" },
): Promise<{ ok: true; text: string } | JiraMutationFailure>
export function jiraRequest(input: JiraRequestInput): Promise<JiraTextResult>
export async function jiraRequest(input: JiraRequestInput): Promise<JiraTextResult | JiraMutationFailure> {
  const failure = (category: JiraClientFailure["category"], outcome: JiraMutationFailure["outcome"]) =>
    input.retry === "write" ? { ...failJira(category), outcome } : failJira(category)
  const request = jiraUrl(input.origin, input.path, input.query)
  if (!request || !isAllowedJiraCloudUrl(input.origin, request)) return failure("invalid-site", "rejected")

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${input.email}:${input.token}`, "utf8").toString("base64")}`,
  }
  if (input.body !== undefined) headers["Content-Type"] = "application/json"

  for (let attempt = 0; attempt <= MAX_SAFE_READ_RETRIES; attempt++) {
    if (input.signal?.aborted) return failure("network", "rejected")
    const response = await input
      .fetch(request, {
        method: input.method ?? "GET",
        headers,
        redirect: "error",
        signal: input.retry === "write" ? AbortSignal.timeout(30_000) : input.signal,
        ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      })
      .then(
        (value) => value,
        () => undefined,
      )
    if (!response) return failure("network", "unknown")

    const result = await readJiraResponse(response)
    if (input.retry === "write" && !result.ok) {
      return failure(result.category, response.status >= 400 && response.status < 500 ? "rejected" : "unknown")
    }
    if (result.ok || result.category !== "rate-limit") return result
    if (input.retry !== "safe-read" || attempt === MAX_SAFE_READ_RETRIES) return result
    if (result.retryAfterSeconds === undefined || result.retryAfterSeconds > MAX_RETRY_AFTER_SECONDS) return result

    const waited = await (input.wait ?? waitForRetry)(result.retryAfterSeconds * 1000, input.signal).then(
      () => true,
      () => false,
    )
    if (!waited || input.signal?.aborted) return failJira("network")
  }

  return failJira("network")
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

function waitForRetry(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const finish = () => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener("abort", abort, { once: true })
  })
}
