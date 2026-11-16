import { AppFrame, AppFrameFocus, AppLockup, Button, PageHead, useAppFrame } from "@unicron/ui"
import { AddAccountStep, ProviderList, StorageLine } from "@/features/accounts"

import { firstRunDone, notNow, pickProvider, useFirstRun } from "./first-run"

/**
 * First run (brief X8; ADR-0107), in the focus frame: 432 wide, the lockup at
 * the top of the column, the folio after it. Step 1 picks a provider; step 2
 * is that provider's form, the same one Settings › Accounts opens in its
 * column. There is no third screen: adding the account opens the Inbox.
 */
export function FirstRun() {
  return (
    <AppFrame>
      <FirstRunColumn />
    </AppFrame>
  )
}

function FirstRunColumn() {
  const provider = useFirstRun((s) => s.provider)
  const phone = useAppFrame().phone
  return (
    <AppFrameFocus lockup={<AppLockup name="Vale" />} folio={provider ? "STEP 02 // 02" : "STEP 01 // 02"} aria-label="First run">
      {/* On a phone the step fills the column, so its primary stands at the foot; elsewhere the column centres it. */}
      <div className={phone ? "flex flex-1 flex-col" : "flex flex-col"}>
        {provider ? <AddAccountStep key={provider} preset={provider} where="focus" onBack={() => pickProvider(null)} onAdded={(a) => firstRunDone(a.address)} /> : <Welcome />}
      </div>
    </AppFrameFocus>
  )
}

/**
 * Step 1: where mail and passwords are kept, the six providers (each row is
 * the action, so the step has no primary; decisions §4), what works without
 * an account, and NOT NOW.
 */
function Welcome() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHead overline="Welcome" title="Add your first account." size="sm" />
        <StorageLine bare />
      </div>
      <ProviderList onPick={pickProvider} />
      <div className="flex flex-col items-start gap-4">
        <p className="type-body text-text-secondary">Calendars and notes on this device work without an account.</p>
        <Button variant="ghost" onClick={notNow}>
          Not now
        </Button>
      </div>
    </div>
  )
}
