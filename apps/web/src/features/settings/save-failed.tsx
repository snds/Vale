/**
 * The one critical line under a setting whose save failed (brief T0;
 * cross-app decisions §9): the server's words, read out at once. Draws
 * nothing while the row is fine.
 */
export function SaveFailed({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" data-slot="save-failed" className="type-caption pt-1 text-critical-text">
      {message}
    </p>
  )
}
