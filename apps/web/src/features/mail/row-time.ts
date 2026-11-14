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
