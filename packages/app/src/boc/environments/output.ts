// Render PTY output as text, keeping line boundaries while removing terminal-only
// cursor, color and hyperlink commands. Strip sequences before control bytes.
export function environmentOutput(value: string) {
  return value
    .replace(/(?:\x1b\]|\x9d)[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[ -/]*[@-Z\\-_]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7e\xa0-\uffff\t]/g, "")
}
