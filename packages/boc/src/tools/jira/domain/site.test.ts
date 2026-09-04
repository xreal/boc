import { describe, expect, test } from "bun:test"
import { parseJiraCloudSite, isAllowedJiraCloudUrl } from "./site"

describe("parseJiraCloudSite", () => {
  test("accepts a site label, host, and https origin", () => {
    expect(parseJiraCloudSite("Acme")).toEqual({
      site: "acme",
      host: "acme.atlassian.net",
      origin: "https://acme.atlassian.net",
    })
    expect(parseJiraCloudSite("acme.atlassian.net")).toEqual(parseJiraCloudSite("Acme"))
    expect(parseJiraCloudSite("https://ACME.atlassian.net/")).toEqual(parseJiraCloudSite("Acme"))
  })

  test("rejects anything that is not https://<site>.atlassian.net", () => {
    expect(parseJiraCloudSite("")).toBeUndefined()
    expect(parseJiraCloudSite("http://acme.atlassian.net")).toBeUndefined()
    expect(parseJiraCloudSite("https://acme.example.atlassian.net")).toBeUndefined()
    expect(parseJiraCloudSite("https://acme.atlassian.net.evil.com")).toBeUndefined()
    expect(parseJiraCloudSite("https://user:pass@acme.atlassian.net")).toBeUndefined()
    expect(parseJiraCloudSite("https://acme.atlassian.net/rest/api/3/myself")).toBeUndefined()
    expect(parseJiraCloudSite("https://acme.atlassian.net?x=1")).toBeUndefined()
    expect(parseJiraCloudSite("https://jira.example.com")).toBeUndefined()
    expect(parseJiraCloudSite("https://atlassian.net")).toBeUndefined()
    expect(parseJiraCloudSite("javascript:alert(1)")).toBeUndefined()
  })
})

describe("isAllowedJiraCloudUrl", () => {
  const origin = parseJiraCloudSite("acme")!

  test("allows REST paths on the same Jira Cloud origin", () => {
    expect(isAllowedJiraCloudUrl(origin, new URL("https://acme.atlassian.net/rest/api/3/myself"))).toBe(true)
  })

  test("rejects other origins, protocols, and non-REST paths", () => {
    expect(isAllowedJiraCloudUrl(origin, new URL("https://evil.atlassian.net/rest/api/3/myself"))).toBe(false)
    expect(isAllowedJiraCloudUrl(origin, new URL("http://acme.atlassian.net/rest/api/3/myself"))).toBe(false)
    expect(isAllowedJiraCloudUrl(origin, new URL("https://acme.atlassian.net/browse/AB-1"))).toBe(false)
  })
})
