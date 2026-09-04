import { describe, expect, test } from "bun:test"
import { memoryVault, openToken, sealToken } from "./credentials"
import { TOKEN_FIXTURE } from "../fixtures/http"

describe("Jira token vault", () => {
  test("round-trips a token only as ciphertext", () => {
    const vault = memoryVault()
    const ciphertext = sealToken(vault, TOKEN_FIXTURE)
    expect(ciphertext).toBeTruthy()
    expect(ciphertext).not.toContain(TOKEN_FIXTURE)
    expect(openToken(vault, ciphertext!)).toBe(TOKEN_FIXTURE)
  })

  test("does not persist a token when encryption is unavailable", () => {
    const vault = memoryVault(false)
    expect(sealToken(vault, TOKEN_FIXTURE)).toBeUndefined()
    expect(openToken(vault, "enc:anything")).toBeUndefined()
  })
})
