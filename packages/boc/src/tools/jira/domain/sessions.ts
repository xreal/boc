import { Model } from "@opencode/schema/model"
import { Option, Schema } from "effect"
import { jiraEnglish } from "../i18n/en"

export const jiraSessionDifficulties = ["low", "default", "high"] as const
export const JiraSessionDifficulty = Schema.Literals(jiraSessionDifficulties)
export type JiraSessionDifficulty = typeof JiraSessionDifficulty.Type

const JiraSessionModelReference = Schema.String.check(Schema.isPattern(/^[^/#]+\/[^#]+(?:#[^#]+)?$/))

export const JiraSessionModelSetting = Schema.Struct({
  model: JiraSessionModelReference,
  preserveOnUpdate: Schema.Boolean,
})
export type JiraSessionModelSetting = typeof JiraSessionModelSetting.Type

export const JiraSessionModels = Schema.Struct({
  low: JiraSessionModelSetting,
  default: JiraSessionModelSetting,
  high: JiraSessionModelSetting,
})
export type JiraSessionModels = typeof JiraSessionModels.Type

export const JiraSessionInstructions = Schema.Struct({
  before: Schema.String,
  after: Schema.String,
  review: Schema.String,
  modelDefaultsVersion: Schema.Number,
  models: JiraSessionModels,
})
export type JiraSessionInstructions = typeof JiraSessionInstructions.Type

// Increment this only when shipped model mappings change so unprotected custom values adopt the new defaults.
export const JIRA_SESSION_MODEL_DEFAULTS_VERSION = 1

export const defaultJiraSessionInstructions: JiraSessionInstructions = {
  before: jiraEnglish["boc.jira.sessions.defaults.before"],
  after: jiraEnglish["boc.jira.sessions.defaults.after"],
  review: jiraEnglish["boc.jira.sessions.defaults.review"],
  modelDefaultsVersion: JIRA_SESSION_MODEL_DEFAULTS_VERSION,
  models: {
    low: { model: "github-copilot/gpt-5.6-luna#xhigh", preserveOnUpdate: false },
    default: { model: "github-copilot/gemini-3.8-flash", preserveOnUpdate: false },
    high: { model: "github-copilot/gpt-5.6-sol#medium", preserveOnUpdate: false },
  },
}

const PreviousJiraSessionInstructions = Schema.Struct({
  before: Schema.String,
  after: Schema.String,
  modelDefaultsVersion: Schema.Number,
  models: JiraSessionModels,
})
const LegacyJiraSessionInstructions = Schema.Struct({ before: Schema.String, after: Schema.String })
const decodeSessionInstructions = Schema.decodeUnknownOption(JiraSessionInstructions)
const decodePreviousSessionInstructions = Schema.decodeUnknownOption(PreviousJiraSessionInstructions)
const decodeLegacySessionInstructions = Schema.decodeUnknownOption(LegacyJiraSessionInstructions)

export function normalizeJiraSessionInstructions(input: unknown): JiraSessionInstructions {
  const current = Option.getOrUndefined(decodeSessionInstructions(input))
  const previous = Option.getOrUndefined(decodePreviousSessionInstructions(input))
  const stored = current ?? (previous ? { ...previous, review: defaultJiraSessionInstructions.review } : undefined)
  if (!stored) {
    const legacy = Option.getOrUndefined(decodeLegacySessionInstructions(input))
    return legacy ? { ...defaultJiraSessionInstructions, ...legacy } : defaultJiraSessionInstructions
  }
  if (stored.modelDefaultsVersion >= JIRA_SESSION_MODEL_DEFAULTS_VERSION) return stored

  return {
    ...stored,
    modelDefaultsVersion: JIRA_SESSION_MODEL_DEFAULTS_VERSION,
    models: {
      low: stored.models.low.preserveOnUpdate ? stored.models.low : defaultJiraSessionInstructions.models.low,
      default: stored.models.default.preserveOnUpdate
        ? stored.models.default
        : defaultJiraSessionInstructions.models.default,
      high: stored.models.high.preserveOnUpdate ? stored.models.high : defaultJiraSessionInstructions.models.high,
    },
  }
}

export function isJiraSessionModelReference(input: string) {
  return /^[^/#]+\/[^#]+(?:#[^#]+)?$/.test(input)
}

export function jiraSessionModel(input: string) {
  const model = Model.Ref.parse(input)
  return {
    providerID: String(model.providerID),
    modelID: String(model.id),
    ...(model.variant ? { variant: String(model.variant) } : {}),
  }
}

export const JiraSessionLink = Schema.Struct({
  issueUrl: Schema.String,
  title: Schema.String,
  draftID: Schema.String,
  server: Schema.String,
  sessionID: Schema.optionalKey(Schema.String),
  createdAt: Schema.Number,
})
export type JiraSessionLink = typeof JiraSessionLink.Type

export function jiraSessionPrompt(
  issue: { key: string; summary: string; url: string; description?: string },
  before: string,
  after: string,
) {
  return [before.trim(), `${issue.key}: ${issue.summary}`, issue.url, issue.description?.trim(), after.trim()]
    .filter(Boolean)
    .join("\n\n")
}

export function jiraPullRequestReviewPrompt(
  issue: { key: string; summary: string; url: string; description?: string },
  pullRequest: { number: number; title: string; url: string; headRefName: string },
  template: string,
) {
  return [
    template.trim(),
    `## ${jiraEnglish["boc.jira.sessions.review.pullRequest"]}\n\n#${pullRequest.number}: ${pullRequest.title}\n\n${pullRequest.url}\n\n${jiraEnglish["boc.jira.sessions.review.sourceBranch"]}: ${pullRequest.headRefName}`,
    `## ${jiraEnglish["boc.jira.sessions.review.ticket"]}\n\n${issue.key}: ${issue.summary}\n\n${issue.url}`,
    issue.description?.trim()
      ? `## ${jiraEnglish["boc.jira.sessions.review.ticketDescription"]}\n\n${issue.description.trim()}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
}
