import { Button } from "@opencode/ui/button"
import { Dialog, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import {
  BocHostProvider,
  BocDesktopProvider,
  JiraIssueInspector,
  JiraIssueDialog,
  deploymentSystemFixtures,
  createBocTranslator,
  createBocDesktopAPI,
  defaultJiraSessionInstructions,
  createJiraAssignments,
  createJiraFixtureApi,
  jiraIssueFixture,
  type JiraFixtureScenario,
} from "@boc/extensions/jira/preview"

function JiraPreview(props: { scenario?: JiraFixtureScenario; sessions?: boolean; modal?: boolean; long?: boolean }) {
  const language = useLanguage()
  const dialog = useDialog()
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
    opened: "",
    modalOpen: true,
    history: [] as string[],
    scrollPosition: { document: 0, work: 0 },
  })
  const positions = new Map<string, { document: number; work: number }>()
  const navigate = (key: string) => {
    setView("history", (items) => [...items, view.selected])
    if (!view.issues.some((issue) => issue.key === key))
      setView("issues", (issues) => [...issues, jiraIssueFixture(key)])
    setView({ selected: key, scrollPosition: { document: 0, work: 0 } })
  }
  const back = () => {
    const key = view.history.at(-1)
    if (!key) return
    setView({
      selected: key,
      history: view.history.slice(0, -1),
      scrollPosition: positions.get(key) ?? { document: 0, work: 0 },
    })
  }
  const assignments = createJiraAssignments(fixture.api, (url, assignee) => {
    setView("issues", (issues) => issues.map((issue) => (issue.url === url ? { ...issue, assignee } : issue)))
    setView("changes", fixture.calls.assignments.length)
  })
  const issue = () => {
    const issue = view.issues.find((issue) => issue.key === view.selected)
    if (!issue) return
    return {
      ...issue,
      ...(props.scenario === "empty" ? { parent: undefined, attachments: [], links: [], subtasks: [] } : {}),
      ...(props.long
        ? {
            description: `${issue.description}\n\n${Array.from({ length: 15 }, (_, index) => `### Verification ${index + 1}\n\nCheck selection, keyboard navigation, mixed-direction labels, and error recovery.\n\n- Preserve the reader's position.\n- Keep work controls available.`).join("\n\n")}`,
          }
        : {}),
    }
  }
  const inspectorProps = {
    api: fixture.api,
    assignments,
    get issueKey() {
      return view.selected
    },
    boardId: 84,
    get issue() {
      return issue()
    },
    t: createBocTranslator(language.locale),
    get locale() {
      return language.locale()
    },
    get online() {
      return view.online
    },
    loading: false,
    get onBack() {
      return view.history.length ? back : undefined
    },
    onNavigate: navigate,
    get scrollPosition() {
      return view.scrollPosition
    },
    onScroll: (position: { document: number; work: number }) => positions.set(view.selected, position),
    onClose: () => (props.modal ? setView("modalOpen", false) : setView("selected", "")),
    onOpenExternal: (url: string) => setView("external", url),
    deployedSystems: deploymentSystemFixtures.filter((system) => system.ticketKey === "SHOP-617"),
    onDeploy: () =>
      void dialog.push(() => (
        <Dialog>
          <DialogHeader>
            <DialogTitle>Fixture deployment</DialogTitle>
          </DialogHeader>
          <p class="p-4">Deployment remains local to this story.</p>
        </Dialog>
      )),
  }
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
              open: async (_server, sessionID) => {
                setView("opened", sessionID)
              },
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
            listSessionLinks: async ({ issueUrl }) =>
              props.scenario === "empty"
                ? []
                : [
                    {
                      issueUrl,
                      title: "Implement gallery navigation",
                      draftID: "draft-1",
                      sessionID: "session-1",
                      server: "fixture",
                      createdAt: Date.parse("2026-09-10T10:00:00Z"),
                    },
                    {
                      issueUrl,
                      title: "Review keyboard accessibility",
                      draftID: "draft-2",
                      sessionID: "session-2",
                      server: "fixture",
                      createdAt: Date.parse("2026-09-11T10:00:00Z"),
                    },
                  ],
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
          <div class="relative flex min-h-0 flex-1 flex-col gap-4">
            <div class="flex shrink-0 flex-wrap gap-x-4 text-[13px] leading-[var(--line-height-compact)]">
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
              <p aria-label="Opened session">{view.opened}</p>
            </div>
            <Show when={issue()}>
              {(selected) => (
                <Show when={props.modal} fallback={<JiraIssueInspector {...inspectorProps} overlay={!view.wide} />}>
                  <Button onClick={() => setView("modalOpen", true)}>Open ticket</Button>
                  <Show when={view.modalOpen}>
                    <JiraIssueDialog {...inspectorProps} />
                  </Show>
                </Show>
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
export const Modal = { args: { sessions: true, modal: true } }
export const LongTicket = { args: { sessions: true, modal: true, long: true } }
export const Slow = { args: { scenario: "slow" } }
export const Empty = { args: { scenario: "empty" } }
export const Failed = { args: { scenario: "failed" } }
export const RejectedAssignment = { args: { scenario: "rejected" } }
export const UnknownAssignment = { args: { scenario: "unknown" } }
export const Stale = { args: { scenario: "stale" } }
export const Switching = { args: { scenario: "switching" } }
export const NarrowRtl = { globals: { direction: "rtl", locale: "en", theme: "dark" } }
