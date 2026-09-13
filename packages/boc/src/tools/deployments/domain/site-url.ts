import { devSystemName, type AllowedDevEnvironment } from "./environments"

export function deploymentSiteUrl(
  environment: AllowedDevEnvironment,
  credentials?: { siteUsername?: string; sitePassword?: string },
) {
  const origin = `${devSystemName(environment)}.bergfreunde.de`
  if (!credentials?.siteUsername || !credentials.sitePassword) return `https://${origin}`
  return `https://${encodeURIComponent(credentials.siteUsername)}:${encodeURIComponent(credentials.sitePassword)}@${origin}`
}
