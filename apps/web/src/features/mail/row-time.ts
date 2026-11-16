const pad = (n: number) => String(n).padStart(2, "0")
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * A row's time as the frames write it (Mobile / 01; brief 4.0, until Sean
 * answers Q10): the clock today (`09:14`), the weekday this past week
 * (`WED`), the month and day before that (`11.04`), with the year when it
 * is another year (`2025.11.04`). A time still to come (a snooze, a
 * reminder) keeps its clock: `FRI 08:00`. The row sets the capitals.
 */
export function rowTime(secs: number, now = new Date()) {
  const d = new Date(secs * 1000)
  const days = Math.round((dayStart(d) - dayStart(now)) / 86_400_000)
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" })
  const date = `${d.getFullYear() === now.getFullYear() ? "" : `${d.getFullYear()}.`}${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  if (days === 0) return clock(d)
  if (days > 0) return `${days < 7 ? weekday : date} ${clock(d)}`
  return days > -7 ? weekday : date
}

/**
 * How long ago, for the tooltip on a row's time (cross-app settlement, 2026-11-16): the row writes the
 * clock time, its tooltip the relative age in the device's language ("2 hours ago", "yesterday",
 * "in 3 days").
 */
export function relativeAge(secs: number, now = new Date()): string {
  const diff = secs - now.getTime() / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(0, "second")
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour")
  if (abs < 7 * 86_400) return rtf.format(Math.round(diff / 86_400), "day")
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / (7 * 86_400)), "week")
  if (abs < 365 * 86_400) return rtf.format(Math.round(diff / (30 * 86_400)), "month")
  return rtf.format(Math.round(diff / (365 * 86_400)), "year")
}
