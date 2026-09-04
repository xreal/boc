import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  ALLOWED_DEV_ENVIRONMENTS,
  AllowedDevEnvironment,
  DEPLOYMENT_KUBE_CONTEXT,
  devSystemName,
  isAllowedDevEnvironment,
  isReservedDevEnvironment,
} from "./environments"

describe("deployment environment safety", () => {
  test("accepts exactly the twenty approved development environments", () => {
    expect(ALLOWED_DEV_ENVIRONMENTS).toHaveLength(20)
    expect(ALLOWED_DEV_ENVIRONMENTS.every(isAllowedDevEnvironment)).toBe(true)
    expect(Schema.decodeUnknownSync(Schema.Array(AllowedDevEnvironment))([...ALLOWED_DEV_ENVIRONMENTS])).toEqual(
      ALLOWED_DEV_ENVIRONMENTS,
    )
  })

  test("rejects near misses, traversal, staging, and production identifiers", () => {
    const unsafe = [
      "1",
      "00",
      "17",
      "19",
      "21",
      "DEV-01",
      "dev-01",
      "01 ",
      "../01",
      "01/../prod",
      "stage",
      "staging",
      "prod",
      "production",
      "sap-prod",
    ]

    expect(unsafe.every((environment) => !isAllowedDevEnvironment(environment))).toBe(true)
    for (const environment of unsafe) {
      expect(() => Schema.decodeUnknownSync(AllowedDevEnvironment)(environment)).toThrow()
    }
  })

  test("keeps the target context fixed and labels reserved systems", () => {
    expect(DEPLOYMENT_KUBE_CONTEXT).toBe("dev")
    expect(devSystemName("02")).toBe("dev-02")
    expect(isReservedDevEnvironment("20")).toBe(true)
    expect(isReservedDevEnvironment("sap")).toBe(true)
    expect(isReservedDevEnvironment("02")).toBe(false)
  })
})
