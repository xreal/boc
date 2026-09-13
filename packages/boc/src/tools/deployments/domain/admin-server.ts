import type { AllowedDevEnvironment } from "./environments"

export const DEPLOYMENT_ADMIN_HOST = "adminserver.dev.bergfreunde.io"
export const DEPLOYMENT_ADMIN_USER = "bergfreunde"
export const DEPLOYMENT_ADMIN_TARGET = `${DEPLOYMENT_ADMIN_USER}@${DEPLOYMENT_ADMIN_HOST}`

export function deploymentAdminDirectory(environment: AllowedDevEnvironment) {
  return `/var/www/dev-${environment}.bergfreunde.de`
}

export function deploymentSshCommand(environment: AllowedDevEnvironment) {
  return {
    command: "ssh",
    args: ["-t", DEPLOYMENT_ADMIN_TARGET, `cd ${deploymentAdminDirectory(environment)}/ && exec bash -l`],
  }
}
