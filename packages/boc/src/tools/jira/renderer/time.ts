const units = [
  { unit: "year", seconds: 31_536_000 },
  { unit: "month", seconds: 2_592_000 },
  { unit: "week", seconds: 604_800 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
] as const

export function jiraRelativeTime(iso: string | undefined, locale: string, now = Date.now()) {
  if (!iso) return
  // Jira renders zone offsets without a colon (+0000), which not every Date parser accepts.
  const timestamp = Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
  if (Number.isNaN(timestamp)) return
  const seconds = Math.round((timestamp - now) / 1000)
  const match = units.find((entry) => Math.abs(seconds) >= entry.seconds)
  if (!match) return new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" }).format(0, "second")
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" })
  return format.format(Math.trunc(seconds / match.seconds), match.unit)
}
