import { Option, Schema } from "effect"
import { ALLOWED_DEV_ENVIRONMENTS, isAllowedDevEnvironment, type AllowedDevEnvironment } from "../domain/environments"
import { deriveDeploymentSystem, type DeploymentSystem } from "../domain/systems"

const ArgoApplication = Schema.Struct({
  metadata: Schema.Struct({
    name: Schema.String,
    labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  spec: Schema.Struct({
    destination: Schema.optionalKey(Schema.Struct({ namespace: Schema.optionalKey(Schema.String) })),
    source: Schema.optionalKey(Schema.Struct({ targetRevision: Schema.optionalKey(Schema.String) })),
    syncPolicy: Schema.optionalKey(
      Schema.Struct({
        automated: Schema.optionalKey(
          Schema.NullOr(
            Schema.Struct({
              prune: Schema.optionalKey(Schema.Boolean),
              selfHeal: Schema.optionalKey(Schema.Boolean),
            }),
          ),
        ),
      }),
    ),
  }),
  status: Schema.optionalKey(
    Schema.Struct({
      sync: Schema.optionalKey(
        Schema.Struct({ status: Schema.optionalKey(Schema.String), revision: Schema.optionalKey(Schema.String) }),
      ),
      health: Schema.optionalKey(Schema.Struct({ status: Schema.optionalKey(Schema.String) })),
      history: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({ deployedAt: Schema.optionalKey(Schema.String), revision: Schema.optionalKey(Schema.String) }),
        ),
      ),
    }),
  ),
})

const decodeJsonArray = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))
const decodeApplication = Schema.decodeUnknownOption(ArgoApplication)
const environmentOrder = new Map(ALLOWED_DEV_ENVIRONMENTS.map((environment, index) => [environment, index]))

export type DeploymentApplicationParseResult = {
  systems: readonly DeploymentSystem[]
  rejected: number
}

export function parseArgoApplications(json: string, now = Date.now()): DeploymentApplicationParseResult | undefined {
  const values = Option.getOrUndefined(decodeJsonArray(json))
  if (!values) return undefined

  const projected = values.map((value) => projectApplication(value, now))
  const systems = projected
    .filter((system): system is DeploymentSystem => system !== undefined)
    .sort(
      (left, right) =>
        (environmentOrder.get(left.environment) ?? Number.MAX_SAFE_INTEGER) -
        (environmentOrder.get(right.environment) ?? Number.MAX_SAFE_INTEGER),
    )

  return { systems, rejected: projected.length - systems.length }
}

function projectApplication(value: unknown, now: number): DeploymentSystem | undefined {
  const application = Option.getOrUndefined(decodeApplication(value))
  if (!application) return undefined
  if (
    [application.metadata.name, application.spec.destination?.namespace]
      .filter((identifier): identifier is string => identifier !== undefined)
      .some(identifiesUnsafeTarget)
  ) {
    return undefined
  }
  const environment = applicationEnvironment(application.metadata.labels, [
    application.metadata.name,
    application.spec.destination?.namespace,
  ])
  if (!environment) return undefined

  const deployed = newestDeployment(application.status?.history ?? [])
  const automated = application.spec.syncPolicy?.automated
  return deriveDeploymentSystem(
    {
      environment,
      app: application.metadata.name,
      branch: application.metadata.labels?.branch ?? application.spec.source?.targetRevision,
      deployedRevision: application.status?.sync?.revision ?? deployed?.revision,
      deployedAt: deployed?.deployedAt,
      sync: application.status?.sync?.status,
      health: application.status?.health?.status,
      automated: automated !== undefined && automated !== null,
      prune: automated?.prune,
    },
    now,
  )
}

function applicationEnvironment(
  labels: Readonly<Record<string, string>> | undefined,
  names: readonly (string | undefined)[],
): AllowedDevEnvironment | undefined {
  const label = labels?.environment ?? labels?.env
  if (label && isAllowedDevEnvironment(label)) return label

  return names.flatMap((name) => (name ? [environmentFromName(name)] : [])).find((value) => value !== undefined)
}

function environmentFromName(name: string) {
  const normalized = name.trim().toLowerCase()
  if (isAllowedDevEnvironment(normalized)) return normalized
  const match = normalized.match(/(?:^|-)dev-([a-z0-9]+)(?:-|$)/i)
  const environment = match?.[1]?.toLowerCase()
  return environment && isAllowedDevEnvironment(environment) ? environment : undefined
}

function identifiesUnsafeTarget(value: string) {
  return /(?:^|-)(?:prod|production|stage|staging)(?:-|$)/i.test(value)
}

function newestDeployment(history: readonly { deployedAt?: string; revision?: string }[]) {
  return history
    .filter((entry) => entry.deployedAt && Number.isFinite(Date.parse(entry.deployedAt)))
    .toSorted((left, right) => Date.parse(right.deployedAt!) - Date.parse(left.deployedAt!))[0]
}
