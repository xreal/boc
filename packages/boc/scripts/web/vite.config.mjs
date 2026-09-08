import app from "../../../app/vite.config.ts"
import { bocBranding } from "../../../desktop/src/boc/branding-vite.ts"
import { bocProductConfig } from "../../../app/src/boc/product-vite.ts"

const channel = process.env.OPENCODE_CHANNEL === "local" ? "local" : "boc"

export default { ...app, plugins: [bocBranding(channel), ...app.plugins, bocProductConfig(channel)] }
