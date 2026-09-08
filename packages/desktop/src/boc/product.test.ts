import { expect, test } from "bun:test"

test.each(["boc", "local", "dev", "beta", "prod", "latest"])(
  "resolves final Vite product definitions for %s",
  async (channel) => {
    for (const command of ["build", "serve"]) {
      const process = Bun.spawn(["bun", "src/boc/product-check.mjs", command], {
        env: { ...Bun.env, OPENCODE_CHANNEL: channel },
        stdout: "pipe",
        stderr: "pipe",
      })
      const output = await new Response(process.stdout).text()
      const error = await new Response(process.stderr).text()
      expect(await process.exited, output + error).toBe(0)
    }
  },
  20_000,
)
