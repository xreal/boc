import { Button } from "@opencode/ui/button"
import { DialogTitle, DialogHeader } from "@opencode/ui/dialog"
import { JiraDialog } from "./dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { FileIcon } from "@opencode/ui/file-icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import { JIRA_PREVIEW_MAX_BYTES, jiraAttachmentIsImage, type JiraAttachment } from "../domain/issue"
import type { JiraCollaborationApi } from "./resource"
import { jiraConnectionErrorKey } from "./status"

export function JiraAttachments(props: {
  api: JiraCollaborationApi
  issueKey: string
  attachments: readonly JiraAttachment[]
  online: boolean
  t: BocTranslator
}) {
  const dialog = useDialog()
  const [state, setState] = createStore({
    url: "",
    loading: false,
    error: "",
    downloading: "",
    downloadError: "",
    saved: "",
  })
  const request = { id: "" }
  const clear = () => {
    if (request.id)
      void props.api.cancelIssueResourceRead({ resource: "attachment", requestId: request.id }).catch(() => undefined)
    request.id = ""
    if (state.url) URL.revokeObjectURL(state.url)
    setState({ url: "", loading: false })
  }
  onCleanup(clear)

  const load = async (attachment: JiraAttachment) => {
    clear()
    const requestId = `attachment-${crypto.randomUUID()}`
    request.id = requestId
    setState({ loading: true, error: "" })
    const result = await props.api
      .previewAttachment({ issueKey: props.issueKey, attachmentId: attachment.id, requestId })
      .catch(() => ({ ok: false as const, category: "network" as const }))
    if (request.id !== requestId) return
    setState("loading", false)
    if (!result.ok) {
      setState("error", props.t(jiraConnectionErrorKey[result.category]))
      return
    }
    const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0))
    setState("url", URL.createObjectURL(new Blob([bytes], { type: result.mimeType })))
  }

  const download = async (attachment: JiraAttachment) => {
    if (state.downloading) return
    setState({ downloading: attachment.id, downloadError: "", saved: "" })
    const result = await props.api
      .downloadAttachment({
        issueKey: props.issueKey,
        attachmentId: attachment.id,
        requestId: `download-${crypto.randomUUID()}`,
      })
      .catch(() => ({ ok: false as const, category: "network" as const }))
    setState("downloading", "")
    if (!result.ok) setState("downloadError", props.t(jiraConnectionErrorKey[result.category]))
    if (result.ok && result.saved)
      setState("saved", props.t("boc.jira.ticket.attachments.saved", { name: attachment.filename }))
  }

  const open = (attachment: JiraAttachment) => {
    void load(attachment)
    void dialog.push(
      () => (
        <JiraDialog size="x-large" containerClass="jira-attachment-dialog">
          <DialogHeader>
            <DialogTitle>
              <bdi dir="auto">{attachment.filename}</bdi>
            </DialogTitle>
          </DialogHeader>
          <div class="jira-attachment-preview">
            <Show when={state.loading}>
              <Loader />
            </Show>
            <Show when={state.error}>
              <div role="alert" class="flex flex-col items-center gap-3">
                <p>{state.error}</p>
                <Button onClick={() => void load(attachment)} disabled={!props.online}>
                  {props.t("boc.jira.collaboration.retry")}
                </Button>
              </div>
            </Show>
            <Show when={state.url && !state.error}>
              <img
                src={state.url}
                alt={attachment.filename}
                onError={() => setState("error", props.t("boc.jira.ticket.attachments.invalidImage"))}
              />
            </Show>
          </div>
          <div class="flex w-full flex-col gap-2 p-4">
            <Button
              class="self-end"
              onClick={() => void download(attachment)}
              disabled={!props.online || Boolean(state.downloading)}
            >
              {props.t("boc.jira.ticket.attachments.download")}
            </Button>
            <Show when={state.downloadError}>
              <p role="alert">{state.downloadError}</p>
            </Show>
            <p role="status">{state.saved}</p>
          </div>
        </JiraDialog>
      ),
      clear,
    )
  }

  return (
    <Show when={props.attachments.length}>
      <section
        class="jira-ticket-section"
        id="jira-ticket-attachments"
        aria-label={props.t("boc.jira.ticket.attachments")}
      >
        <h3>
          {props.t("boc.jira.ticket.attachments")} <span class="jira-ticket-count">{props.attachments.length}</span>
        </h3>
        <div class="jira-attachment-grid">
          <For each={props.attachments}>
            {(attachment) => {
              const previewable = () => jiraAttachmentIsImage(attachment) && attachment.size <= JIRA_PREVIEW_MAX_BYTES
              return (
                <div class="jira-attachment-card">
                  <button
                    type="button"
                    class="jira-attachment-file"
                    data-jira-attachment={attachment.id}
                    disabled={!props.online || (!previewable() && Boolean(state.downloading))}
                    onClick={() => (previewable() ? open(attachment) : void download(attachment))}
                    aria-label={props.t(
                      previewable()
                        ? "boc.jira.ticket.attachments.preview"
                        : "boc.jira.ticket.attachments.downloadLabel",
                      { name: attachment.filename },
                    )}
                  >
                    <Show
                      when={previewable()}
                      fallback={
                        <span class="jira-attachment-art">
                          <FileIcon
                            node={{ path: attachment.filename, type: "file" }}
                            class="size-8"
                            aria-hidden="true"
                          />
                        </span>
                      }
                    >
                      <AttachmentThumbnail
                        api={props.api}
                        issueKey={props.issueKey}
                        attachment={attachment}
                        online={props.online}
                      />
                    </Show>
                    <bdi dir="auto" class="w-full truncate text-[13px]" title={attachment.filename}>
                      {attachment.filename}
                    </bdi>
                    <span class="text-[12px] text-v2-text-text-muted">{formatSize(attachment.size)}</span>
                  </button>
                  <Button
                    variant="ghost-muted"
                    size="small"
                    disabled={!props.online || Boolean(state.downloading)}
                    onClick={() => void download(attachment)}
                    aria-label={props.t("boc.jira.ticket.attachments.downloadLabel", { name: attachment.filename })}
                  >
                    <Show when={state.downloading === attachment.id} fallback={<Icon name="download" />}>
                      <Loader />
                    </Show>
                    {props.t("boc.jira.ticket.attachments.download")}
                  </Button>
                </div>
              )
            }}
          </For>
        </div>
        <Show when={state.downloadError}>
          <p role="alert" class="text-v2-state-fg-danger">
            {state.downloadError}
          </p>
        </Show>
        <p role="status" class="text-[12px] text-v2-text-text-muted">
          {state.saved}
        </p>
      </section>
    </Show>
  )
}

