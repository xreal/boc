const SITE_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type JiraCloudOrigin = {
  site: string
  host: string
  origin: string
}

export function parseJiraCloudSite(input: string): JiraCloudOrigin | undefined {
  const trimmed = input.trim()
  if (!trimmed) return

  const candidate = isBareSiteLabel(trimmed)
    ? `https://${trimmed.toLowerCase()}.atlassian.net`
    : trimmed.includes("://")
      ? trimmed
      : `https://${trimmed}`

  const url = parseHttpsUrl(candidate)
  if (!url) return
  if (url.username !== "" || url.password !== "") return
  if (url.port !== "") return
  if (url.search !== "" || url.hash !== "") return
  if (url.pathname !== "" && url.pathname !== "/") return

  const host = url.hostname.toLowerCase()
  const labels = host.split(".")
  if (labels.length !== 3) return
  if (labels[1] !== "atlassian" || labels[2] !== "net") return

  const site = labels[0]
  if (!site || !SITE_LABEL.test(site)) return

  return {
    site,
    host: `${site}.atlassian.net`,
    origin: `https://${site}.atlassian.net`,
  }
}

export function isAllowedJiraCloudUrl(origin: JiraCloudOrigin, url: URL) {
  if (url.protocol !== "https:") return false
  if (url.username !== "" || url.password !== "") return false
  if (url.port !== "") return false
  if (url.hostname.toLowerCase() !== origin.host) return false
  if (url.origin !== origin.origin) return false
  return url.pathname.startsWith("/rest/")
}

function isBareSiteLabel(value: string) {
  return !value.includes(".") && SITE_LABEL.test(value.toLowerCase())
}

function parseHttpsUrl(value: string) {
  if (!value.startsWith("https://")) return
  if (!URL.canParse(value)) return
  return new URL(value)
}
