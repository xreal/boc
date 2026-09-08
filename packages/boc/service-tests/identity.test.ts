import { expect, test } from "bun:test"
import { defaultPort, filename } from "../../cli/src/services/service-config"

test("Boc shares the compatible standard managed service identity", () => {
  expect(defaultPort("boc")).toBe(0xc0de)
  expect(filename("boc")).toBe("service.json")
})
