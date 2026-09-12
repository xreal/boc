import { Button } from "@opencode/ui/button"
import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import {
  BocHostProvider,
  BocDesktopProvider,
  JiraIssueInspector,
  createBocTranslator,
  createBocDesktopAPI,
  defaultJiraSessionInstructions,
  createJiraAssignments,
  createJiraFixtureApi,
  jiraIssueFixture,
  type JiraFixtureScenario,
} from "@boc/extensions/jira/preview"

function JiraPreview(props: { scenario?: JiraFixtureScenario; sessions?: boolean }) {
  const language = useLanguage()
  const fixture = createJiraFixtureApi(props.scenario)
  const desktop = createBocDesktopAPI(async () => {
    throw new Error("Unexpected fixture RPC")
  })
  const project = { boardId: 84, server: "fixture", directory: "fixture-project" }
  const [view, setView] = createStore({
    issues: [jiraIssueFixture(), jiraIssueFixture("SHOP-618")],
    selected: "SHOP-617",
    online: true,
    wide: true,
    external: "",
    changes: 0,
    started: "",
  })
  const assignments = createJiraAssignments(fixture.api, (url, assignee) => {
    setView("issues", (issues) => issues.map((issue) => (issue.url === url ? { ...issue, assignee } : issue)))
    setView("changes", fixture.calls.assignments.length)
  })
  const issue = () => view.issues.find((issue) => issue.key === view.selected)
  onMount(() => {
    const media = window.matchMedia("(min-width: 56rem)")
    const sync = () => setView("wide", media.matches)
    sync()
    media.addEventListener("change", sync)
    onCleanup(() => media.removeEventListener("change", sync))
  })
  return (
    <BocHostProvider
      value={{
        locale: language.locale,
        platform: "web",
        route: () => ({ type: "boc", id: "jira" }),
        location: () => ({ pathname: "/boc/jira", search: "" }),
        navigate: () => {},
        openExternal: (url) => setView("external", url),
        sessions: props.sessions
          ? {
              projects: () => [{ ...project, label: "Fixture project" }],
              start: async (input) => {
                setView("started", `${input.model.providerID}/${input.model.modelID}`)
              },
              open: async () => {},
            }
          : undefined,
      }}
    >
      <BocDesktopProvider
        value={{
          ...desktop,
          jira: {
            ...desktop.jira,
            getSessionInstructions: async () => defaultJiraSessionInstructions,
            getPreferences: async () => ({ savedBoards: [], projectTargets: [project] }),
            listSessionLinks: async () => [],
          },
        }}
      >
        <div class="flex h-screen flex-col gap-3 bg-v2-background-bg-base p-3 text-v2-text-text-base">
          <div class="flex flex-wrap gap-2">
            <For each={view.issues}>
              {(issue) => <Button onClick={() => setView("selected", issue.key)}>{issue.key}</Button>}
            </For>
            <Button onClick={() => setView("online", !view.online)}>{view.online ? "Go offline" : "Go online"}</Button>
          </div>
          <div class="relative flex min-h-0 flex-1 gap-4">
            <div class="min-w-0 flex-1 text-[13px] leading-[var(--line-height-compact)]">
              <For each={view.issues}>
                {(issue) => (
                  <p aria-label={`Board assignee ${issue.key}`}>
                    {issue.key}: {issue.assignee?.emailAddress ?? "Unassigned"}
                  </p>
                )}
              </For>
              <p aria-label="Assignment calls">{view.changes}</p>
              <Show when={props.sessions}>
                <p aria-label="Started model">{view.started}</p>
              </Show>
              <p aria-label="Opened URL" class="break-all">
                {view.external}
              </p>
            </div>
            <Show when={issue()}>
              {(selected) => (
                <JiraIssueInspector
                  api={fixture.api}
                  assignments={assignments}
                  issueKey={view.selected}
                  boardId={84}
                  issue={selected()}
                  t={createBocTranslator(language.locale)}
                  locale={language.locale()}
                  online={view.online}
                  loading={false}
                  overlay={!view.wide}
                  onClose={() => setView("selected", "")}
                  onOpenExternal={(url) => setView("external", url)}
                />
              )}
            </Show>
          </div>
        </div>
      </BocDesktopProvider>
    </BocHostProvider>
  )
}

export default { title: "Boc/Jira", id: "boc-jira", component: JiraPreview, parameters: { layout: "fullscreen" } }
export const Default = {}
export const Sessions = { args: { sessions: true } }
export const Slow = { args: { scenario: "slow" } }
export const Empty = { args: { scenario: "empty" } }
export const Failed = { args: { scenario: "failed" } }
export const RejectedAssignment = { args: { scenario: "rejected" } }
export const UnknownAssignment = { args: { scenario: "unknown" } }
export const Stale = { args: { scenario: "stale" } }
export const Switching = { args: { scenario: "switching" } }
export const NarrowRtl = { globals: { direction: "rtl", locale: "en", theme: "dark" } }
