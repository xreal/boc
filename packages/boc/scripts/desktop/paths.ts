import path from "node:path"
import { fileURLToPath } from "node:url"

export const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../desktop")
export const bocResources = path.resolve(desktopDirectory, "../boc/resources")
