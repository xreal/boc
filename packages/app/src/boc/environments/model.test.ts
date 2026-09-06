import { describe, expect, test } from "bun:test"
import { createBocTranslator } from "@boc/extensions/renderer"
import { environmentFixtures } from "./fixtures"
import {
  environmentDuration,
  environmentPrimaryIntent,
  retryableEnvironmentAction,
  validEnvironmentDomain,
} from "./model"
import { resourceAnnouncement } from "./view"

describe("environment UI states", () => {
  test("covers every realistic fixture with an honest primary action", () => {
    const intent = (environment: (typeof environmentFixtures)[keyof typeof environmentFixtures]) =>
      environmentPrimaryIntent({ settingsReady: true, enabled: true, loading: false, failed: false, environment })

    expect(intent(environmentFixtures.unconfigured)).toBe("setup")
    expect(intent(environmentFixtures.setupRunning)).toBe("details")
    expect(intent(environmentFixtures.setupFailed)).toBe("details")
    expect(intent(environmentFixtures.setupCancelled)).toBe("details")
    expect(intent(environmentFixtures.configuredUnknown)).toBe("open")
    expect(intent(environmentFixtures.stopped)).toBe("start")
    expect(intent(environmentFixtures.running)).toBe("open")
    expect(intent(environmentFixtures.partial)).toBe("details")
    expect(intent(environmentFixtures.invalidAssignment)).toBe("details")
    expect(intent(environmentFixtures.backendUnavailable)).toBe("details")
  })

  test("keeps project configuration and failed inspection distinct", () => {
    expect(
      environmentPrimaryIntent({ settingsReady: false, enabled: false, loading: false, failed: false }),
    ).toBe("checking")
    expect(environmentPrimaryIntent({ settingsReady: true, enabled: false, loading: false, failed: false })).toBe(
      "configure",
    )
    expect(environmentPrimaryIntent({ settingsReady: true, enabled: true, loading: false, failed: true })).toBe(
      "retry-inspect",
    )
  })

  test("retries only a completed unsuccessful operation", () => {
    expect(retryableEnvironmentAction(environmentFixtures.setupFailed)).toBe("setup")
    expect(retryableEnvironmentAction(environmentFixtures.setupCancelled)).toBe("setup")
    expect(retryableEnvironmentAction(environmentFixtures.setupRunning)).toBeUndefined()
    expect(retryableEnvironmentAction(environmentFixtures.running)).toBeUndefined()
  })

  test("provides complete screen reader announcements", () => {
    const t = createBocTranslator(() => "en")
    expect(resourceAnnouncement(t, environmentFixtures.setupRunning, false)).toBe("Setup is running")
    expect(resourceAnnouncement(t, environmentFixtures.setupFailed, false)).toBe("Setup failed")
    expect(resourceAnnouncement(t, environmentFixtures.backendUnavailable, false)).toBe(
      "Environment status is unavailable",
    )
    expect(resourceAnnouncement(t, undefined, true)).toBe("The environment request failed.")
  })
})

describe("environment settings", () => {
  test("accepts hostnames and the devenv default", () => {
    expect(validEnvironmentDomain("")).toBe(true)
    expect(validEnvironmentDomain("shop.localhost")).toBe(true)
    expect(validEnvironmentDomain("feature-204.dev.example.test")).toBe(true)
  })

  test("rejects URLs, ports, paths, spaces, and invalid labels", () => {
    expect(validEnvironmentDomain("https://shop.localhost")).toBe(false)
    expect(validEnvironmentDomain("shop.localhost:8443")).toBe(false)
    expect(validEnvironmentDomain("shop.localhost/path")).toBe(false)
    expect(validEnvironmentDomain("shop local")).toBe(false)
    expect(validEnvironmentDomain("-shop.localhost")).toBe(false)
    expect(validEnvironmentDomain("shop-.localhost")).toBe(false)
  })

  test("formats runtime without locale-dependent fragments", () => {
    expect(environmentDuration(1_000, 66_000)).toBe("01:05")
    expect(environmentDuration("NaN", 66_000)).toBe("--:--")
  })
})
