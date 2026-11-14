import { Button, Icon, SectionHeader, useAppFrame } from "@unicron/ui"

/**
 * The head of a screen pushed in Settings › Accounts' column (brief T1;
 * ADR-0104): managing one account, adding one, connecting its calendars. Its
 * name is an overline under the section's own head. Where the section list
 * stands beside the column, a text button leads back to the accounts; on a
 * phone and at medium width the top bar's or the status line's back does.
 */
export function AccountScreenHead({ title, onBack }: { title: string; onBack: () => void }) {
  const frame = useAppFrame()
  return (
    <div className="flex flex-col gap-4 pb-2">
      {frame.split && (
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <Icon name="arrow--left" data-icon="inline-start" />
            Accounts
          </Button>
        </div>
      )}
      <SectionHeader title={title} level={3} />
    </div>
  )
}