function AttachmentThumbnail(props: {
  api: JiraCollaborationApi
  issueKey: string
  attachment: JiraAttachment
  online: boolean
}) {
  let element: HTMLSpanElement | undefined
  const [state, setState] = createStore({ visible: false, url: "", failed: false })
  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setState("visible", true)
      observer.disconnect()
    })
    if (element) observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
  createEffect(() => {
    if (!state.visible || !props.online) return
    const requestId = `thumbnail-${crypto.randomUUID()}`
    const request = { cancelled: false, url: "" }
    void props.api
      .previewAttachment({ issueKey: props.issueKey, attachmentId: props.attachment.id, requestId })
      .then((result) => {
        if (request.cancelled) return
        if (!result.ok) {
          setState("failed", true)
          return
        }
        request.url = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0))], {
            type: result.mimeType,
          }),
        )
        setState({ url: request.url, failed: false })
      })
      .catch(() => {
        if (!request.cancelled) setState("failed", true)
      })
    onCleanup(() => {
      request.cancelled = true
      void props.api.cancelIssueResourceRead({ resource: "attachment", requestId }).catch(() => undefined)
      if (request.url) URL.revokeObjectURL(request.url)
    })
  })
  return (
    <span ref={element} class="jira-attachment-art">
      <Show when={state.url && !state.failed} fallback={<Icon name="photo" />}>
        <img src={state.url} alt="" onError={() => setState("failed", true)} />
      </Show>
    </span>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
