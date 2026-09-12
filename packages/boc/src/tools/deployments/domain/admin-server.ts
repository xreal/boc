import type { AllowedDevEnvironment } from "./environments"

export const DEPLOYMENT_ADMIN_HOST = "admin.dev.gcp-www"

export function deploymentAdminDirectory(environment: AllowedDevEnvironment) {
  return `/var/www/dev-${environment}.bergfreunde.de`
}

export function deploymentSshCommand(environment: AllowedDevEnvironment) {
  return {
    command: "ssh",
    args: ["-t", DEPLOYMENT_ADMIN_HOST, `cd ${deploymentAdminDirectory(environment)}/ && exec bash -l`],
  }
}
