import { Schema } from "effect"

export const DEPLOYMENT_KUBE_CONTEXT = "dev"

export const STANDARD_DEV_ENVIRONMENTS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
] as const

export const RESERVED_DEV_ENVIRONMENTS = ["20", "epm", "oms", "sap"] as const

export const ALLOWED_DEV_ENVIRONMENTS = [...STANDARD_DEV_ENVIRONMENTS, ...RESERVED_DEV_ENVIRONMENTS] as const

export const AllowedDevEnvironment = Schema.Literals(ALLOWED_DEV_ENVIRONMENTS)
export type AllowedDevEnvironment = typeof AllowedDevEnvironment.Type

export function isAllowedDevEnvironment(value: string): value is AllowedDevEnvironment {
  return Schema.is(AllowedDevEnvironment)(value)
}

export function isReservedDevEnvironment(environment: AllowedDevEnvironment) {
  return RESERVED_DEV_ENVIRONMENTS.some((reserved) => reserved === environment)
}

export function devSystemName(environment: AllowedDevEnvironment) {
  return `dev-${environment}`
}
