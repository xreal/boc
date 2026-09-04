export const myselfSuccess = {
  accountId: "5b10a2844c20165700ede21g",
  accountType: "atlassian",
  active: true,
  applicationRoles: {
    items: [],
    size: 1,
  },
  avatarUrls: {
    "16x16": "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=16&s=16",
    "24x24": "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=24&s=24",
    "32x32": "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=32&s=32",
    "48x48": "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=48&s=48",
  },
  displayName: "Mia Krystof",
  emailAddress: "mia@example.com",
  groups: {
    items: [],
    size: 3,
  },
  key: "",
  name: "",
  self: "https://acme.atlassian.net/rest/api/3/user?accountId=5b10a2844c20165700ede21g",
  timeZone: "Australia/Sydney",
}

export const myselfMalformed = {
  accountId: 12,
  displayName: { nested: true },
}

export const TOKEN_FIXTURE = "jira-secret-token-value"
export const EMAIL_FIXTURE = "mia@example.com"
export const SITE_FIXTURE = "acme"

export function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

export function myselfSuccessResponse() {
  return jsonResponse(200, myselfSuccess)
}

export function authFailureResponse() {
  return jsonResponse(401, {
    errorMessages: [`Invalid token ${TOKEN_FIXTURE}`],
    message: `Authorization: Basic ${TOKEN_FIXTURE}`,
  })
}

export function permissionFailureResponse() {
  return jsonResponse(403, {
    errorMessages: [`Account cannot access Jira with ${TOKEN_FIXTURE}`],
  })
}

export function malformedResponse() {
  return jsonResponse(200, myselfMalformed)
}

export function rateLimitResponse(retryAfter = 12) {
  return jsonResponse(
    429,
    { message: `Too many requests for ${TOKEN_FIXTURE}` },
    { "Retry-After": String(retryAfter) },
  )
}

export function captchaDeniedResponse() {
  return new Response(JSON.stringify({ message: TOKEN_FIXTURE }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Seraph-LoginReason": "AUTHENTICATION_DENIED",
    },
  })
}

export function fetchScript(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return async (input: string | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input))
    return handler(url, init)
  }
}
