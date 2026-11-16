/**
 * Whether a value the clipboard refused fits in a toast (Vale 16): two lines at most, as a toast's
 * description shows them. A line is a line break, or about 60 characters of a toast's width.
 */
export const TOAST_LINE = 60

export function fitsInToast(value: string): boolean {
  const lines = value.split(/\r?\n/).reduce((n, line) => n + Math.max(1, Math.ceil(line.length / TOAST_LINE)), 0)
  return lines <= 2
}
