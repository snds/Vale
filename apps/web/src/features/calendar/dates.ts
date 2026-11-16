import { create } from "zustand"

// Calendar date math on the device clock. The core speaks seconds since the
// epoch; views think in local days.

export const HOUR = 3600
export const DAY = 86_400

export const secs = (d: Date) => Math.floor(d.getTime() / 1000)
export const fromSecs = (s: number) => new Date(s * 1000)

export function startOfDay(d: Date) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

/** Calendar arithmetic (DST-safe: adds days on the wall clock, not 24h blocks). */
export function addDays(d: Date, n: number) {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

export function addMonths(d: Date, n: number) {
  const c = new Date(d.getFullYear(), d.getMonth() + n, 1)
  // Keep the day when the target month has it (Jan 31 → Feb 28, not Mar 3).
  c.setDate(Math.min(d.getDate(), new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()))
  return c
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Where this device keeps WEEK STARTS (Vale 46; the W4 preference): "0" Sunday, "1" Monday. Unset follows the region. */
export const WEEK_STARTS_KEY = "vale.calendar.weekStarts"

/** The day weeks start on (0 Sunday, 1 Monday) as chosen on this device, or null to follow the region. */
export const useWeekStarts = create<{ day: number | null }>(() => ({ day: storedWeekStart() }))

function storedWeekStart(): number | null {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(WEEK_STARTS_KEY)
    return v === "0" || v === "1" ? Number(v) : null
  } catch {
    return null
  }
}

/** Settings › Calendar › WEEK STARTS: kept on this device, as the theme is. Every week and month follows at once. */
export function setWeekStarts(day: 0 | 1) {
  try {
    localStorage.setItem(WEEK_STARTS_KEY, String(day))
  } catch {
    // A browser that keeps nothing still changes the weeks for this visit.
  }
  useWeekStarts.setState({ day })
}

/** The first day of the week (0 = Sunday): this device's choice, else the region's, via Intl where available. */
export function firstDayOfWeek(): number {
  const chosen = useWeekStarts.getState().day
  return chosen ?? regionFirstDay()
}

/** The region's own first day of the week (0 = Sunday), via Intl where available. */
export function regionFirstDay(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    if (info) return info.firstDay % 7 // Intl uses 1–7 with Monday = 1
  } catch {
    // fall through
  }
  return 0
}

export function startOfWeek(d: Date, first = firstDayOfWeek()) {
  const s = startOfDay(d)
  return addDays(s, -((s.getDay() - first + 7) % 7))
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "2026-10-14" */
export const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** "09:30" */
export const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "2026-10-14" + "09:30" → Date on the device clock. */
export function fromInputs(date: string, time = "00:00") {
  const [y, m, day] = date.split("-").map(Number)
  const [h, min] = time.split(":").map(Number)
  return new Date(y!, (m ?? 1) - 1, day ?? 1, h ?? 0, min ?? 0)
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Minutes past local midnight of `day`, clamped to that day. */
export function minutesInto(day: Date, s: number) {
  const t = fromSecs(s)
  if (t < day) return 0
  if (!sameDay(t, day)) return 24 * 60
  return t.getHours() * 60 + t.getMinutes()
}

export const fmt = {
  time: (s: number) => fromSecs(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  weekdayShort: (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" }),
  dayLong: (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
  monthYear: (d: Date) => d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
  monthDay: (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
}

/** "Today", "Tomorrow", or "Wednesday, October 14". */
export function dayLabel(d: Date, now = new Date()) {
  if (sameDay(d, now)) return "Today"
  if (sameDay(d, addDays(now, 1))) return "Tomorrow"
  if (sameDay(d, addDays(now, -1))) return "Yesterday"
  return fmt.dayLong(d)
}

/** "9:30 – 10:15 AM", "All day", or a multi-day span. */
export function rangeLabel(start: number, end: number, allDay: boolean) {
  const a = fromSecs(start)
  const b = fromSecs(end)
  if (allDay) {
    const last = addDays(b, -1)
    return sameDay(a, last) || last < a ? "All day" : `${fmt.monthDay(a)} – ${fmt.monthDay(last)}`
  }
  if (sameDay(a, b) || end === start) return end === start ? fmt.time(start) : `${fmt.time(start)} – ${fmt.time(end)}`
  return `${fmt.monthDay(a)} ${fmt.time(start)} – ${fmt.monthDay(b)} ${fmt.time(end)}`
}

const two = (n: number) => String(n).padStart(2, "0")

/** A time by the clock, as the frames write one: `16:30`. */
export const clock = (s: number) => {
  const d = fromSecs(s)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** A day as the frames write one in a mono line: `Wed 11.18` (the line sets the capitals). */
export const folio = (d: Date) => `${d.toLocaleDateString(undefined, { weekday: "short" })} ${two(d.getMonth() + 1)}.${two(d.getDate())}`

/** The month and day as Mobile / 08 writes them beside the weekday: `11.12`. */
export const monthDay = (d: Date) => `${two(d.getMonth() + 1)}.${two(d.getDate())}`

/** A range for the status line: `Nov 09 – Nov 15` (the line sets the capitals). */
export function rangeFact(from: Date, last: Date) {
  const one = (d: Date) => `${d.toLocaleDateString(undefined, { month: "short" })} ${two(d.getDate())}`
  return sameDay(from, last) ? one(from) : `${one(from)} – ${one(last)}`
}

/** The ISO week of the week that holds `d`, counted by its Thursday, whichever day the locale starts on: "Week 46". */
export function weekNumber(weekStart: Date) {
  const thursday = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).find((d) => d.getDay() === 4)!
  // Week 1 is the week of the year's first Thursday.
  const jan1 = new Date(thursday.getFullYear(), 0, 1)
  const firstThursday = addDays(jan1, (4 - jan1.getDay() + 7) % 7)
  return 1 + Math.round((startOfDay(thursday).getTime() - startOfDay(firstThursday).getTime()) / (7 * DAY * 1000))
}

/** The occurrences that touch a day: timed ones that overlap it, all-day ones that cover it, and a zero-length one on it. */
export const eventsOn = <T extends { start: number; end: number }>(list: T[], d: Date) =>
  list.filter((o) => o.start < secs(d) + DAY && (o.end > secs(d) || (o.end === o.start && o.start >= secs(d))))
