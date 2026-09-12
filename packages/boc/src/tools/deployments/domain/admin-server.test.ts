import { describe, expect, test } from "bun:test"
import { deploymentSshCommand } from "./admin-server"

describe("deployment admin server", () => {
  test("opens an interactive shell in the selected system directory", () => {
    expect(deploymentSshCommand("04")).toEqual({
      command: "ssh",
      args: ["-t", "admin.dev.gcp-www", "cd /var/www/dev-04.bergfreunde.de/ && exec bash -l"],
    })
  })
})
