import { createSignal, Show } from "solid-js"
import { jiraIssueIsSubtask, type JiraBoardIssue } from "../domain/board"

export function JiraIssueTypeIcon(props: {
  issue: Pick<JiraBoardIssue, "issueTypeName" | "issueTypeIconUrl" | "subtask">
}) {
  const [failed, setFailed] = createSignal(false)
  const label = () => props.issue.issueTypeName ?? ""
  return (
    <span class="inline-flex size-4 shrink-0 items-center justify-center" title={label() || undefined}>
      <Show when={props.issue.issueTypeIconUrl && !failed()} fallback={<IssueTypeGlyph issue={props.issue} />}>
        <img
          src={props.issue.issueTypeIconUrl}
          alt=""
          width={16}
          height={16}
          class="size-4"
          draggable={false}
          onError={() => setFailed(true)}
        />
      </Show>
      <Show when={label()}>
        <span class="sr-only">{label()}</span>
      </Show>
    </span>
  )
}

function IssueTypeGlyph(props: { issue: Pick<JiraBoardIssue, "issueTypeName" | "subtask"> }) {
  const kind = () => issueTypeKind(props.issue)
  return (
    <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
      <Show when={kind() === "bug"}>
        <path
          fill="#E5493A"
          d="M10.2 3.1 11 2.3l.8.8-.6.6A3.3 3.3 0 0 1 12.7 6H14v1.2h-1.2v.8H14V9h-1.3c0 .7-.2 1.4-.6 2l.9.9-.8.8-.8-.8A4 4 0 0 1 8 12.7a4 4 0 0 1-3.4-1.8l-.8.8-.8-.8.9-.9a3.7 3.7 0 0 1-.6-2H2V8h1.2v-.8H2V6h1.3a3.3 3.3 0 0 1 1.5-2.3L4.2 3.1l.8-.8.8.8A4 4 0 0 1 8 2.7c.8 0 1.6.2 2.2.6Zm-3.7 3.6h3V5.5h-3v1.2Zm0 2.4h3V7.9h-3v1.2Z"
        />
      </Show>
      <Show when={kind() === "story"}>
        <path fill="#63BA3C" d="M4 2.5h8v11L8 11.2 4 13.5v-11Z" />
      </Show>
      <Show when={kind() === "epic"}>
        <path fill="#904EE2" d="M9.2 1.8 4.5 9h3.1L6.8 14.2 11.5 7H8.4L9.2 1.8Z" />
      </Show>
      <Show when={kind() === "task"}>
        <rect fill="#4BADE8" x="2" y="2" width="12" height="12" rx="1.5" />
        <path fill="#fff" d="M6.1 8.1 7.4 9.4 10.7 6.1 11.6 7 7.4 11.2 5.2 9z" />
      </Show>
      <Show when={kind() === "subtask"}>
        <path fill="#4BADE8" fill-opacity="0.35" d="M2 2h7v2H4v5H2V2Z" />
        <rect fill="#4BADE8" x="5" y="5" width="9" height="9" rx="1.5" />
        <path fill="#fff" d="M7.6 9.4 8.6 10.4 11.2 7.8 12 8.6 8.6 12 6.8 10.2z" />
      </Show>
      <Show when={kind() === "generic"}>
        <path fill="#8590A2" d="M4 2.5h5.2L12 5.3v8.2H4V2.5Zm5.2.9V6H11L9.2 3.4Z" />
      </Show>
    </svg>
  )
}

function issueTypeKind(issue: Pick<JiraBoardIssue, "issueTypeName" | "subtask">) {
  if (jiraIssueIsSubtask(issue)) return "subtask"
  const name = issue.issueTypeName?.toLowerCase().replace(/[\s_-]+/g, "") ?? ""
  if (name.includes("bug")) return "bug"
  if (name.includes("story")) return "story"
  if (name.includes("epic")) return "epic"
  if (name.includes("task")) return "task"
  return "generic"
}
