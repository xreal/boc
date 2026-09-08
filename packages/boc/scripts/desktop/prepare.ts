import { prepareBocBuild } from "./prebuild"

const version = process.env.OPENCODE_VERSION
if (!version) throw new Error("OPENCODE_VERSION is required for Boc packaging")
await prepareBocBuild()
const pkg = await Bun.file("./package.json").json()
await Bun.write("./package.json", JSON.stringify({ ...pkg, version }, null, 2) + "\n")
